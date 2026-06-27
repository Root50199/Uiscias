import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import YAML from 'yaml';
import prettier from 'prettier';
import { getRepoRoot, getModsRoot } from '../lib/repo';
import { orderKeys, writeJsonFile } from '../lib/json';
import { humanizeModId } from '../lib/humanize';
import { CONFIG_YAML_KEY_ORDER, FINDIAS_TAGS, type ConfigYaml } from '../schema';

/** Folder-name format every mod id must follow (UpperCamelCase / PascalCase). */
const PASCAL_CASE = /^[A-Z][A-Za-z0-9]*$/;

export interface NewModOptions {
  /** The requested mod id / folder name (raw, unvalidated). */
  name: string | undefined;
}

class NewModError extends Error {}

/**
 * Scaffold a brand-new mod folder at the repo root:
 *
 *   <ModId>/
 *   ├─ build/              (empty)
 *   ├─ data/               (empty)
 *   ├─ config.json         ({})
 *   ├─ config.yaml         (all fields + every allowed tag, for trimming)
 *   └─ ModDescription.md   (title + placeholder)
 *
 * The name must be UpperCamelCase; anything else cancels with a clear message.
 */
export async function runNewMod(opts: NewModOptions): Promise<void> {
  let modId = (opts.name ?? '').trim();

  // If no name was passed via CLI args, prompt the user interactively
  if (!modId) {
    const rl = readline.createInterface({ input, output });

    while (!modId) {
      const answer = await rl.question('Enter mod name (UpperCamelCase, e.g. SomeModName): ');
      const cleanAnswer = answer.trim();

      if (!cleanAnswer) {
        console.log('Error: Mod name cannot be empty.\n');
        continue;
      }

      if (!PASCAL_CASE.test(cleanAnswer)) {
        console.log(
          `Error: Invalid mod name "${cleanAnswer}".\n` +
            'Mod names must start with a capital letter and contain only letters and digits.\n',
        );
        continue;
      }

      modId = cleanAnswer;
    }

    rl.close();
  } else {
    // If a name WAS passed via CLI, validate it immediately as before
    if (!PASCAL_CASE.test(modId)) {
      throw new NewModError(
        `Invalid mod name "${modId}".\n` +
          '  Mod names must be UpperCamelCase: start with a capital letter and contain\n' +
          '  only letters and digits (no spaces, hyphens, or underscores).\n' +
          `  e.g. "SomeModName"  (not "${modId}")`,
      );
    }
  }

  const repoRoot = getRepoRoot();
  const modDir = path.join(getModsRoot(repoRoot), modId);
  const relDir = path.relative(repoRoot, modDir).split(path.sep).join('/');
  if (fs.existsSync(modDir)) {
    throw new NewModError(`"${modId}" already exists at ${relDir}/ — refusing to overwrite.`);
  }

  fs.mkdirSync(path.join(modDir, 'build'), { recursive: true });
  fs.mkdirSync(path.join(modDir, 'data'), { recursive: true });

  // config.json: intentionally empty — `generate-configs` (or the pre-commit
  // hook) fills it in once the mod has real data + a finished config.yaml.
  await writeJsonFile(path.join(modDir, 'config.json'), {});

  await writeConfigYamlTemplate(path.join(modDir, 'config.yaml'), modId);
  await writeModDescription(path.join(modDir, 'ModDescription.md'), modId);

  console.log(`Created mod scaffold: ${relDir}/`);
  console.log('  build/              (empty)');
  console.log('  data/               (empty)');
  console.log('  config.json         ({})');
  console.log('  config.yaml         (edit values; trim findiasTags)');
  console.log('  ModDescription.md   (placeholder)');
  console.log(
    '\nNext: drop your game files in data/, finish config.yaml, then commit\n' +
      '(the pre-commit hook generates config.json and packs the .it).',
  );
  console.log(
    'Note: git does not track empty folders — build/ and data/ appear once you add files.',
  );
}

/**
 * Emit a `config.yaml` pre-filled with every field and **all** allowed
 * `findiasTags` (sourced from the schema, so new tags appear here automatically)
 * for the author to trim down.
 */
async function writeConfigYamlTemplate(filepath: string, modId: string): Promise<void> {
  const template = orderKeys<ConfigYaml>(
    {
      modId,
      modName: humanizeModId(modId),
      modAuthor: 'Root50199',
      modAdditionalCredits: 'None',
      updateType: 'stable',
      recentUpdateNotes: 'n/a',
      findiasTags: [...FINDIAS_TAGS],
    },
    CONFIG_YAML_KEY_ORDER,
  );

  const formatted = await prettier.format(YAML.stringify(template), {
    ...(await prettier.resolveConfig(filepath)),
    parser: 'yaml',
  });
  fs.writeFileSync(filepath, formatted, 'utf8');
}

async function writeModDescription(filepath: string, modId: string): Promise<void> {
  const formatted = await prettier.format(`# ${modId}\nDescription coming soon.\n`, {
    ...(await prettier.resolveConfig(filepath)),
    parser: 'markdown',
  });
  fs.writeFileSync(filepath, formatted, 'utf8');
}
