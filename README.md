<!-- markdownlint-disable MD033 MD041 -->
<div align="center">

# Uiscias

**The mod collection behind [Findias](https://github.com/tekashi-side/Findias).**

A curated set of quality-of-life mods for Mabinogi (North America), packed and
published so a companion app can install them for you in one click.

</div>
<!-- markdownlint-enable MD033 MD041 -->

---

## What is Uiscias?

Mabinogi mods are small files (`.it` files) that the game loads from its
`package` folder to change how it looks or behaves — think revamped HP bars,
cleaner UI, skipped cutscenes, and similar tweaks. Uiscias is a **collection of
these mods**, built to increase accessibility and reduce frustration with the
client — _not_ to change core game mechanics.

This repository is really two things:

- **The mods themselves** — the source files for each mod, plus the finished,
  ready-to-use `.it` packages.
- **The maintainer tooling** — scripts that pack the mods, describe them in a
  catalog, and publish everything as a GitHub release.

That published release is what the **[Findias](https://github.com/tekashi-side/Findias)**
app reads to show you a browsable list of mods and install them for you.

> [!WARNING]
> Any client modification is against Nexon's Terms of Service and is used
> **at your own risk**. Uiscias targets Mabinogi (North America).

---

## Just want to use the mods? Use Findias

**Most people should not clone or download this repo.** The easy, supported way
to get these mods is the **[Findias](https://github.com/tekashi-side/Findias)**
desktop app, which reads this collection and installs mods for you:

1. Download the latest Findias installer from its
   [**Releases** page](https://github.com/tekashi-side/Findias/releases/latest).
2. Point it at your Mabinogi folder the first time you open it.
3. Browse the mods, and install / update / remove any of them with a single
   click.

Findias handles keeping mods up to date, avoiding conflicting duplicates, and
picking between mod variants — none of which you get by copying files by hand.

> **Doing it manually anyway?** Each GitHub release here contains the packed
> `.it` files as downloadable assets. To install one by hand, drop it into
> `Mabinogi\appdata\package`; to uninstall, delete it. You are then on your own
> for updates and conflicts, which is exactly what Findias exists to solve.

---

## What's inside

Every mod lives in its own folder under the top-level `mods/` directory. A mod
is either a **single mod** or a **variant group** (several mutually exclusive
options, like different zoom levels, where only one can be installed at a time).

```text
mods/{ModName}/
├─ config.yaml    # hand-edited metadata (source of truth)
├─ config.json    # generated metadata + file hashes (committed)
├─ README.md      # what the mod does and how it's made
├─ images/        # optional screenshots
├─ data/          # the raw game files this mod changes (the pack input)
└─ build/
   ├─ Uiscias{ModName}_00001.it   # generated, committed (latest version only)
   └─ build.lock.json             # generated version lock
```

Each mod also carries an **update type** in its metadata:

| Value      | Meaning                                            |
| ---------- | -------------------------------------------------- |
| `stable`   | Rarely or never needs updating after a game patch. |
| `volatile` | Likely needs updating after most game patches.     |

Volatile mods may lag behind a fresh game patch — this is a side project with no
guarantees. See each mod's `README.md` (and the release notes) for what it does
and any update caveats.

---

## Building the mods yourself

Most people should use Findias (see above). This section is for maintainers and
developers who want to build, pack, or extend the collection.

### Requirements

- **Windows** — packing uses `mabi-pack2.exe` (a Windows binary bundled under
  `scripts/Mabi-pack2/`), so the pack step only runs on Windows.
- **Node.js `24.x`** (the repo pins the version via `.node-version`; if you use
  [fnm](https://github.com/Schniz/fnm) it picks this up automatically).
- **npm `11.x`** (ships with the Node version above).
- **git**.

### Setup

```bash
git clone https://github.com/Root50199/Uiscias.git
cd Uiscias
npm install
```

### Common commands

| Command                    | What it does                                                  |
| -------------------------- | ------------------------------------------------------------- |
| `npm run mods`             | List every discovered mod, group, and variant.                |
| `npm run new-mod`          | Scaffold a new mod folder (`--variant` for a variant group).  |
| `npm run generate-configs` | Regenerate each mod's `config.json` from its `config.yaml`.   |
| `npm run pack`             | Pack changed mods into their `build/` folder (Windows only).  |
| `npm run build-manifest`   | Build the `manifestCatalog.json` that Findias reads.          |
| `npm run check`            | Drift check — verify committed configs/hashes are up to date. |
| `npm test`                 | Run the test suite (Vitest).                                  |
| `npm run typecheck`        | Type-check the maintainer scripts.                            |

You normally don't run these by hand: a **pre-commit hook** regenerates configs
and repacks only the mods you changed, and a **release workflow** builds the
catalog and publishes it automatically when changes land on `main`. Authoring a
mod means editing its `config.yaml`, its `data/` files, and its `README.md`
(plus optional `images/`) — everything else (`config.json`, the packed `.it`,
the version lock) is generated.

> **Tech stack:** Node + TypeScript maintainer scripts (run with `tsx`), zod for
> validation, Vitest for tests, and `mabi-pack2.exe` for packing. See
> [`docs/architecture.md`](./docs/architecture.md) for the full build/release
> design and [`docs/packing.md`](./docs/packing.md) for the packer's
> constraints.

---

## How Uiscias works with Findias

Findias contains **no mods of its own**. Uiscias is its source of truth: the
list of mods, their latest versions, and the actual files all come from here.

```text
   Root50199/Uiscias (this repo → GitHub Releases)     tekashi-side/Findias (the app)
   ├─ manifestCatalog.json  ── the catalog ──────────►  reads the catalog to know what
   └─ Uiscias<Name>_<n>.it  ── the mods ─────────────►  mods exist, then downloads the
                                                         chosen ones into appdata\package
```

Here's the flow:

1. **Packing.** A maintainer edits a mod's source files. Tooling here packs the
   mod's `data/` folder into a single `Uiscias<Name>_<version>.it` file with
   `mabi-pack2.exe`. Each source change bumps the version number.
2. **The catalog.** When changes land, a release publishes a
   `manifestCatalog.json` describing every mod — its name, tags, version, size,
   download count, which game files it touches, and any variants. The same
   release hosts the actual `.it` files as downloadable assets.
3. **Findias reads the release.** Findias fetches the **latest** Uiscias
   release's manifest to build the mod list you see, then downloads the `.it`
   files you choose straight from GitHub into your game's `package` folder.
4. **Comparing and cleaning up.** Because every mod is named
   `Uiscias<Name>_<version>.it`, Findias can compare your folder against the
   catalog to tell whether each mod is missing, current, or out of date — and it
   guarantees only one version of each mod is ever installed, leaving the game's
   own files untouched.

A few important separations:

- **Uiscias creates mods; Findias installs them.** Building and packing content
  happens here; Findias never edits mod contents, only manages the files.
- **No hosting cost.** Everything rides on GitHub Releases and is computed on
  each user's machine — there's no Uiscias server, database, or account.
- **App updates vs. mod updates.** Findias updates itself automatically;
  installing or updating a mod is always the user's choice.

For the full technical picture, see [`docs/architecture.md`](./docs/architecture.md).

---

## Contributing and overlap

I avoid adding mods that already exist in
[uotiara](https://github.com/shaggyze/uotiara) unless I've meaningfully changed
them myself. A couple of tools that help when maintaining mods after a game
patch:

- [Beyond Compare](https://www.scootersoftware.com/) — diffing and updating mods.
- [Everything](https://www.voidtools.com/) — fast file search across game data.
- [mabi-pack2](https://github.com/shaggyze/uotiara) — unpacking and repacking
  `.it` files (from the uotiara repo).

---

## License

MIT © Root50199
