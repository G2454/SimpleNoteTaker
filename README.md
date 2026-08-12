# Note Taker

[![CI](https://github.com/G2454/SimpleNoteTaker/actions/workflows/ci.yml/badge.svg)](https://github.com/G2454/SimpleNoteTaker/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**Press a key anywhere. A panel fades in over whatever you were doing. Type a note in markdown,
press Escape, and it's gone — saved as a plain `.md` file on your disk.**

A hotkey-summoned notes overlay for the desktop. Built to remove the context switch: capturing a
thought shouldn't mean alt-tabbing, waiting for an app to load, and finding your way back.

---

> [!WARNING]
> **Early and incomplete.** The editor, storage, note list and search are written and the build is
> green, but this has not been through real daily use. There are no published releases yet — see
> [Status](#status) for what works and [ROADMAP.md](ROADMAP.md) for what's next.

---

## What it does

- **Summon from anywhere** with <kbd>Ctrl</kbd>+<kbd>Space</kbd> — the panel opens on whichever
  monitor your cursor is on, above fullscreen apps, without a taskbar entry
- **Type immediately.** The editor is already focused; no clicking
- **Autosaves** while you type, and always flushes before the panel closes
- **Plain markdown files** in a normal folder — greppable, syncable, yours
- **Full-text search** across every note
- **Lives in the tray**, not the taskbar. Stays running so the hotkey always works

## Status

| Area | State |
|---|---|
| Overlay window, global hotkey, tray | ✅ Working |
| Note storage — one `.md` per note | ✅ Working, confirmed writing real files |
| Markdown editor, note list, search, autosave | ✅ Built, ⚠️ not yet proven in daily use |
| Lint, tests, typecheck, packaged build | ✅ All green |
| CI and release pipelines | ✅ Written, ⚠️ not yet run |
| Markdown preview & mermaid diagrams | ❌ Not started |
| Settings (custom hotkey, notes folder) | ❌ Not started — both are hardcoded today |
| Published releases | ❌ None yet |

## Installing

No releases are published yet. The pipeline that produces them is in place, so the first tagged
version will appear on the [Releases page](https://github.com/G2454/SimpleNoteTaker/releases) —
until then, build it yourself.

### Build from source

Requires **npm** and the Node version in [`.nvmrc`](.nvmrc) (24 — `nvm use` will pick it up).

```bash
git clone https://github.com/G2454/SimpleNoteTaker.git
cd SimpleNoteTaker
npm ci
npm run dev          # run it in development
```

To produce the real app:

```bash
npm run dist         # → release/NoteTaker-<version>-portable.exe
```

The Windows build is a **portable `.exe`**: one self-extracting file, no installer, no Start-menu
entry, no uninstaller. Put it wherever you like — including a USB stick — and double-click it.

> **On first launch Windows SmartScreen will warn you.** The app is not code-signed; a certificate
> costs $200–400/year and this is a personal project. Choose *More info → Run anyway*, or build it
> yourself from source above. This is a deliberate trade-off, recorded in [ROADMAP.md](ROADMAP.md).

## Using it

| Key | Does |
|---|---|
| <kbd>Ctrl</kbd>+<kbd>Space</kbd> | Show / hide the overlay — works from any application |
| <kbd>Ctrl</kbd>+<kbd>N</kbd> | New note |
| <kbd>Ctrl</kbd>+<kbd>K</kbd> | Jump to search |
| <kbd>Esc</kbd> | Clear the search if it has text — otherwise save and dismiss |
| <kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Ctrl</kbd>+<kbd>Y</kbd> | Undo / redo |

On macOS, <kbd>Cmd</kbd> substitutes for <kbd>Ctrl</kbd> throughout.

Deleting a note is currently mouse-only, and the note list has no arrow-key navigation yet. Both
are known gaps against the keyboard-only goal.

Quitting is done from the **tray icon**, which also toggles *Start with Windows*. Closing the panel
only hides it — that's what keeps the hotkey instant.

### Where your notes live

```
Documents/Note Taker/2026-08-09-2222-de2g.md
```

One markdown file per note. Filenames are timestamps, never derived from your text, so renaming a
heading can't move or overwrite a file. Titles in the sidebar are read from the first line of each
file, so editing a note in any other editor stays consistent.

There is no database and no index. Put the folder in Dropbox, iCloud or a git repo and syncing is
done. The folder location is hardcoded for now; making it configurable is the next planned feature.

## Development

```bash
npm run dev          # app with hot reload
npm run build        # typecheck, then compile all three processes
npm run dist         # build + package into release/
npm run typecheck    # tsc --noEmit, both configs
npm run lint         # oxlint, fails on any finding
npm run test         # vitest
npm run test:watch   # vitest in watch mode
```

Every push and pull request runs typecheck, lint, tests and a build; pushes to `main` also package
a Windows `.exe` and attach it to the run, so any commit can be downloaded and tried without
tagging anything.

### Cutting a release

```bash
# 1. bump the version — the tag and package.json must agree, or the release is blocked
npm version 0.2.0          # commits and tags in one step
git push --follow-tags
```

Pushing a `v*` tag builds on Windows, macOS and Linux in parallel and uploads everything to a
**draft** release. Review it, then publish it by hand — a draft avoids a half-uploaded release
being downloadable while two of the three runners are still working.

An Electron app is three programs, and the directory layout mirrors that:

```
src/
  main/        Node.js — windows, global hotkey, tray, all file I/O
  preload/     the airlock — the only capabilities the UI is allowed
  renderer/    React — editor, note list, animations. No filesystem access.
  shared/      types and constants used by more than one of the above
```

The renderer never touches the filesystem. It asks for *intent* (`notes.write(id, content)`), never
*mechanism* (`writeFile(path, data)`), so a path is not something the UI can even express. Note ids
are restricted to `[a-z0-9-]` — an alphabet with no separator, dot or drive letter — which makes
path traversal unrepresentable rather than merely filtered. That check is
[tested as an attack](src/main/note-utils.test.ts), not as an example.

## Documentation

| Document | What it covers |
|---|---|
| **[DOCUMENTATION.md](DOCUMENTATION.md)** | *Why* — the product thesis, business rules, and the reasoning behind every technical choice |
| **[STACK.md](STACK.md)** | *What* — every tool, library and Electron API in the project, plus troubleshooting |
| **[ROADMAP.md](ROADMAP.md)** | *When* — current status, known gaps, and what's next. The file to open first when picking this back up |

## Deliberately not built

Nested pages · databases · collaboration · plugins · WYSIWYG editing · AI features · voice notes ·
mobile · cloud sync · auto-update

The inspiration is Notepad++ — fast, plain, no ceremony. The anti-pattern is Notion, which
accumulated enough capabilities to lose its original point. Every feature has to earn its place
against one question: *does this let me capture or retrieve something without leaving what I'm
doing?*

Auto-update is the one omission that's about security rather than scope. An updater is designed to
fetch and execute remote code on your machine indefinitely; combined with the choice not to
code-sign, there would be no second line of defence. This app has **zero runtime dependencies**,
and that is meant to stay true. The reasoning is in [ROADMAP.md §5](ROADMAP.md).

## License

[MIT](LICENSE).
