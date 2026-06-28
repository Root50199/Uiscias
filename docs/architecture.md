# Uiscias Architecture

This document describes **how the Uiscias mod repository builds, versions, and
publishes mods** from a technical standpoint. It covers the per-mod source
layout, the generated artifacts, the build scripts, the local hooks, and the
release automation that produces the catalog [Findias](https://github.com/tekashi-side/Findias)
consumes.

It is the Uiscias counterpart to Findias's `docs/architecture.md`. For the
_product_ context (what Findias is, how it installs mods, the `.it` naming
rules, and the game's folder structure) read those Findias docs first:

- `Findias/docs/project-overview.md` — what Findias does and the
  `Uiscias<ModFileName>_<number>.it` naming convention.
- `Findias/docs/architecture.md` — Findias's engineering design, including the
  swappable `ModCatalogProvider` seam this repo's release feeds.
- `Findias/docs/game-structure.md` — how Mabinogi loads `.it` files from
  `appdata\package`.

For the phased build-out plan, see [`roadmap.md`](./roadmap.md).

## Goals and constraints

1. **Authoring is human; everything else is generated.** A mod author edits
   exactly one human file (`config.yaml`) and the mod's `data/` contents.
   Every other artifact (`config.json`, the packed `.it`, the release
   `manifestCatalog.json`) is produced by tooling.
2. **Idempotent and incremental.** Running the tooling when nothing has changed
   produces no diff. Running it after a change touches **only** the affected
   mod(s), never the whole repository. This matters because we expect hundreds
   of mods and packing is slow.
3. **No manual release steps.** Merging a `feat`/`fix` to `main` produces a
   GitHub release with all current `.it` assets and a `manifestCatalog.json`,
   with no human dragging files into the GitHub UI.
4. **Findias reads a manifest, not a file listing.** The release ships a single
   `manifestCatalog.json` that fully describes the catalog (metadata, variants,
   conflicts, freshness). Findias's future `ManifestCatalogProvider` reads it
   instead of scraping release asset names.
5. **No hosting cost.** GitHub Releases hosts the `.it` assets and the manifest
   that users/Findias actually download. The repo also commits the latest `.it`
   of each mod as a plain (non-LFS) source-controlled build artifact — see
   [Committing `.it` files](#committing-it-files).

## Repository layout

Every mod is a folder inside the top-level **`mods/`** directory (the rest of the
repo root holds tooling and config: `scripts/`, `docs/`, `package.json`,
`catalog.yaml`, etc.).
The location of `mods/` is defined in exactly one place — `MODS_DIR` /
`getModsRoot` in `scripts/src/lib/repo.ts` — so it can be moved again by editing
that constant alone. There are two mod shapes:

### Single mod (no variants)

```
mods/AchievmentUnhide/
├─ config.yaml            # hand-edited source metadata
├─ config.json            # GENERATED, committed (metadata + usedFiles + sourceHash)
├─ ModDescription.md      # human description (+ images/)
├─ images/                # optional screenshots/gifs
├─ data/                  # raw game files this mod modifies (the pack input)
└─ build/
   ├─ UisciasAchievmentUnhide_00002.it   # GENERATED, committed (latest version only)
   └─ build.lock.json                    # GENERATED: { version, fileName, builtFromHash }
```

### Mod with variants

A variant set is a parent folder with **no `data/`** that holds two or more
variant subfolders. Each variant is a fully self-contained mod (its own
`data/`, `config.yaml`, `config.json`, `build/`). Variants of the same parent
are **mutually exclusive**: they modify the same files, so only one may be
installed at a time.

```
mods/BriHpBars/                  # parent group folder (no data/)
├─ config.yaml                   # group-level metadata (modName, tags, etc.)
├─ config.json                   # GENERATED group config (hasVariants: true)
├─ BriHpBars1And2/               # a variant
│  ├─ config.yaml
│  ├─ config.json                # isVariant: true
│  ├─ data/
│  └─ build/
│     ├─ UisciasBriHpBars1And2_00001.it
│     └─ build.lock.json
└─ BriHpBars1And3/               # another variant
   ├─ config.yaml
   ├─ config.json
   ├─ data/
   └─ build/
      ├─ UisciasBriHpBars1And3_00001.it
      └─ build.lock.json
```

### Variant naming convention (required)

The parent folder and every variant folder **share the parent's prefix**. The
variant id is `<ParentPrefix><VariantSuffix>`. For example, the HP bars group
is `BriHpBars`, with variants `BriHpBars1And2` and `BriHpBars1And3` (the legacy
`HpBars` / `BriHpBar1And2` / `BriHpBar1And3` names are renamed to match). This
keeps grouping derivable from folder names and keeps each variant's `.it`
filename self-describing (`UisciasBriHpBars1And3_00001.it`).

Each variant's `modId` only needs to be **globally unique** (it is the identity
Findias keys on and the `<ModFileName>` segment of the `.it`). The parent's
`modId` is the `groupId`.

## The three artifact tiers

| Tier               | File                       | Authored by        | Committed          | Purpose                                                                                   |
| ------------------ | -------------------------- | ------------------ | ------------------ | ----------------------------------------------------------------------------------------- |
| Source             | `config.yaml`              | Human              | Yes                | The only hand-edited per-mod metadata.                                                    |
| Source             | `catalog.yaml` (repo root) | Human              | Yes                | Catalog-level metadata (game versions) folded into the manifest's `metadata` block.       |
| Source             | `data/`                    | Human              | Yes                | Raw game files; the pack input.                                                           |
| Generated (config) | `config.json`              | `generate-configs` | Yes                | Normalized metadata + `usedFiles` + `sourceHash`. The aggregation input for the manifest. |
| Generated (binary) | `build/Uiscias<id>_<n>.it` | `pack`             | Yes (plain git)    | The packed mod. Latest version only.                                                      |
| Generated (state)  | `build/build.lock.json`    | `pack`             | Yes                | Records the version and the source hash the committed `.it` was built from.               |
| Release            | `manifestCatalog.json`     | release workflow   | Release asset only | The full catalog Findias reads.                                                           |
| Release            | `Uiscias<id>_<n>.it`       | release workflow   | Release asset only | Copies of each mod's latest `.it`.                                                        |

## Data model and schemas

All shapes are validated with **zod**. Because Uiscias and Findias are separate
repos, the schema is **copied** into both for now (a shared `@uiscias/schema`
package is a later option). The schema is the single source of truth; TypeScript
types are derived with `z.infer`.

### `config.yaml` (hand-edited)

```yaml
modId: AchievmentUnhide # MUST equal the folder name
modName: Achievment Unhide # human-readable display name
modAuthor: Root50199
modAdditionalCredits: None
updateType: volatile # one of: stable | volatile
recentUpdateNotes: n/a # optional human note (defaults to "n/a")
findiasTags: # OPTIONAL subset of the allowed tag set (see below)
  - UI
  - QoL
```

For a variant **parent** folder, `config.yaml` carries the group-level
`modName`, `findiasTags`, and credits; it has no `usedFiles` of its own.

`findiasTags` is **optional** and defaults to `[]` (many mods legitimately have
none). Allowed values: `Combat`, `QoL`, `UI`, `Bri Leith`, `Arcana`,
`Lag Helper`, `Fx`, `Zoom`, `FoV`, `Visual Clarity`. Unknown tags fail
validation.

`updateType` is canonicalized to exactly `stable | volatile`. Legacy values
(`evergreen`, `needsmaintenance`, `maintenanceRequired`) are migrated:
`evergreen → stable`, the rest `→ volatile`.

### `config.json` (generated, committed)

```json
{
  "modId": "AchievmentUnhide",
  "modName": "Achievment Unhide",
  "modAuthor": "Root50199",
  "modAdditionalCredits": "None",
  "updateType": "volatile",
  "findiasTags": ["UI", "QoL"],
  "recentUpdateNotes": "n/a",
  "isVariant": false,
  "hasVariants": false,
  "usedFiles": ["data/db/AchievementTable.xml"],
  "sourceHash": "sha256-<hex>"
}
```

- Keys are emitted in a **fixed order** and `usedFiles` is **sorted**, so an
  unchanged mod regenerates byte-identically.
- `usedFiles` is every file under the mod's `data/`, repo-relative, using `/`
  separators. It is the data Findias uses to detect cross-mod file conflicts.
- `sourceHash` is a hash over the mod's `data/` contents (file paths + bytes) —
  the pack input. It is the change signal for packing. Metadata-only edits
  (tags, credits) deliberately do **not** change it, so they never force a
  needless repack/version bump; they still update `config.json` and flow to the
  manifest. A variant-parent (no `data/`) hashes to the empty digest.
- **Key normalization vs. today:** legacy files use `usedfiles` and `modID`;
  the generator standardizes on camelCase `usedFiles` and `modId`.

### `build/build.lock.json` (generated)

```json
{
  "version": 2,
  "fileName": "UisciasAchievmentUnhide_00002.it",
  "builtFromHash": "sha256-<hex>"
}
```

Records which `sourceHash` the committed `.it` was built from. The packer
compares `config.json.sourceHash` against `build.lock.json.builtFromHash` to
decide whether a repack + version bump is required.

### `manifestCatalog.json` (release asset)

The manifest is an object with a `metadata` block and a `modList` of **groups**.
Every entry in `modList` is a group, so Findias has a single code path: a
non-variant mod is simply a group with one variant.

```json
{
  "metadata": {
    "schemaVersion": 1,
    "currentGameVersion": "1.2.4",
    "supportedGameVersion": "1.2.3",
    "generatedAt": "2026-06-27T07:45:00.000Z"
  },
  "modList": [
    {
      "groupId": "AchievmentUnhide",
      "modName": "Achievment Unhide",
      "findiasTags": ["UI", "QoL"],
      "hasVariants": false,
      "mutuallyExclusive": false,
      "variants": [
        {
          "modId": "AchievmentUnhide",
          "modName": "Achievment Unhide",
          "fileName": "UisciasAchievmentUnhide_00002.it",
          "version": 2,
          "size": 20840,
          "updateType": "volatile",
          "usedFiles": ["data/db/AchievementTable.xml"],
          "modAuthor": "Root50199",
          "modAdditionalCredits": "None",
          "recentUpdateNotes": "n/a"
        }
      ]
    },
    {
      "groupId": "BriHpBars",
      "modName": "Bri Hp Bars",
      "findiasTags": ["Combat", "UI", "QoL", "Bri Leith"],
      "hasVariants": true,
      "mutuallyExclusive": true,
      "variants": [
        {
          "modId": "BriHpBars1And2",
          "modName": "Bri Hp Bars 1 And 2",
          "fileName": "UisciasBriHpBars1And2_00001.it",
          "version": 1,
          "size": 8624,
          "updateType": "volatile",
          "usedFiles": ["data/db/Race.xml"],
          "modAuthor": "Root50199",
          "modAdditionalCredits": "None",
          "recentUpdateNotes": "n/a"
        },
        {
          "modId": "BriHpBars1And3",
          "modName": "Bri Hp Bars 1 And 3",
          "fileName": "UisciasBriHpBars1And3_00001.it",
          "version": 1,
          "size": 8624,
          "updateType": "volatile",
          "usedFiles": ["data/db/Race.xml"],
          "modAuthor": "Root50199",
          "modAdditionalCredits": "None",
          "recentUpdateNotes": "n/a"
        }
      ]
    }
  ]
}
```

Design notes:

- The **`metadata`** block carries catalog-wide fields. `currentGameVersion`
  and `supportedGameVersion` are hand-authored in the repo-root `catalog.yaml`
  (see below); `schemaVersion` is a build-tooling constant
  (`MANIFEST_SCHEMA_VERSION`) that lets a consumer detect an incompatible
  format; `generatedAt` is stamped by `build-manifest` at release time. The
  block is open to additional top-level fields later without disturbing
  `modList`.
- Each **variant** carries the real `modId`, `fileName`, and `version` so
  Findias can resolve and download the correct asset (this maps to its
  `CatalogVariant`). It is a bug to share one `modId` across variants.
- `mutuallyExclusive: true` tells Findias to render a "pick one" selector for a
  variant group and prevent installing two variants at once (they touch the
  same `usedFiles`); Findias **auto-switches** — installing one removes the
  previously-installed sibling.
- `usedFiles` enables **cross-mod conflict detection**: Findias prevents two
  **enabled** mods from different groups from modifying the same file, disabling
  the conflicting action and naming the blocker.
- `updateType` is the per-mod **freshness** signal (static: how likely the mod
  breaks on a game patch). The `metadata` block adds a **catalog-wide** version
  signal: `supportedGameVersion` (the client version the catalog is verified
  against) vs. `currentGameVersion` (the latest known client version), which
  Findias can compare to the running client. A finer-grained, **per-variant**
  `lastVerifiedGameVersion` remains **deferred future work** (see
  [Deferred / future work](#deferred--future-work)).

### `catalog.yaml` (hand-edited, repo root)

The catalog-level counterpart to each mod's `config.yaml`: the only hand-edited
metadata that is not per-mod. It lives at the repository root and feeds the
manifest's `metadata` block.

```yaml
currentGameVersion: '1.2.4' # latest known client version
supportedGameVersion: '1.2.3' # client version the catalog is verified for
```

`build-manifest` reads + validates it (`catalogConfigSchema`), then emits these
fields into `metadata` alongside the generated `schemaVersion` and
`generatedAt`. It is **not** part of the per-mod drift check (`npm run check`),
which only validates `config.json`/hashes.

## Tooling layout (where the build code lives)

The new build tooling is **Node/TypeScript** and lives under `scripts/`,
alongside the existing PowerShell scripts (which are **kept as references**, not
deleted). The packer binary stays where it is today.

```
scripts/
├─ src/                         # new Node/TS tooling
│  ├─ schema/                   # zod schemas + z.infer types (copied to Findias)
│  │  ├─ tags.ts                # findiasTags + updateType enums (+ legacy map)
│  │  ├─ configYaml.ts
│  │  ├─ configJson.ts
│  │  ├─ buildLock.ts
│  │  ├─ manifestCatalog.ts
│  │  └─ index.ts               # barrel export
│  ├─ lib/                      # shared helpers
│  │  ├─ repo.ts                # repo root + MODS_DIR/getModsRoot + exclusions
│  │  ├─ mods.ts                # discover mod/variant folders; group detection
│  │  ├─ changed.ts             # git-diff → affected mod set (--changed)
│  │  ├─ scope.ts               # --all/--changed/--mods/--staged/--stage parsing
│  │  ├─ hash.ts                # sourceHash over data/ (CRLF→LF normalized)
│  │  ├─ json.ts                # deterministic, Prettier-stable JSON I/O (BOM-safe)
│  │  ├─ yaml.ts                # YAML I/O (BOM-safe)
│  │  ├─ git.ts                 # git add helpers (for --stage)
│  │  ├─ config.ts             # load yaml / build + read config.json + build.lock
│  │  ├─ humanize.ts            # camelCase modId → display name
│  │  └─ packer.ts              # mabi-pack2.exe wrapper
│  ├─ commands/
│  │  ├─ list.ts                # print discovered mod/group/variant tree
│  │  ├─ changed.ts             # print mods affected by a git scope
│  │  ├─ migrate.ts             # ONE-TIME: legacy config.json + Tags.md → config.yaml
│  │  ├─ generateConfigs.ts
│  │  ├─ pack.ts
│  │  ├─ buildManifest.ts       # release aggregation → manifestCatalog.json (+ --assets)
│  │  └─ check.ts               # CI drift check (hash-only, no packing)
│  ├─ lib/term.ts               # picocolors semantic color helpers
│  └─ index.ts                  # CLI entry (commander: subcommands + scope flags)
├─ Mabi-pack2/                  # mabi-pack2.exe (unchanged)
├─ pack.bat                     # legacy convenience wrapper (kept)
├─ GenerateConfigs.ps1          # LEGACY reference (kept)
├─ Packmods.ps1                 # LEGACY reference (kept)
├─ GenerateModDesc.ps1          # LEGACY reference (kept)
└─ VerifyForCurrentVersion.ps1  # LEGACY reference (kept; functionality deferred)
```

Generated artifacts do **not** live under `scripts/`; they live next to each mod
(`<mod>/config.json`, `<mod>/build/`) as shown in
[Repository layout](#repository-layout). The release-only `manifestCatalog.json`
is produced into the CI workspace and uploaded as a release asset (never
committed).

### CLI parsing & output

The CLI entry (`index.ts`) is built on **commander**: each subcommand declares
its own options (with a shared `withScope` helper for `--all`/`--changed`/
`--staged`/`--base`/`--mods`/`--stage`), so `--help` is generated from the
definitions (no drift), unknown flags error, and option values are validated.
Terminal output uses **picocolors** via `lib/term.ts` (semantic `ok`/`warn`/
`err`/`dim` + glyphs). picocolors auto-detects TTY / `NO_COLOR` / `FORCE_COLOR`,
so commands are colored in a real terminal and on CI runners but degrade to
plain text when piped (e.g. the non-interactive `pre-commit` hook).

### What counts as a mod (discovery & exclusions)

Mod discovery (`lib/mods.ts`) scans the `mods/` directory (resolved via
`getModsRoot`) and treats every folder there as a mod unless it is excluded in
`lib/repo.ts`:

- **`NON_MOD_DIRS`** — non-mod folder names to skip if they ever appear under
  `mods/` (defensive; e.g. `node_modules`). Dot-folders (`.github`, `.husky`,
  `.git`, …) are skipped by the leading-dot rule.
- **`EXCLUDED_MOD_IDS`** — mod-shaped folders to ignore anyway, currently
  `NewModTemplate` (scaffolding, never built or shipped). Add future templates or
  experimental folders here.

Because discovery is confined to `mods/`, repo-root tooling folders (`scripts/`,
`docs/`, config files) are never mistaken for mods.

Excluded folders are skipped by `generate-configs`, `pack`, `check`, and
`build-manifest`, so a template can keep example artifacts without entering the
drift check or any release.

### npm scripts

The new Node commands take the canonical names; the legacy PowerShell scripts
are retained under a `powershell-` prefix so they can still be run if ever
needed:

| Script                          | Runs                                                  |
| ------------------------------- | ----------------------------------------------------- |
| `generate-configs`              | new Node generator (`--all`/`--changed`/`--mods`)     |
| `pack`                          | new Node packer                                       |
| `build-manifest`                | new Node manifest aggregator (used by CI; `--assets`) |
| `check`                         | CI drift check (hash-only; no packing)                |
| `mods`                          | list discovered mods/groups/variants                  |
| `changed`                       | list mods affected by a git scope                     |
| `typecheck`                     | `tsc --noEmit` over the tooling                       |
| `powershell-generate-configs`   | legacy `GenerateConfigs.ps1`                          |
| `powershell-pack-mods`          | legacy `Packmods.ps1`                                 |
| `powershell-generate-mod-desc`  | legacy `GenerateModDesc.ps1`                          |
| `powershell-verify-for-version` | legacy `VerifyForCurrentVersion.ps1`                  |

A one-time `migrate` subcommand also exists (it generated the initial
`config.yaml` files from legacy `config.json` + `Tags.md`); it is not wired to an
npm script because it should not be re-run.

## Build scripts

The active maintainer scripts are **Node/TypeScript** (the legacy interactive
PowerShell + WinForms scripts cannot run unattended in hooks/CI, so they are
retained only as references). They are non-interactive and selectable by scope:
`--all`, `--changed` (diff vs. a git ref), or `--mods <id,id,...>`.

### `generate-configs`

1. Determine the target mod set (`--changed` uses `git diff --name-only` mapped
   to mod folders).
2. For each target: load and **validate** `config.yaml` against the schema
   (fail on unknown tags, bad `updateType`, `modId` ≠ folder name, missing
   required fields).
3. Scan `data/` → `usedFiles` (sorted, `/`-separated, repo-relative).
4. Compute `sourceHash` over the mod's `data/` contents (the pack input).
5. Set `isVariant` / `hasVariants` from folder shape.
6. Emit `config.json` with fixed key order. Unchanged input → identical output.

### `pack`

1. Determine the target mod set (same scoping options).
2. For each target with a `data/`: compare `config.json.sourceHash` to
   `build/build.lock.json.builtFromHash`.
   - Equal → **skip** (no repack, no bump).
   - Missing/different → run `mabi-pack2.exe` against `data/`, increment the
     version, write `build/Uiscias<id>_<nextN>.it`, delete the previous `.it`
     (commit-latest-only), and update `build.lock.json`.
3. Because `mabi-pack2` output is **not byte-deterministic** (verified: identical
   size, differing bytes), the bump decision is driven entirely by `sourceHash`,
   never by comparing packed bytes.

> **Critical packer constraint:** `mabi-pack2` bakes the output filename into the
> `.it`, so a packed file must be written with its **final** name and never
> renamed (copying is fine only if the basename is unchanged) — renaming bricks
> the mod in-game. The full list of packer do's/don'ts lives in
> [`packing.md`](./packing.md).

> "Keep last 3 versions": only the **latest** `.it` is committed per mod. Older
> versions are retained by **release history** (each release is an immutable
> snapshot), which satisfies the retention goal without binary churn in git.

> `ModDescription.md` is **hand-edited**, not generated (there is no reliable
> source to generate it from). Light formatting/consistency tooling for these
> files is a possible future item — see
> [Deferred / future work](#deferred--future-work).

## Local hooks (Git / Husky)

Both config generation **and** packing are automated on commit so a maintainer
never has to remember to run them. Because the work is scoped to the **changed**
mods (typically one), the per-commit cost stays small; the slow path only
appears on bulk changes, which can instead use the explicit `npm run`
all-mods commands.

- **`pre-commit`**: for staged/changed mods, in order —
  1. validate `config.yaml` against the schema (fail the commit on errors),
  2. `generate-configs` (refresh `config.json` + `sourceHash`),
  3. `pack` the changed mods (repack only when `sourceHash` differs from
     `build.lock.json`), writing the new `.it` + `build.lock.json`,
  4. `git add` the regenerated `config.json`, `.it`, and `build.lock.json` so
     they land in the same commit,
  5. run prettier (via `lint-staged`).
     Each maintainer is on Windows with `mabi-pack2.exe` available locally (see the
     environment rules), so packing in the hook is viable.
- The same operations are also available as explicit, all-mods npm commands
  (`npm run generate-configs`, `npm run pack`) for bulk rebuilds or recovery.

### Why `pre-commit` and not `pre-push`

The packed `.it` + `build.lock.json` must land **in the same commit** as the
source change (that is what makes the "glob the newest `.it` from the tree"
release model correct). `pre-commit` runs before the commit is created, so the
hook can `git add` the freshly packed files into it. `pre-push` runs _after_
commits exist, so packing there would either require amending/creating a commit
mid-push (fragile) or push source without its `.it` (breaks the invariant) — so
it is not used.

### Changing the trigger later (and the CI drift check)

The packing **logic** (`npm run pack`) is decoupled from its **trigger** (the
one-line call in `.husky/pre-commit`), so where it runs is cheap to change. If
per-commit packing ever proves too slow, the fallback is to remove packing from
`pre-commit` and have maintainers run `npm run pack` manually — backed by a
**CI drift check** so "manual" never means "forgotten":

- A workflow step (on **`ubuntu-latest`**, no `.exe`) recomputes every mod's
  `sourceHash` and re-runs `generate-configs` in `--check` mode, then fails the
  PR if any committed `config.json` is stale **or** any `build.lock.json`'s
  `builtFromHash` no longer matches its mod's current `sourceHash` (i.e. someone
  changed `data/` but didn't repack).
- This enforces "configs + packing are not optional" via CI, decoupling _that_
  the work is done from _when/where_ it is done. It validates hashes only — it
  never packs — so it stays fast and Windows-free.

The CI drift check is valuable to add even while packing stays in `pre-commit`,
as a backstop against `--no-verify` commits and hook misconfiguration.

## Committing `.it` files

Packed `.it` files are committed to git **as plain files** (no Git LFS), one —
the latest version — per mod's `build/` folder. This is intentional:

- The release workflow can simply **glob the newest `.it` from the tree**, which
  is what makes carry-forward automatic (unchanged mods keep their committed
  `.it`).
- It keeps the toolchain dependency-free (no `git-lfs` install for
  contributors) and avoids GitHub's LFS storage/bandwidth quotas, which would
  cut against the project's no-cost goal.

What users/Findias download are **GitHub Release assets** served from a CDN —
entirely separate from the committed copies — so the in-repo `.it` files are
purely source-controlled build artifacts.

Trade-off: plain git retains every past `.it` revision in history, so the
repository's history will grow over time. Given the files are mostly small and
only the latest is kept in the working tree, this is acceptable. If history size
ever becomes a problem, migrating `.it` to Git LFS (or a history rewrite) is a
future optimization — it does not change any other part of this design.

## Line endings & hash parity

Maintainers are on Windows (often `core.autocrlf=true`) while CI runs on Linux,
so the same source could otherwise differ by `CRLF` vs `LF`. Two measures keep
the generated artifacts and the drift check **byte-identical across platforms**:

- **`.gitattributes`** marks text as `text=auto eol=lf` (so committed
  `config.json`/`config.yaml` match Prettier's `endOfLine: lf`) and marks `.it`
  and game assets (`.dds`, `.pmg`, …) as `binary` so they are never normalized.
- **`sourceHash` normalizes line endings before hashing:** `lib/hash.ts` detects
  text vs binary (NUL-byte check) and converts `CRLF`→`LF` for text files before
  computing the digest. A Windows working tree and a Linux CI checkout therefore
  produce the **same** `sourceHash`, so the drift check never trips on line
  endings alone.

Practically, a maintainer authors files normally — no special steps. A fresh
clone after these settings lands picks up LF in the working tree automatically;
existing clones may show a one-time renormalization, which Prettier/`.gitattributes`
resolve.

## Release automation

Triggered on merges to `main` that include `feat`/`fix` (Conventional Commits).

- **Versioning + release creation:** **release-please** (release-type **`node`**,
  so `package.json` `version` is the single source of truth; baseline tracked in
  `.release-please-manifest.json`) reads commit messages, decides the repo
  version bump, opens/merges a release PR, tags, and creates the GitHub release.
- **Asset assembly (a workflow step, `ubuntu-latest`):** driven by the tooling
  (`npm run build-manifest -- --out manifestCatalog.json --assets release-assets`)
  rather than a raw glob, so the mod-discovery rules (template exclusions, variant
  grouping) apply automatically:
  1. For every shipped mod, read `build/build.lock.json` to find its single
     latest `.it` (this _is_ the current version, so unchanged mods carry forward
     automatically — no need to fetch the previous release) and copy it into
     `release-assets/`.
  2. Aggregate every committed `config.json` into `manifestCatalog.json`,
     grouping variants and stamping each variant's `size` from its `.it` file.
  3. Upload everything in `release-assets/` (all `.it` + `manifestCatalog.json`)
     to the release. A **drift check** (`npm run check`) runs first so a release
     can never ship stale generated files.

Because packing happens locally and the assembly is pure file/JSON work, the
release job runs on **`ubuntu-latest`** (no Windows runner, no `.exe` in CI).
The `mabi-pack2` pack key therefore stays local and is not a CI secret. (GitHub
`windows-latest` runners _can_ execute arbitrary `.exe`, so moving packing into
CI later is possible — it is simply not needed by this design.)

### Carry-forward example

Release `1.0.0` ships:

```
UisciasModExampleFoo_00001.it
UisciasModExampleBar_00001.it
```

A change to `ModExampleFoo` only: `pack` bumps Foo to `_00002` (Bar untouched).
The next release globs the tree and ships:

```
UisciasModExampleFoo_00002.it   # new
UisciasModExampleBar_00001.it   # carried forward unchanged
```

## Findias integration (consumer side)

Findias consumes this via its `ManifestCatalogProvider` (now **implemented**; see
Findias `architecture.md`). The confirmed consumer contract:

1. Read the latest release's `manifestCatalog.json` asset; validate with the
   **copied** zod schema. The artifact is `{ metadata, modList }`, so Findias
   reads `modList` for the groups and `metadata` for catalog-wide info. Findias's
   copy parses **leniently** — `findiasTags` as `string[]` (open, not the closed
   enum), `updateType` with a `volatile` fallback, and passthrough `metadata` — so
   an older Findias can still read a newer manifest. A `MANIFEST_SCHEMA_VERSION`
   guard rejects a manifest whose `metadata.schemaVersion` is too new.
2. Findias keeps the **grouped** shape (`{ metadata, groups }`) end-to-end rather
   than flattening — there is a single catalog source — preserving `groupId` /
   `mutuallyExclusive` / `variants` directly for the UI. The `usedFiles` arrays
   drive cross-mod conflict prevention.
3. UI: variant "pick one" selector per group (auto-switch on install); cross-group
   `usedFiles` conflict prevention that disables enabling actions and names the
   blocking mod; a catalog-wide freshness banner from
   `metadata.supportedGameVersion` vs `metadata.currentGameVersion`, with the
   per-mod `updateType` (stable/volatile) indicator surfaced only while that banner
   is active. (The deferred per-variant verified-version signal can refine this
   later.) A persisted "include prereleases" toggle controls release selection.

## Open items

- **Migration — done.** Every mod now has a schema-valid `config.yaml`;
  `tags.md`/`Tags.md` folded into `findiasTags` and removed; variant folders
  renamed to the shared-prefix convention; legacy `usedfiles`/`modID` keys
  normalized to `usedFiles`/`modId`; each `build/` pruned to the latest `.it`.
- **First live release not yet run.** The release workflow, `release-please`
  config, asset assembly, and drift check are in place but have only been
  verified locally — the end-to-end GitHub release + carry-forward will first
  exercise on a real `feat`/`fix` merge to `main`. Note the
  `.release-please-manifest.json` baseline is `1.0.0`, so the first automated
  release bumps from there (e.g. `1.0.1`/`1.1.0`); to make the _first_ tag itself
  `1.0.0`, add a one-time `release-as: 1.0.0` (or lower the baseline).
- **Phase 6 (Findias consumer) implemented:** the schema is copied into Findias
  and `ManifestCatalogProvider` + the variant/conflict/freshness UI are built. The
  one remaining step is exercising it against a real GitHub release.
- Decide later whether to publish the shared schema as `@uiscias/schema` instead
  of copying it into both repos.

## Deferred / future work

These are intentionally out of scope for the initial build-out:

- **Per-variant client-version freshness.** A catalog-wide signal already
  ships: `metadata.supportedGameVersion` / `metadata.currentGameVersion` (from
  `catalog.yaml`). The finer-grained, **per-variant** signal — the old
  `verify-for-version` script and `VerifiedForGameVersion.json` (client version →
  verified mod ids) — is **not** ported yet. When revisited, each variant gains
  a `lastVerifiedGameVersion` and Findias compares it to the running client to
  flag out-of-date mods. The existing `VerifiedForGameVersion.json` file and the
  `VerifyForCurrentVersion.ps1` script remain in the repo for reference.
- **`ModDescription.md` tooling.** These files are hand-edited for now; we may
  later add tooling to enforce consistent formatting across them.
- **Publishing a shared schema package** (`@uiscias/schema`) instead of copying.
