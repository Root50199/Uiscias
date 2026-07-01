# Uiscias

A collection of `.it` mods for Mabinogi (North America). These mods are intended to increase accessibility and reduce frustration with the client—not to fundamentally change game mechanics.

> **Disclaimer:** All client modifications are against Nexon's Terms of Service. Use at your own risk.

## Installation

Releases contain packed `.it` files ready for use. Place them in `Mabinogi\appdata\package` to install; delete to uninstall.

Source files for building your own `.it` packages live under `mods/` in this repo.

## Repository layout

Mod sources sit in the top-level `mods/` folder. Each mod is a subfolder there.

### Single mod

```text
mods/{ModName}/
  config.yaml   # hand-edited metadata (source of truth)
  config.json   # generated metadata + file hashes (committed)
  README.md     # description and notes (renders on GitHub)
  images/       # optional screenshots and examples
  data/         # game files (pack input)
  build/
    Uiscias{ModName}_00001.it   # generated, committed (latest version only)
    build.lock.json             # generated version lock
```

### Mod with variants

Some mods ship multiple mutually exclusive options (e.g. different resolutions).
The parent folder holds group metadata; each variant is a self-contained subfolder
with its own `data/`, `config.yaml`, `config.json`, `README.md`, and `build/`.

```text
mods/{GroupName}/
  config.yaml
  config.json
  README.md
  {GroupName}VariantA/
    config.yaml
    config.json
    README.md
    data/
    build/
  {GroupName}VariantB/
    ...
```

### Update types

Every mod's `config.json` includes an `updateType` field:

| Value      | Meaning                                                |
| ---------- | ------------------------------------------------------ |
| `stable`   | Rarely or never needs updating after patches (33 mods) |
| `volatile` | Likely needs updating after most patches (7 mods)      |

Mods that require maintenance include notes in their README where possible so you can update them yourself if you have the tools and know-how. I will update them here when I have time, but this is a side project with no guarantees.

See each mod's `README.md` for what it does. Release notes also list mod descriptions.

## Contributing and overlap

I avoid adding mods that already exist in [uotiara](https://github.com/shaggyze/uotiara) unless I have meaningfully changed them myself.

## Useful tools

- [Beyond Compare](https://www.scootersoftware.com/) — diffing and updating mods after patches
- [Everything](https://www.voidtools.com/) — fast file search across the game data folder
- [mabi-pack2](https://github.com/shaggyze/uotiara) — unpacking and repacking `.it` files (from the uotiara repo)
