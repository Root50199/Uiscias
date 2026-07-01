# Packing mods (`.it` files)

This document captures **how Uiscias packs mods with `mabi-pack2.exe`** and, more
importantly, the **constraints** the packer imposes — the things we _can_ and
_cannot_ do. It exists because at least one of these constraints (the output
filename) is non-obvious and, if violated, silently **bricks** a mod in-game.

For the broader build/release design, see [`architecture.md`](./architecture.md).
The packer wrapper lives in `scripts/src/lib/packer.ts`; the bump/version/prune
logic that calls it is in `scripts/src/commands/pack.ts`.

## What packing is

A mod's `data/` folder holds raw game files. `mabi-pack2.exe pack` compresses and
encrypts that folder into a single `.it` package that Mabinogi loads from
`appdata\package`. We invoke it as:

```shell
mabi-pack2.exe pack -i . -o <FinalName>.it -k <PACK_KEY>
```

run from a temp directory that contains a `data/` folder (so packed entries are
rooted at `data/…`). The pack key is a fixed salt stored in `packer.ts`.

## Hard constraints (things we CANNOT do)

### 1. The output name must be the FINAL name — never rename a packed `.it`

**`mabi-pack2` bakes the output filename into the packed `.it`.** If the file is
renamed (or copied to a different name) after packing, the game can no longer
load it — the mod is effectively **bricked**, even though the bytes are otherwise
intact.

Consequences for our tooling:

- The name passed to `mabi-pack2 -o` **must equal** the mod's final filename
  (`Uiscias<ModId>_<version>.it`).
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

### 2. Output is NOT byte-deterministic

Packing the same `data/` twice yields `.it` files of the **same size but
different bytes**. So we **cannot** detect "did this mod change?" by comparing
packed bytes or hashing the `.it`.

Consequence: change detection is driven by a **`sourceHash` of the `data/`
contents** (computed in `scripts/src/lib/hash.ts`, recorded in
`build/build.lock.json`), never by the packed output. See the `pack` section of
[`architecture.md`](./architecture.md#pack).

### 3. Packing requires Windows + the `.exe` (kept local)

`mabi-pack2.exe` is a Windows binary, so packing runs on a maintainer's machine,
not in CI. CI never packs; it only validates hashes (`npm run check`) and
assembles already-committed `.it` files into a release. This is why the pack key
is a local constant and not a CI secret.

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

- Each repack increments the version: `Uiscias<ModId>_<00001→00002>.it`.
- Only the **latest** `.it` is kept in `build/` (older ones are pruned); previous
  versions remain available as immutable GitHub Release assets.

## Practical rules of thumb

| Goal                          | Do                                       | Don't                             |
| ----------------------------- | ---------------------------------------- | --------------------------------- |
| Change a mod's `.it` filename | Repack with the new name as `-o`         | Rename/`mv` the existing `.it`    |
| Move a packed `.it` around    | Copy it, keeping the same basename       | Copy it to a different basename   |
| Detect a mod changed          | Compare `sourceHash` of `data/`          | Diff or hash the packed `.it`     |
| Pack in automation            | Run locally on Windows, commit the `.it` | Try to run `mabi-pack2.exe` in CI |

## If you suspect bricked files

Any `.it` produced by a packer that used a placeholder name (and was then
renamed/copied to its final name) is suspect. To recover:

1. Apply the fix so the packer writes the final basename directly.
2. Run `npm run pack -- --all --force` to regenerate every `.it` cleanly.
3. Spot-check a couple of mods in-game before cutting a release.

Mods that were only **adopted** (their committed `.it` was never repacked by the
broken path) are unaffected.
