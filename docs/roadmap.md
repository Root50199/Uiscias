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

| Decision                          | Choice                                                                                     |
| --------------------------------- | ------------------------------------------------------------------------------------------ |
| `.it` storage                     | Commit **latest only** per mod as **plain git files** (no LFS); older versions in releases |
| `manifestCatalog.json` generation | At **release time** in CI, aggregated from committed `config.json`                         |
| Commit hook scope                 | `pre-commit` = validate yaml + regenerate `config.json` + **pack changed mods** + prettier |
| Build script language             | **Node/TypeScript** (legacy PowerShell scripts kept as references)                         |
| Release tooling                   | Conventional Commits + **release-please**                                                  |
| Version bump signal               | `sourceHash` of `data/` + metadata, recorded in `build.lock.json`                          |
| Release runner                    | **`ubuntu-latest`** (packing stays local; no `.exe` in CI)                                 |
| Schema sharing                    | **Copied** into Uiscias and Findias (package later)                                        |
| Variant naming                    | Parent + variants share a prefix (e.g. `BriHpBars` / `BriHpBars1And2`)                     |
| `updateType` enum                 | `stable` \| `volatile` (legacy values migrated)                                            |
| Key casing                        | camelCase: `modId`, `usedFiles`                                                            |
| `ModDescription.md`               | Hand-edited (generation **dropped**)                                                       |
| Client-version freshness          | **Deferred** (`verify-for-version` not ported; PS script + JSON kept for reference)        |

## Phases

### Phase 0 — Schemas & conventions (foundation)

- [ ] Define zod schemas: `configYaml`, `configJson`, `manifestCatalog`,
      `buildLock`.
- [ ] Lock the allowed `findiasTags` set and the `updateType` enum; write the
      legacy-value migration map.
- [ ] Stand up the Node/TS tooling project under `scripts/` (TypeScript, the
      shared schema module, a small mod-discovery + git-diff helper).

_Exit:_ schemas compile and validate the sample mods; a `--changed` helper can
list affected mod folders from a git ref.

### Phase 1 — Migrate inputs

- [ ] Generate `config.yaml` for every existing mod from its current
      `config.json`.
- [ ] Fold `tags.md` / `Tags.md` into `findiasTags`; normalize tag casing;
      remove the `tags.md` files.
- [ ] Rename mismatched variant folders to the shared-prefix convention
      (`HpBars` → `BriHpBars`, `BriHpBar1And2` → `BriHpBars1And2`,
      `BriHpBar1And3` → `BriHpBars1And3`; audit the rest).
- [ ] Normalize legacy keys (`usedfiles` → `usedFiles`, `modID` → `modId`).

_Exit:_ every mod has a schema-valid `config.yaml`; folder names follow the
variant convention.

### Phase 2 — `generate-configs` (Node/TS)

- [ ] Implement deterministic `config.json` generation: validate yaml, scan
      `data/` → sorted `usedFiles`, compute `sourceHash`, set variant flags,
      fixed key order.
- [ ] Scopes: `--all`, `--changed`, `--mods <ids>`.
- [ ] Verify idempotency (re-run = no diff) and incrementality (one mod changed
      = one `config.json` changed).
- [ ] `npm run generate-configs`.

_Exit:_ regenerating all configs yields a clean diff; editing one mod touches
only its `config.json`.

### Phase 3 — `pack` pipeline (Node/TS)

- [ ] Prune each `build/` to the latest `.it` only (plain git, no LFS).
- [ ] Implement bump-by-hash: compare `config.json.sourceHash` vs.
      `build.lock.json.builtFromHash`; repack + increment + rewrite latest `.it` + update lock only when changed.
- [ ] Wrap `mabi-pack2.exe`; scopes `--all`/`--changed`/`--mods`.
- [ ] `npm run pack`.

_Exit:_ packing an unchanged mod is a no-op; a changed mod bumps exactly one
version and leaves a single committed `.it`.

### Phase 4 — Hooks & npm scripts

- [ ] `pre-commit` (for changed mods): validate yaml → `generate-configs` →
      `pack` → `git add` regenerated `config.json` + `.it` + `build.lock.json` →
      prettier (`lint-staged`); fails on invalid yaml.
- [ ] Add npm scripts: `generate-configs`, `pack`, `build-manifest`.
- [ ] Retain legacy PowerShell scripts under `powershell-` prefixed npm scripts
      (`powershell-generate-configs`, `powershell-pack-mods`,
      `powershell-generate-mod-desc`, `powershell-verify-for-version`).

_Exit:_ a normal commit auto-generates configs and packs the changed mods into
the same commit, with no manual steps.

### Phase 5 — Release automation

- [ ] Add release-please config (Conventional Commits → version + release PR +
      GitHub release).
- [ ] Add the asset-assembly workflow (`ubuntu-latest`): glob latest `.it` per
      mod, aggregate `config.json` → `manifestCatalog.json` (group variants,
      stamp `size`), upload `.it` + manifest.
- [ ] Add a **CI drift check** (`ubuntu-latest`, no `.exe`): recompute each mod's
      `sourceHash`, run `generate-configs --check`, and fail the PR if any
      committed `config.json` is stale or any `build.lock.json.builtFromHash`
      no longer matches its mod's `sourceHash` (changed `data/` without a
      repack). Hash-only; backstops `--no-verify` and hook misconfiguration, and
      is the enforcement layer if packing is ever moved out of `pre-commit`.
- [ ] Validate the carry-forward behavior (changing one mod re-ships only that
      mod's new `.it`; others carry forward).

_Exit:_ merging a `feat`/`fix` to `main` produces a release with all current
`.it` files and a schema-valid `manifestCatalog.json`.

### Phase 6 — Findias integration

- [ ] Copy the manifest zod schema into Findias.
- [ ] Implement `ManifestCatalogProvider` (read release `manifestCatalog.json`,
      validate, flatten groups → `CatalogEntry[]`); switch startup wiring to it.
- [ ] UI: variant "pick one" selector per group; cross-group `usedFiles`
      conflict warnings; freshness badge from `updateType`.

_Exit:_ Findias lists mods from the manifest and prevents conflicting installs.

## Deferred / future work

- **Client-version freshness:** port `verify-for-version` /
  `VerifiedForGameVersion.json`, add `lastVerifiedGameVersion` to the manifest,
  and have Findias flag mods not verified for the running client. (PowerShell
  script + JSON are kept in-repo for reference.)
- **`ModDescription.md` formatting tooling:** these files are hand-edited; we may
  later add a linter/formatter for consistency.

## Out of scope (for now)

- Running `mabi-pack2` in CI (kept local; revisit only if needed — would require
  a `windows-latest` runner and the pack key as a secret).
- Publishing the shared schema as a package (copy into both repos for now).
- Auto-updating mods inside Findias (install/update stays user-initiated).
