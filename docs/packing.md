# Packing mods (`.it` files)

This document captures **how Uiscias packs mods with `mabi-patcher.exe`** and,
more importantly, the **constraints** the packer imposes — the things we _can_
and _cannot_ do. It exists because at least one of these constraints (the output
filename) is non-obvious and, if violated, silently **bricks** a mod in-game.

For the broader build/release design, see [`architecture.md`](./architecture.md).
The packer wrapper lives in `scripts/src/lib/packer.ts`; the bump/version/prune
logic that calls it is in `scripts/src/commands/pack.ts`.

## What packing is

A mod's `data/` folder holds raw game files. `mabi-patcher.exe pack` compresses
that folder (and encrypts its metadata, plus payloads when the encoding calls for
it) into a single `.it` package that Mabinogi loads from `appdata\package`.

`scripts/mabi-patcher/` holds:

- `mabi-patcher.exe` — the packer CLI (the `mabi-pack2` project's CLI binary).
- **exactly one** official game archive, `data_<digits>.it`, used as the
  **template**.
- `packData.bat` — the hand-run equivalent of `npm run pack` for one folder.
- `MABI-PATCHER-README.md` — the upstream mabi-patcher docs (CLI flags and pack
  rules).

### Template mode (default)

```shell
mabi-patcher.exe pack -i <mod>/data --wrap-data -o <FinalName>.it --template scripts/mabi-patcher/data_#####.it
```

The template supplies the header and entries salts, cipher, IV, format version,
metadata layout, alignment, padding, footer, path separator style, and which
payloads are encrypted. No salts are passed in this mode.

**One template only.** The pack command looks for files named `data_<digits>.it`
in `scripts/mabi-patcher/` and requires exactly one. The numbers don't reliably
increase between game patches, so it never picks "the highest"; zero or several
candidates fail the pack with an error naming what it found. On a game patch,
replace the template in a single commit (delete the old one, add the new one).

The lookup happens only when a mod actually needs packing, so commits that touch
no mod `data/` never look for a template.

Swapping the template does **not** trigger repacks: change detection hashes only
each mod's `data/`. If a game patch needs every mod re-encoded against the new
template, run `npm run pack -- --all --force`.

### Salt mode (`npm run pack -- --salts`)

```shell
mabi-patcher.exe pack -i <mod>/data --wrap-data -o <FinalName>.it -k <HEADER_SALT> --entries-key <ENTRIES_SALT> --encrypt-files
```

The fallback when no template is available. The two salts (stored in
`packer.ts`, matching `packData.bat`) are the header salt and the entries-table
salt; `--encrypt-files` encrypts file payloads. Template mode can't be combined
with these flags.

### Input layout

`-i` is the mod's own `data/` directory and `--wrap-data` adds the virtual
`data\` root, so packed entries are rooted at `data/…`. Don't also wrap a folder
that already contains a `data/` subfolder.

## Hard constraints (things we CANNOT do)

### 1. The output name must be the FINAL name — never rename a packed `.it`

**The header key is derived from the output filename.** If a packed `.it` is
renamed (or copied to a different name), the game can no longer load it — the mod
is effectively **bricked**, even though the bytes are otherwise intact.

Consequences for our tooling:

- The name passed to `-o` **must equal** the mod's final filename
  (`uiscias<ModId>_<version>.it`). The packer writes it in a temp directory and
  copies it into `build/` under the same name.
- We may **copy** a packed `.it` to another folder **only if the basename stays
  identical** (e.g. temp → `build/`, or `build/` → `release-assets/`). Copying
  preserves bytes and name, so it is safe. **Renaming is not.**
- We must **repack** to change a filename (e.g. on a version bump), never rename
  the previous file.

> Regression history: an earlier version of `packDataFolder` packed to a
> placeholder `out.it` and then copied it to the final name. That copy-with-a-
> different-name bricked any mod packed through it. The wrapper now packs
> directly to the final basename. If you ever see a placeholder output name in
> the packer, that is the bug — fix it.

### 2. The filename must satisfy mabi-patcher's naming rules

A modern `.it` name must start with a **lowercase** ASCII letter, contain only
letters, digits, `_` or `-`, use a lowercase `.it` extension, and sort after
`data` (case-insensitive). That is why managed files are
`uiscias<ModId>_<version>.it` (lowercase `u`).

The prefix is defined once, as `MANAGED_PREFIX` in `scripts/src/lib/itFile.ts`,
and a unit test checks it against these rules. Recognition of existing files
(build folders, lock files, release-asset download counts) matches the prefix
case-insensitively, so files published as `Uiscias<ModId>_<version>.it` still
belong to the same mod.

### 3. Output is NOT byte-deterministic

Packing the same `data/` twice yields `.it` files with **different bytes**. So
we **cannot** detect "did this mod change?" by comparing packed bytes or hashing
the `.it`.

Consequence: change detection is driven by a **`sourceHash` of the `data/`
contents** (computed in `scripts/src/lib/hash.ts`, recorded in
`build/build.lock.json`), never by the packed output. See the `pack` section of
[`architecture.md`](./architecture.md#pack).

### 4. Packing requires Windows + the `.exe` (kept local)

`mabi-patcher.exe` is a Windows binary, so packing runs on a maintainer's
machine, not in CI. CI never packs; it only validates hashes (`npm run check`)
and assembles already-committed `.it` files into a release. This is why the salts
are local constants and not CI secrets.

## What we CAN do safely

- **Copy** a packed `.it` anywhere, as long as the **filename is unchanged**
  (this is how release assets are assembled).
- **Commit** the latest `.it` per mod to git as a plain binary (see
  `.gitattributes`); older versions live in release history.
- **Skip** packing when `build.lock.json.builtFromHash` matches the current
  `sourceHash` (no source change → no repack, no version bump).
- **Adopt** an existing committed `.it` that has no lock yet (write a lock, no
  repack) — used on first run of the new tooling so we don't needlessly rebuild
  legacy-packed files.
- **Force** a clean repack of everything with `npm run pack -- --all --force`.

## Versioning & retention

- Each repack increments the version: `uiscias<ModId>_<00001→00002>.it`.
- The bump is **floored** against `version-ledger.json` (a committed repo-root
  map of modId → highest version ever used), so a wiped `build.lock`/`build/` can
  never restart a modId at a number it has already published. The ledger is
  read/updated by every `pack` run and staged with the `.it`; `check` fails
  (CI-blocking) when a `build.lock` version drops below its ledger floor, naming
  the exact repack command to fix it. See the
  [`version-ledger.json`](./architecture.md#version-ledgerjson-generated-committed--repo-root)
  section for the rationale (Findias can't detect a reused version number).
- Only the **latest** `.it` is kept in `build/` (older ones are pruned, under
  either prefix casing); previous versions remain available as immutable GitHub
  Release assets.

## Practical rules of thumb

| Goal                          | Do                                       | Don't                               |
| ----------------------------- | ---------------------------------------- | ----------------------------------- |
| Change a mod's `.it` filename | Repack with the new name as `-o`         | Rename/`mv` the existing `.it`      |
| Move a packed `.it` around    | Copy it, keeping the same basename       | Copy it to a different basename     |
| Detect a mod changed          | Compare `sourceHash` of `data/`          | Diff or hash the packed `.it`       |
| Update for a game patch       | Replace the one `data_#####.it` template | Keep two templates side by side     |
| Pack in automation            | Run locally on Windows, commit the `.it` | Try to run `mabi-patcher.exe` in CI |

## If you suspect bricked files

Any `.it` produced by a packer that used a placeholder name (and was then
renamed/copied to its final name) is suspect. To recover:

1. Apply the fix so the packer writes the final basename directly.
2. Run `npm run pack -- --all --force` to regenerate every `.it` cleanly.
3. Spot-check a couple of mods in-game before cutting a release.

Mods that were only **adopted** (their committed `.it` was never repacked by the
broken path) are unaffected.
