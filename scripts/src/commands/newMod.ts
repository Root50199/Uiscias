import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { fse, formatText, orderKeys, writeJsonFile, writeYamlFile, relPosix } from '../lib/io';
import { getRepoRoot, getModsRoot } from '../lib/repo';
import { humanizeModId } from '../lib/humanize';
import { ok, err, dim } from '../lib/term';
import { CONFIG_YAML_KEY_ORDER, FINDIAS_TAGS, type ConfigYaml } from '../schema';

/** Folder-name format every mod id must follow (UpperCamelCase / PascalCase). */
const PASCAL_CASE = /^[A-Z][A-Za-z0-9]*$/;

/**
 * Validate a candidate mod id's format. Returns a human-readable error message,
 * or `null` when the name is acceptable. Shared by the CLI-arg and interactive
 * paths so the rules and wording stay in sync.
 */
const validateModIdFormat = (name: string): string | null => {
  if (!name) {
    return 'Mod name cannot be empty.';
  }
  if (!PASCAL_CASE.test(name)) {
    return (
      `Invalid mod name "${name}".\n` +
      '  Mod names must be UpperCamelCase: start with a capital letter and contain\n' +
      '  only letters and digits (no spaces, hyphens, or underscores).\n' +
      `  e.g. "SomeModName"  (not "${name}")`
    );
  }
  return null;
};

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
export const runNewMod = async (opts: NewModOptions): Promise<void> => {
  const repoRoot = getRepoRoot();
  const modsRoot = getModsRoot(repoRoot);
  const exists = (id: string): boolean => fse.pathExistsSync(path.join(modsRoot, id));

  let modId = (opts.name ?? '').trim();

  if (modId) {
    // A name was passed via CLI: validate up front and fail fast. This keeps the
    // command usable in non-interactive contexts (pipes, other scripts, CI).
    const formatError = validateModIdFormat(modId);
    if (formatError) {
      throw new NewModError(formatError);
    }
  } else {
    // No name passed: prompt interactively, re-asking until we get a valid,
    // unused id. Without a TTY there is nobody to answer, so fail fast instead
    // of looping forever on empty stdin.
    if (!input.isTTY) {
      throw new NewModError(
        'Missing mod name.\n  Usage: npm run new-mod <ModName>   (UpperCamelCase, e.g. SomeModName)',
      );
    }

    const rl = readline.createInterface({ input, output });
    try {
      while (!modId) {
        const answer = (
          await rl.question('Enter mod name (UpperCamelCase, e.g. SomeModName): ')
        ).trim();

        const formatError = validateModIdFormat(answer);
        if (formatError) {
          console.error(err(`Error: ${formatError}\n`));
          continue;
        }

        if (exists(answer)) {
          console.error(err(`Error: "${answer}" already exists — choose a different name.\n`));
          continue;
        }

        modId = answer;
      }
    } finally {
      rl.close();
    }
  }

  const modDir = path.join(modsRoot, modId);
  const relDir = relPosix(repoRoot, modDir);
  if (fse.pathExistsSync(modDir)) {
    throw new NewModError(`"${modId}" already exists at ${relDir}/ — refusing to overwrite.`);
  }

  fse.ensureDirSync(path.join(modDir, 'build'));
  fse.ensureDirSync(path.join(modDir, 'data'));

  // config.json: intentionally empty — `generate-configs` (or the pre-commit
  // hook) fills it in once the mod has real data + a finished config.yaml.
  await writeJsonFile(path.join(modDir, 'config.json'), {});

  await writeConfigYamlTemplate(path.join(modDir, 'config.yaml'), modId);
  await writeModDescription(path.join(modDir, 'ModDescription.md'), modId);

  console.log(ok(`Created mod scaffold: ${relDir}/`));
  console.log(dim('  build/              (empty)'));
  console.log(dim('  data/               (empty)'));
  console.log(dim('  config.json         ({})'));
  console.log(dim('  config.yaml         (edit values; trim findiasTags)'));
  console.log(dim('  ModDescription.md   (placeholder)'));
  console.log(
    '\nNext: drop your game files in data/, finish config.yaml, then commit\n' +
      '(the pre-commit hook generates config.json and packs the .it).',
  );
  console.log(
    dim('Note: git does not track empty folders — build/ and data/ appear once you add files.'),
  );
};

/**
 * Emit a `config.yaml` pre-filled with every field and **all** allowed
 * `findiasTags` (sourced from the schema, so new tags appear here automatically)
 * for the author to trim down.
 */
const writeConfigYamlTemplate = async (filepath: string, modId: string): Promise<void> => {
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

  await writeYamlFile(filepath, template);
};

const writeModDescription = async (filepath: string, modId: string): Promise<void> => {
  const formatted = await formatText(
    `# ${modId}\nDescription coming soon.\n`,
    'markdown',
    filepath,
  );
  await fse.outputFile(filepath, formatted, 'utf8');
};
