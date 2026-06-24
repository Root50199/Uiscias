import { runList } from './commands/list';
import { runChanged } from './commands/changed';
import { runGenerateConfigs } from './commands/generateConfigs';
import { runPack } from './commands/pack';
import { runBuildManifest } from './commands/buildManifest';
import { runMigrate } from './commands/migrate';
import { runCheck } from './commands/check';
import { parseScopeArgs } from './lib/scope';

const HELP = `Uiscias build tooling

Usage: tsx scripts/src/index.ts <command> [options]

Commands:
  list                     Print the discovered mod/group/variant structure
  changed [scope]          Print mods affected by a scope (default: --changed)
  generate-configs [scope] Regenerate config.json for the target mods
  pack [scope]             Pack changed mods into build/ (bump-by-hash)
  build-manifest [--out p] [--assets dir]  Aggregate config.json into the manifest
                           (and optionally copy shipped .it + manifest to dir)
  check                    CI drift check: configs + build locks vs. sources
  migrate                  One-time: generate config.yaml from legacy config.json

Scope options:
  --all                    All mods (default for most commands)
  --changed                Mods changed vs. git (use with --staged or --base)
  --staged                 Diff the staged index (pre-commit)
  --base <ref>             Diff against a ref (CI), e.g. origin/main
  --mods <a,b,c>           Explicit mod ids

Other options:
  --check                  generate-configs: verify only, fail if stale
  --out <path>             build-manifest: output path
`;

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);

  switch (command) {
    case 'list':
      runList();
      break;
    case 'changed':
      runChanged(parseScopeArgs(rest));
      break;
    case 'generate-configs':
      await runGenerateConfigs({
        ...parseScopeArgs(rest),
        check: rest.includes('--check'),
      });
      break;
    case 'pack':
      await runPack({ ...parseScopeArgs(rest), force: rest.includes('--force') });
      break;
    case 'build-manifest': {
      const outIdx = rest.indexOf('--out');
      const assetsIdx = rest.indexOf('--assets');
      await runBuildManifest({
        out: outIdx >= 0 ? rest[outIdx + 1] : undefined,
        assets: assetsIdx >= 0 ? rest[assetsIdx + 1] : undefined,
      });
      break;
    }
    case 'migrate':
      await runMigrate();
      break;
    case 'check':
      await runCheck();
      break;
    case undefined:
    case '--help':
    case '-h':
      console.log(HELP);
      break;
    default:
      console.error(`Unknown command: ${command}\n`);
      console.log(HELP);
      process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
