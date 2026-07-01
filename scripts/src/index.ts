import { Command } from 'commander';
import { runList } from './commands/list';
import { runChanged } from './commands/changed';
import { runGenerateConfigs } from './commands/generateConfigs';
import { runPack } from './commands/pack';
import { runBuildManifest } from './commands/buildManifest';
import { runCheck } from './commands/check';
import { runNewMod } from './commands/newMod';
import { err } from './lib/term';
import type { ScopeOptions } from './lib/scope';

/** Parse a `--mods a,b,c` value into a trimmed, non-empty id list. */
const parseMods = (value: string): string[] =>
  value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

/** Attach the shared scope options to a subcommand. */
const withScope = (cmd: Command): Command =>
  cmd
    .option('--all', 'all mods (default)')
    .option('--changed', 'only mods changed vs git')
    .option('--staged', 'diff the staged index (pre-commit)')
    .option('--base <ref>', 'diff against a git ref, e.g. origin/main')
    .option('--mods <csv>', 'explicit mod ids (comma-separated)', parseMods)
    .option('--stage', 'git add regenerated files (pre-commit)');

const program = new Command();

program.name('uiscias').description('Uiscias build tooling').showHelpAfterError();

program
  .command('list')
  .description('Print the discovered mod/group/variant structure')
  .action(() => runList());

withScope(program.command('changed'))
  .description('Print mods affected by a scope (default: --changed)')
  .action((opts: ScopeOptions) => runChanged(opts));

program
  .command('new-mod')
  .description('Scaffold a new mod folder (UpperCamelCase name)')
  .argument('[name]', 'mod id / folder name (UpperCamelCase)')
  .action((name: string | undefined) => runNewMod({ name }));

withScope(program.command('generate-configs'))
  .description('Regenerate config.json for the target mods')
  .option('--check', 'verify only; fail if any config.json is stale')
  .action((opts: ScopeOptions & { check?: boolean }) => runGenerateConfigs(opts));

withScope(program.command('pack'))
  .description('Pack changed mods into build/ (bump-by-hash)')
  .option('--force', 'repack even when the source hash matches')
  .action((opts: ScopeOptions & { force?: boolean }) => runPack(opts));

program
  .command('build-manifest')
  .description('Aggregate config.json into manifestCatalog.json')
  .option('--out <path>', 'output path for the manifest')
  .option('--assets <dir>', 'also copy shipped .it + manifest into this dir')
  .option('--ref <ref>', 'git ref (tag/branch/SHA) to pin image URLs to')
  .action((opts: { out?: string; assets?: string; ref?: string }) => runBuildManifest(opts));

program
  .command('check')
  .description('CI drift check: configs + build locks vs. sources')
  .action(() => runCheck());

program.parseAsync(process.argv).catch((e) => {
  console.error(err(e instanceof Error ? e.message : String(e)));
  process.exitCode = 1;
});
