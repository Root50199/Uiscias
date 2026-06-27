# Uiscias Roadmap

The phased plan to evolve Uiscias from manually packed mods + manual GitHub
releases into an automated, incremental build-and-release pipeline that produces
a `manifestCatalog.json` for Findias to consume.

Read [`architecture.md`](./architecture.md) first for the technical design,
schemas, and conventions referenced below.

## Guiding principles

- One hand-edited source file per mod (`config.yaml`); everything else is
  generated. (`ModDescription.md` is also hand-edited.)
- Idempotent + incremental: no-op runs produce no diff; changes rebuild only the
  affected mods.
- Commits auto-generate configs **and** pack changed mods, scoped to what
  changed so the per-commit cost stays small.
- Releases are fully automated from Conventional Commit merges to `main`.

## Decisions locked in

| Decision                          | Choice                                                                                        |
| --------------------------------- | --------------------------------------------------------------------------------------------- |
| `.it` storage                     | Commit **latest only** per mod as **plain git files** (no LFS); older versions in releases    |
| `manifestCatalog.json` generation | At **release time** in CI, aggregated from committed `config.json`                            |
| Commit hook scope                 | `pre-commit` = validate yaml + regenerate `config.json` + **pack changed mods** + prettier    |
| Build script language             | **Node/TypeScript** (legacy PowerShell scripts kept as references)                            |
| CLI parsing & color               | **commander** (subcommands + generated help) + **picocolors** (TTY-aware color)               |
| Mod location                      | All mods live under **`mods/`**; single source of truth `MODS_DIR`/`getModsRoot` in `repo.ts` |
| Release tooling                   | Conventional Commits + **release-please**                                                     |
| Version bump signal               | `sourceHash` of `data/` **only** (metadata edits don't repack), recorded in `build.lock.json` |
| Release runner                    | **`ubuntu-latest`** (packing stays local; no `.exe` in CI)                                    |
| Schema sharing                    | **Copied** into Uiscias and Findias (package later)                                           |
| Variant naming                    | Parent + variants share a prefix (e.g. `BriHpBars` / `BriHpBars1And2`)                        |
| `updateType` enum                 | `stable` \| `volatile` (legacy values migrated)                                               |
| Key casing                        | camelCase: `modId`, `usedFiles`                                                               |
| `findiasTags`                     | **Optional** (defaults to `[]`); unknown tags still fail validation                           |
| `ModDescription.md`               | Hand-edited (generation **dropped**)                                                          |
| Release versioning                | `release-please` **`node`** type; version in `package.json`, baseline **`1.0.0`** (fresh)     |
| Excluded folders                  | dot-folders + `NON_MOD_DIRS`; templates via `EXCLUDED_MOD_IDS` (`NewModTemplate`)             |
| Line endings                      | `.gitattributes` (LF text, binary `.it`/assets); hashing normalizes CRLF→LF for parity        |
| Client-version freshness          | **Deferred** (`verify-for-version` not ported; PS script + JSON kept for reference)           |

## Phases

**Status:** Phases 0–5 (the Uiscias producer pipeline) are **complete and
verified locally**. Phase 6 (Findias consumer) is **not started**. The only
unexercised piece is the live GitHub release, which requires a real merge to
`main` (see Phase 5 note).

### Phase 0 — Schemas & conventions (foundation) ✅

- [x] Define zod schemas: `configYaml`, `configJson`, `manifestCatalog`,
      `buildLock` (+ shared `tags`).
- [x] Lock the allowed `findiasTags` set and the `updateType` enum; write the
      legacy-value migration map.
- [x] Stand up the Node/TS tooling project under `scripts/` (TypeScript, the
      shared schema module, a small mod-discovery + git-diff helper).

_Exit:_ schemas compile and validate the sample mods; a `--changed` helper can
list affected mod folders from a git ref. **Done** (typecheck passes;
`npm run mods` / `changed` work).

### Phase 1 — Migrate inputs ✅

- [x] Generate `config.yaml` for every existing mod from its current
      `config.json` (50 files; `migrate` command).
- [x] Fold `tags.md` / `Tags.md` into `findiasTags`; normalize tag casing;
      remove the `tags.md` files (16 removed).
- [x] Rename mismatched variant folders to the shared-prefix convention
      (`HpBars` → `BriHpBars` + variants; `ExpandedAuctionHouse` variants →
      `ExpandedAuctionHouseHighRes` / `…LowRes`; including their committed `.it`).
- [x] Normalize legacy keys (`usedfiles` → `usedFiles`, `modID` → `modId`) — done
      when `generate-configs` rewrites each `config.json`.

_Exit:_ every mod has a schema-valid `config.yaml`; folder names follow the
variant convention. **Done.**

### Phase 2 — `generate-configs` (Node/TS) ✅

- [x] Implement deterministic `config.json` generation: validate yaml, scan
      `data/` → sorted `usedFiles`, compute `sourceHash`, set variant flags,
      fixed key order (Prettier-stable output).
- [x] Scopes: `--all`, `--changed`, `--mods <ids>`.
- [x] Verify idempotency (re-run = no diff) and incrementality (one mod changed
      = one `config.json` changed); `--check` mode added.
- [x] `npm run generate-configs`.

_Exit:_ regenerating all configs yields a clean diff; editing one mod touches
only its `config.json`. **Done** (re-run = 0 written / all unchanged).

### Phase 3 — `pack` pipeline (Node/TS) ✅

- [x] Prune each `build/` to the latest `.it` only (plain git, no LFS).
- [x] Implement bump-by-hash: compare data hash vs.
      `build.lock.json.builtFromHash`; repack + increment + rewrite latest `.it` +
      update lock only when changed. (First run **adopts** an existing committed
      `.it` with no churn; `--force` repacks.)
- [x] Wrap `mabi-pack2.exe`; scopes `--all`/`--changed`/`--mods` (+ `--stage`).
- [x] `npm run pack`.

_Exit:_ packing an unchanged mod is a no-op; a changed mod bumps exactly one
version and leaves a single committed `.it`. **Done** (47 locks written; forced
repack verified; idempotent).

### Phase 4 — Hooks & npm scripts ✅

- [x] `pre-commit` (for changed mods): validate yaml → `generate-configs` →
      `pack` → `git add` regenerated `config.json` + `.it` + `build.lock.json` →
      prettier (`lint-staged`); fails on invalid yaml. (`--stage` does the
      `git add`.)
- [x] Add npm scripts: `generate-configs`, `pack`, `build-manifest` (+ `check`,
      `typecheck`, `mods`, `changed`).
- [x] Retain legacy PowerShell scripts under `powershell-` prefixed npm scripts
      (`powershell-generate-configs`, `powershell-pack-mods`,
      `powershell-generate-mod-desc`, `powershell-verify-for-version`).
- [x] Add `.gitattributes` (LF text, binary `.it`/assets) for cross-platform
      consistency.

_Exit:_ a normal commit auto-generates configs and packs the changed mods into
the same commit, with no manual steps. **Done** (pipeline verified on a staged
change; metadata-only edit regenerated config without repacking).

### Phase 5 — Release automation ✅ (live release unrun)

- [x] Add release-please config (Conventional Commits → version + release PR +
      GitHub release). Uses **`node`** release-type so `package.json` is the
      version source (`.release-please-manifest.json` baseline `1.0.0`).
- [x] Add the asset-assembly workflow (`ubuntu-latest`): aggregate `config.json`
      → `manifestCatalog.json` (group variants, stamp `size`) and collect the
      shipped `.it` files. Implemented as **tooling-driven**
      (`build-manifest --assets`), so excluded mods (templates) are never shipped
      and unchanged mods carry forward automatically.
- [x] Add a **CI drift check** (`ubuntu-latest`, no `.exe`, `npm run check`):
      recompute each mod's data hash, run `generate-configs --check`, and fail the
      PR if any committed `config.json` is stale or any
      `build.lock.json.builtFromHash` no longer matches its mod's hash (changed
      `data/` without a repack). Hash-only; backstops `--no-verify` and hook
      misconfiguration, and is the enforcement layer if packing ever moves out of
      `pre-commit`.
- [~] Validate the carry-forward behavior: the **mechanism** is in place and
  locally verified (each `build/` keeps exactly one latest `.it`; assets are
  assembled from `build.lock`). End-to-end against a live GitHub release is
  **unrun** — it requires a real merge to `main`.

_Exit:_ merging a `feat`/`fix` to `main` produces a release with all current
`.it` files and a schema-valid `manifestCatalog.json`. **Config complete; first
live release pending a real merge.**

### Phase 6 — Findias integration

- [ ] Copy the manifest zod schema into Findias (parse leniently: tolerate
      unknown/new top-level `metadata` fields).
- [ ] Implement `ManifestCatalogProvider` (read release `manifestCatalog.json`,
      validate, read `metadata`, flatten `modList` groups → `CatalogEntry[]`);
      switch startup wiring to it.
- [ ] UI: variant "pick one" selector per group; cross-group `usedFiles`
      conflict warnings; freshness badge from `updateType` and the catalog-wide
      `metadata.supportedGameVersion` vs the running client.

> Manifest shape: as of the metadata wrapper, `manifestCatalog.json` is
> `{ metadata, modList }`. `metadata` carries `schemaVersion`,
> `currentGameVersion`, `supportedGameVersion` (the latter two hand-edited in the
> repo-root `catalog.yaml`), and a build-stamped `generatedAt`.

_Exit:_ Findias lists mods from the manifest and prevents conflicting installs.

## Deferred / future work

- **Per-variant client-version freshness:** a catalog-wide signal already ships
  (`metadata.supportedGameVersion` / `currentGameVersion` from `catalog.yaml`).
  Still deferred is the finer-grained per-variant signal: port
  `verify-for-version` / `VerifiedForGameVersion.json`, add
  `lastVerifiedGameVersion` per variant, and have Findias flag mods not verified
  for the running client. (PowerShell script + JSON are kept in-repo for
  reference.)
- **`ModDescription.md` formatting tooling:** these files are hand-edited; we may
  later add a linter/formatter for consistency.

## Out of scope (for now)

- Running `mabi-pack2` in CI (kept local; revisit only if needed — would require
  a `windows-latest` runner and the pack key as a secret).
- Publishing the shared schema as a package (copy into both repos for now).
- Auto-updating mods inside Findias (install/update stays user-initiated).
