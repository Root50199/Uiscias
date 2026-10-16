# mabi-pack2

Utilities for Mabinogi `.it` and `.pack` archives with robust error handling and high-performance parallel processing.

## Features
- **Parallel Processing**: Multi-threaded extraction, packing, and key searching (powered by `rayon`).
- **Memory Mapping**: High-speed I/O using `memmap2`.
- **Legacy Support**: Full support for both modern `.it` and legacy `.pack` (V1) formats.
- **Modern GUI**: Professional explorer interface with 3D mesh preview, hex viewer, and drag-and-drop support.
- **Windows Integration**: Automatic file associations and context menu integration (fully localized).
- **On-Demand Conversion**: Right-click to convert between `.dds` and `.png` in the explorer.
- **Progress Tracking**: Real-time progress bars for extraction and packing operations.
- **Deep Localization**: Multilingual interface supporting English, Chinese, Japanese, and Korean.

## Roadmap
For advanced features like **Virtual Merging**, **Archive Drag-and-Drop Injection**, and **FileZilla-style Conflict Resolution**, please see the [TODO.md](./TODO.md) file.

## Installation

### CLI
Requires [Rust](https://rustup.rs/) 1.70+.
```bash
git clone https://github.com/shaggyze/mabi-pack2.git
cd mabi-pack2
cargo build --release
```

### GUI
Requires Node.js and Tauri prerequisites.
```bash
cd gui
npm install
npm run tauri build
```

## CLI

The Cargo CLI binary is `mabi-patcher.exe` (built by `cargo build --release`).
Run `mabi-patcher.exe help` or `mabi-patcher.exe <command> --help` for built-in
help. Options in square brackets are optional.

### Global options

| Option | Meaning |
|---|---|
| `-h`, `--help` | Show help. Available at the root and for each command. |
| `-V`, `--version` | Print CLI version. |
| `-v`, `--verbose` | Increase logging; repeat for debug (`-vv`) and trace (`-vvv`). Put before the command. |

### Commands and arguments

| Command | Arguments |
|---|---|
| `pack` | `-i`, `--input FOLDER` (required); `-o`, `--output PATH` (required); `-k`, `--key SALT` (required unless `--template`); `--entries-key SALT` (separate entries-table salt); `--template ORIGINAL.IT`; `--encrypt-files`; `--confirm-native-name`; `--iv 0 or 1` (default `0`); `-f`, `--compress-format EXTENSION` (repeatable); `--wrap-data`. |
| `extract` | `-i`, `--input ARCHIVE` (required); `-o`, `--output FOLDER`; `-k`, `--key SALT`; `-f`, `--filter REGEX` (repeatable). Output defaults to a folder named after the archive. |
| `list` | `-i`, `--input ARCHIVE` (required); `-k`, `--key SALT`; `-o`, `--output FILE`. |
| `batch` | `-i`, `--input FOLDER` (required); `-o`, `--output FOLDER` (required); `-k`, `--key SALT`; `-f`, `--filter REGEX` (repeatable); `-j`, `--jobs N` (default `1`; `0` uses CPU count); `--no-merge`. |
| `convert` | `-i`, `--input ARCHIVE` (required); `-o`, `--output ARCHIVE` (required); `-k`, `--key SALT` (for `.it`). |
| `full-sequence` | `-i`, `--input FOLDER` (required); `-o`, `--output ARCHIVE` (required); `-k`, `--key SALT` (for output `.it`). |
| `serve` | `-p`, `--port PORT` (default `7331`); `--host HOST` (default `127.0.0.1`). |
| `mod inspect` | `-f`, `--file MOD_FILE` (required). |
| `mod template` | No arguments; prints a blank `.mod` template. |
| `mod list` | `-d`, `--dir DIR` (default `mods`). |
| `launch` | `-u`, `--username EMAIL` (required); `-p`, `--password PASSWORD` (required); `-c`, `--client DIR` (required); `--remember`; `--version` (check latest game version, do not launch). Windows only. |

`pack --compress-format` adds suffixes to the default compressed extensions:
`.txt`, `.xml`, `.dds`, `.pmg`, `.set`, and `.raw`. Supply the leading dot,
such as `--compress-format .ani`; matching is case-sensitive. CLI packing does
not automatically convert PNG files to DDS.

### Packing behavior

For modern `.it` archives, `-k` is the header salt and, by default, the entries
salt too. `--entries-key` sets a separate entries-table salt. Payloads are
unencrypted by default; `--encrypt-files` enables payload encryption. File
payload keys derive from each entry's name and its stored 16-byte key.

Use `--template ORIGINAL.IT` to detect salts, cipher, IV, format version,
metadata layout, payload alignment, archive padding, footer, and path separator
style from an existing archive. The template is read-only and cannot also be
used with `--entries-key` or `--encrypt-files`. Manual salts, IV, and compression
settings do not control template output. Matching paths keep their stored file
keys and compression/encryption flags. New paths use the template's most common
flags and get a content-derived key when encrypted. Use paths that match the
template's `data` layout.

Modern `.it` packing requires a lowercase ASCII initial letter, an ASCII
basename containing only letters, digits, `_` or `-`, a lowercase `.it`
extension, and a basename that sorts after `data` (case-insensitive).
`data_#####.it` requires `--confirm-native-name` because it can cause load-order
errors or conflict with game updates.

Every packed file must be under a `data` root, and that tree must contain at
least one file. Pass the folder containing `data`, or use `--wrap-data` to add
a virtual `data\` prefix to the source files. Do not wrap a source already
rooted at `data`. CLI packing rejects files outside `data`. The GUI also accepts the `data`
directory itself or its parent; when given the parent, it packs only `data`.

The GUI Pack tab offers separate **Header Salt** and **Entries salt** fields,
or an **Original .it template**. GUI PNG-to-DDS conversion is controlled by
its setting; CLI packing leaves PNG files unchanged.

REST `POST /api/v1/pack` accepts these values in `pack_options`, for example
`{"entries_key":"EntriesSalt","encrypt_files":true}` or
`{"template_archive":"D:\\Nexon\\Mabinogi\\appdata\\package\\data_00000.it"}`.
The top-level `key` is the header salt and is optional with a template.
Template mode rejects manual entries-salt and encryption options. Set
`"confirm_native_name": true` in `pack_options` to allow a `data_#####.it`
output name. GUI and REST use the same modern `.it` filename and `data`-tree
checks as the CLI.

An output name such as `aReallyLongFileName_00004.it` can make the header key
independent of the salt: derivation uses only the first 16 UTF-16 code units of
the lowercased filename plus salt. Extraction may then report any successful
candidate as the header salt; that label does not identify the packing salt.
The entries salt still matters. Template packing reproduces supported archive
encoding, not byte-identical compression output or guaranteed game-client
acceptance.

Legacy `.pack` output uses the V1 writer and skips modern `.it` validation.
The CLI parser still requires `-k` unless a template is supplied, even though
the V1 writer ignores the key and modern packing options.

### Valid examples

```powershell
# Extract and list; salts are auto-detected unless -k is given
mabi-patcher.exe extract -i .\data_00.it -o .\extracted -f '\.xml$'
mabi-patcher.exe list -i .\data_00.it -o .\filelist.txt

# Pack a source folder containing data\; use one salt for both metadata tables
mabi-patcher.exe pack -i .\source -o .\output\custom_pack.it -k HeaderSalt

# Use different metadata salts, encrypt payloads, and compress another suffix
mabi-patcher.exe pack -i .\source -o .\output\custom_pack.it -k HeaderSalt --entries-key EntriesSalt --encrypt-files --compress-format .ani

# Reuse an original archive's settings; output must not be the template itself
mabi-patcher.exe pack -i .\source -o .\output\custom_pack.it --template 'D:\Nexon\Mabinogi\appdata\package\data_00000.it'

# Add data\ to files in a source folder that is not already rooted at data\
mabi-patcher.exe pack -i .\loose_files -o .\output\custom_pack.it -k HeaderSalt --wrap-data

# Confirm deliberate native naming, or create a legacy V1 .pack
mabi-patcher.exe pack -i .\source -o .\output\data_00001.it -k HeaderSalt --confirm-native-name
mabi-patcher.exe pack -i .\legacy_source -o .\output\archive.pack -k unused

# Extract a folder of archives into per-archive folders, four at a time
mabi-patcher.exe batch -i .\archives -o .\extracted -j 4 --no-merge -f '\.xml$'

# Convert, inspect a mod, or run the local API
mabi-patcher.exe convert -i .\source.it -o .\converted.pack -k HeaderSalt
mabi-patcher.exe full-sequence -i .\archives -o .\combined.it -k HeaderSalt
mabi-patcher.exe mod inspect -f .\mods\example.mod
mabi-patcher.exe mod template
mabi-patcher.exe mod list --dir .\mods
mabi-patcher.exe serve --host 127.0.0.1 --port 7331

# Windows launcher; set NEXON_PASSWORD in the current PowerShell session first
mabi-patcher.exe launch -u account@example.com -p "$env:NEXON_PASSWORD" -c 'C:\Nexon\Mabinogi' --remember
```

### Invalid examples

```powershell
# Missing -k and no template: pack requires a header salt
mabi-patcher.exe pack -i .\source -o .\output\custom_pack.it

# Template mode conflicts with manually selected entry salt or payload encryption
mabi-patcher.exe pack -i .\source -o .\output\custom_pack.it --template .\original.it --encrypt-files

# Native name needs explicit confirmation
mabi-patcher.exe pack -i .\source -o .\output\data_00000.it -k HeaderSalt

# Invalid extension/name; .it must be lowercase and basename must sort after data
mabi-patcher.exe pack -i .\source -o .\output\Data.it -k HeaderSalt

# The source has no data\ root; without wrapping, validation rejects it
mabi-patcher.exe pack -i .\loose_files -o .\output\custom_pack.it -k HeaderSalt

# Missing required output; the command parser rejects this
mabi-patcher.exe convert -i .\source.it

# Missing required client directory; the command parser rejects this
mabi-patcher.exe launch -u account@example.com -p "$env:NEXON_PASSWORD"

# Invalid regular expression; extraction reports a regex error
mabi-patcher.exe extract -i .\data_00.it -f '('
```

Packing regression tests: `cargo test --test pack_tests`.
For a full read-only original-archive comparison, set `MABI_TEST_ARCHIVE` to
its path and run `cargo test --test pack_tests real_game_template_roundtrip -- --ignored --nocapture`.

### Shell integration (Windows)

Dragging a `.it` or `.pack` file onto the GUI executable opens it directly.
Right-clicking a registered file type gives an "Open with mabi-pack2" menu item.

---

## GUI

The GUI is a single `mabi-pack2.exe` binary that acts as both CLI (when given a subcommand) and GUI (when launched normally or by double-clicking a registered archive).

### Requirements
- **Windows 10/11** (x64)
- **Microsoft WebView2 Runtime** — if not installed, the app will offer to download and install it automatically on first launch.

### Installation
- **Installer**: Run `mabi-pack2_1.x.x_x64-setup.exe` (NSIS) or the `.msi` — installs the app, registers file associations, and ensures WebView2 is present.
- **Portable**: Drop `mabi-pack2.exe` anywhere and run it. Settings save to `%APPDATA%\mabi-pack2\config.json` by default; place a `config.json` next to the exe to switch to portable mode (settings stay beside the exe).

### Tabs

| Tab | Purpose |
|-----|---------|
| **Extract** | Extract `.it` or `.pack` archives. Auto-detects the salt; override with a custom key if needed. |
| **Pack** | Create `.it` or `.pack` archives from a folder. Supports `--wrap-data` mode to prepend a `data/` root. |
| **List** | Browse archive contents without extracting. Click any entry to preview it in the side panel. |
| **Diff** | Compare two archives and highlight added / removed / changed entries. |
| **Console** | Live log output from the current operation. |
| **Settings** | Configure locale, theme, file associations, shell menu, and config location. |

### Preview Panel
The side panel auto-previews selected files based on type:
- **Images** (`.dds`, `.png`, `.jpg`, …) — rendered inline with zoom
- **3D Models** (`.pmg`) — interactive WebGL viewer with rotate/zoom
- **Text / XML** — syntax-highlighted source view
- **Binary** — hex dump (capped at 64 KB to avoid hangs on large files)

### Settings — Shell & Registry
- **Associate file types** — registers `.it`, `.pack`, `.dds`, `.pmg`, and `.compiled` with the app so they open on double-click.
- **Apply Registry** — writes the associations immediately.
- **Wipe Registry Associations** — removes all `mabi-pack2.*` entries from the registry and refreshes the shell.

### Settings — Config Management
- **Config path** — shows where `config.json` is currently saved.
- **Portable mode toggle** — switches between AppData and the folder beside the exe.
- **Open folder** — opens Explorer with the config file highlighted.
- **Reset Settings** — restores all settings to defaults (keeps the current config location).

### Localization
Switch language in Settings → Locale. Supported: **English**, **繁體中文**, **日本語**, **한국어**.

---

## REST API, WebUI, and MCP mission control

`mabi-patcher.exe serve` runs a headless HTTP server
exposing pack/extract/list/mod-apply/launcher operations, and — once
`gui/dist` is built (`npm run build` in `gui/`) — serves the WebUI (the same
frontend as the desktop app, pointed at this REST API instead of Tauri IPC)
from the same port:

```bash
mabi-patcher.exe serve --port 7331          # loopback only by default
mabi-patcher.exe serve --host 0.0.0.0 --port 7331   # LAN/Docker — requires MABI_API_TOKEN
```

Then open `http://127.0.0.1:7331/`. Full route list, auth model
(loopback always open; non-loopback requires `MABI_API_TOKEN` as a bearer
token; same-origin enforcement blocks drive-by cross-origin requests from
other websites regardless of bind address), and the phased build plan are
in `.gemini/MISSION_CONTROL_PLAN.md`.

**Docker:** `docker compose up` after setting `MABI_API_TOKEN` (required —
the container binds `0.0.0.0`). Builds and serves the WebUI alongside the
API automatically.

**MCP server:** `mcp_server/mission_control.py` exposes the same
operations as MCP tools (plus `launch_game`/`test_mod_for_crash`, which
replace the `mabi-mod-tester` Claude Code skill's screen-automation launch
step with real Nexon auth) for use from Claude Code or any MCP client — see
`mcp_server/README.md`.

## Credits
- Based on original utilities by regomne.
- Enhanced and maintained by ShaggyZE.
