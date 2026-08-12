# Note Taker — Roadmap & Status

**Last updated:** 2026-08-10 · **Version:** 0.1.0 · **Status:** feature-complete through Phase 1,
largely unverified; not yet on GitHub

Companion documents: **[DOCUMENTATION.md](DOCUMENTATION.md)** (product rules and why each decision
was made) · **[STACK.md](STACK.md)** (what each tool is, plus troubleshooting).

---

## At a glance

| Area | Status |
|---|---|
| Project scaffold & build | ✅ Done |
| Overlay window & global hotkey | ✅ Done |
| Tray, quit, launch-at-login | ✅ Done (needs manual verification) |
| Note storage (files, IPC, security) | ✅ Done — **confirmed writing real `.md` files** |
| Markdown editor | ✅ Code complete, ⚠️ unverified |
| Note list & search | ✅ Code complete, ⚠️ unverified |
| Packaging (portable `.exe`) | ✅ Done |
| Preview & Mermaid | ❌ Not started |
| Linting & tests | ✅ Done — `lint`, `test`, `typecheck`, `build` all green |
| CI/CD | ❌ Not started — no repo, no commits yet |
| Auto-update | ⛔ **Removed from scope** — see §5 |

Roughly: **the app works end to end on paper, and partly in fact.** Storage has demonstrably run —
there are real notes on disk — but no human has watched the full summon → type → dismiss → reopen
loop. The remaining work is proving it, then getting it onto GitHub with a pipeline behind it.

---

## 1. What is built

### Foundation
- Electron 43 + Vite 7 + React 19 + TypeScript 7 via `electron-vite`, three build targets
- Strict TypeScript, split configs per runtime (`tsconfig.node` / `tsconfig.web`)
- `npm run build` typechecks before compiling — esbuild alone would let type errors through

### Main process
- **Overlay window** ([src/main/window.ts](src/main/window.ts)) — transparent, frameless,
  always-on-top at `screen-saver` level, visible on all workspaces, no taskbar entry
- Created **hidden at startup and never destroyed**, so summoning is instant (BR-1)
- Positioned on the display holding the **cursor**, using `workArea` to avoid the taskbar
- **Global hotkey** `Ctrl+Space` (`CommandOrControl+Space`) toggles it; registration failure is
  logged loudly. Chosen for fewest keys; known to collide with the Windows input-language switcher
  and macOS Spotlight, which a configurable hotkey (5.1) is the real fix for
- **Single-instance lock** — a second launch summons the existing window instead of starting a
  broken second copy that cannot claim the hotkey
- **Alt+F4 hides rather than closes**, so the window is never destroyed accidentally

### Tray ([src/main/tray.ts](src/main/tray.ts))
- Show/hide, **Start with Windows** toggle, and Quit — the app's only visible surface
- Icon generated programmatically and committed at [resources/tray.png](resources/tray.png)

### Storage ([src/main/notes.ts](src/main/notes.ts))
- One `.md` file per note in `Documents/Note Taker`
- `list` / `read` / `write` / `create` / `delete` / `revealFolder`
- **Path traversal made unrepresentable** — ids are restricted to `[a-z0-9-]`, an alphabet with no
  separator, dot, or drive letter
- Titles derived from content, never stored, so external edits can't desync them
- IPC arguments validated at runtime ([src/main/ipc.ts](src/main/ipc.ts)) — types don't cross
  the process boundary

### Preload ([src/preload/index.ts](src/preload/index.ts))
- `window.api` exposes intent (`notes.write(id, content)`), never mechanism (no paths, no `fs`)
- Event subscriptions return unsubscribe functions for React strict mode

### Renderer
- Placeholder panel with a spring entrance animation that replays on each summon
- Glass styling with light/dark support; CSP set in `index.html`

### Packaging
- `electron-builder` configured; **working 90 MB portable Windows `.exe`** produced —
  `NoteTaker-0.1.0-portable.exe`, a single self-extracting file with no installer
- App icon generated and committed at `build/icon.ico`
- Tray icon correctly shipped via `extraResources`
- No auto-updater, by choice (§5). Convenient here: `electron-updater` could not have updated a
  portable build anyway, so the two decisions reinforce each other

---

## 2. Known gaps in what exists

Small, real, and worth fixing before CI — a pipeline that runs broken scripts is worse than none.

- [x] ~~`npm run lint` fails~~ — now runs oxlint, clean
- [x] ~~`npm run test` fails~~ — 29 tests, passing
- [x] ~~`electron-updater` is not installed, though auto-update is planned~~ — auto-update is no
      longer planned, so this is resolved rather than outstanding
- [ ] **Renderer bundle is now ~1.77 MB** across two chunks: ~888 kB app (mostly `framer-motion`)
      and ~878 kB CodeMirror. The latter is inflated because `@codemirror/lang-markdown` drags in
      the HTML, JavaScript and CSS grammars (see STACK.md §3). `LazyMotion` should cut the first;
      the second would need the editor itself to be lazy-loaded
- [ ] **No way to change the hotkey or notes folder** — both are hardcoded constants
- [ ] **Markdown is not sanitized.** Not exploitable yet (nothing renders it), but `marked` output
      goes straight into the DOM, and markdown permits raw HTML. Must be handled in Phase 2.

### Needs manual verification

Written and compiling, but mostly **not yet observed working**:

- [ ] The overlay visually appears on `Ctrl+Space` and looks right
- [ ] The tray icon appears, and each menu item does what it should
- [x] Storage actually writes files — `Documents/Note Taker` contains real notes created by the app
- [ ] The full round trip: summon → type → Escape → reopen → the note is still there
- [ ] The portable `.exe` launches and behaves the same as `npm run dev`

---

## 3. What's next

### Phase 1 — Make it a notes app *(the critical path)* — ⚠️ code complete, unverified

- [x] **1.1** CodeMirror 6 editor with markdown mode, mounted in the panel
- [x] **1.2** Autofocus on summon — type immediately, no clicking (BR-4)
- [x] **1.3** Debounced autosave (500ms), plus a forced flush before dismiss (BR-6)
- [x] **1.4** A save indicator subtle enough not to nag (silent while pending)
- [x] **1.5** Editor theme matching the panel's design tokens
- [x] **1.6** Note list sidebar, most-recent first, with relative timestamps
- [~] **1.7** Create / switch / delete notes — `Ctrl+N`, `Ctrl+K`, contextual `Esc` all work;
      **deleting is still mouse-only** and the list has no arrow-key navigation
- [x] **1.8** Full-text search, run in the main process so content never crosses IPC to be filtered

**Done when:** hotkey → type → Escape → reopen → the note is there.
**Not yet confirmed** — the build is green and the app runs without errors, but no human has
watched a note survive a round trip. This is the next thing to check.

Follow-ups this phase created:
- [ ] Arrow-key navigation and keyboard delete in the note list (finishes 1.7 / BR-4)
- [ ] Empty notes accumulate — `Ctrl+N` twice leaves an "Untitled" behind

### Phase 2 — Rendering

- [ ] **2.1** Preview pane using `marked`, toggleable, split view
- [ ] **2.2** **Sanitize markdown output** — closes the XSS gap above
- [ ] **2.3** Mermaid via dynamic `import()`, so only notes containing diagrams pay for it
- [ ] **2.4** Debounce diagram re-render (~300ms) and show invalid syntax quietly
- [ ] **2.5** Theme mermaid to match the panel
- [ ] **2.6** Verify the lazy chunk actually splits in the production build

### Phase 3 — Quality gates *(prerequisite for CI)* — ✅ done 2026-08-10

- [x] **3.1** Linter configured and clean — **oxlint, not ESLint**. `typescript-eslint` declares a
      peer range of `>=4.8.4 <6.1.0` and this project is on TypeScript 7, so no published version
      can be installed without forcing a resolution npm calls "potentially broken". Oxlint parses
      TypeScript natively, needs no TypeScript peer, and adds 2 packages rather than ~100.
      Config and every suppression's reasoning live in [.oxlintrc.json](.oxlintrc.json)
- [x] **3.2** First Vitest tests — 29 of them, covering `deriveTitle`, `byRecency`, and
      `assertValidId`. The last is written as attacks rather than examples: traversal, absolute
      paths, UNC paths, null bytes, percent-encoding
- [x] **3.3** `npm run test` passes. Deliberately *not* passing `--passWithNoTests`: if the suite
      ever disappears, that should fail the build rather than quietly succeed
- [x] **3.4** Pure logic split into [note-utils.ts](src/main/note-utils.ts) — `notes.ts` imports
      `electron` at module scope, which cannot load outside an Electron runtime, so the testable
      half had to stop living next to it

**Trade-off accepted:** oxlint has no type-aware rules (those needing a type checker). Revisit if
`typescript-eslint` gains TS 7 support.

### Phase 4 — CI/CD *(the DevOps learning goal)*

- [ ] **4.1** `ci.yml` — on PR and push: typecheck, lint, test
- [ ] **4.2** Cache `node_modules` **and the Electron binary** (the slowest part of a cold build)
- [ ] **4.3** `release.yml` — on version tag, matrix build across
      `windows-latest` / `macos-latest` / `ubuntu-latest`
- [ ] **4.4** Publish `.exe` / `.dmg` / `.AppImage` to GitHub Releases via `electron-builder`
- [ ] **4.5** Pin every GitHub Action to a commit SHA, not a tag — see §5
- [ ] **4.6** Enable Dependabot for npm and Actions, so updates are reviewed rather than absorbed
- [ ] **4.7** Branch protection requiring CI to pass

**Deliberately skipped:** code signing. A certificate costs $200–400/year and OV certs need to
build SmartScreen reputation regardless. Users will see a SmartScreen warning; that is accepted.

**Deliberately skipped:** auto-update — see §5.

### Phase 5 — Polish

- [ ] **5.1** Settings panel: custom hotkey, notes folder location, launch-at-login, hide-on-blur.
      Opened with `Ctrl+,` *inside* the overlay rather than as a second window (BR-4, keyboard-first)
- [ ] **5.2** Persist settings in a hand-rolled `settings.json` — **not** `electron-store`, which is
      a dependency's worth of supply-chain surface for ~40 lines of code (§5). Written to
      `PORTABLE_EXECUTABLE_DIR` when set, else `app.getPath('userData')`, so a portable copy on a
      USB stick carries its own configuration
- [ ] **5.2b** Notes folder **defaults to `Documents/Note Taker`** and is changeable in settings
      *(decided 2026-08-10)*. Rejected: defaulting next to the `.exe`, because that path is often
      unwritable and is not somewhere a person would think to look for their own files (BR-3)
- [ ] **5.3** Decide whether the overlay hides on focus loss *(open question — feels native, but
      risks vanishing mid-thought)*
- [ ] **5.4** Remember window size/position across sessions
- [ ] **5.5** Reduce the framer-motion bundle
- [ ] **5.6** Respect `prefers-reduced-motion`
- [ ] **5.7** Empty state and first-run experience

---

## 4. Definition of done for v1.0

- [ ] Summon → type markdown → autosaved to a `.md` file
- [ ] Browse and search previous notes, keyboard only
- [ ] Preview renders markdown and mermaid diagrams
- [ ] Configurable hotkey and notes folder
- [ ] CI green on every PR
- [ ] Tagging a version produces builds for all three platforms automatically

---

## 5. Explicitly not in v1

From [DOCUMENTATION.md §1.4](DOCUMENTATION.md). Recorded here because the failure mode of this
project is gradual accumulation, not any single bad decision.

Nested pages · databases · collaboration · plugins · WYSIWYG editing · AI features · voice notes ·
mobile · cloud sync (the notes folder is a plain directory — put it in Dropbox and you're done)

### Auto-update — removed from scope *(decided 2026-08-10)*

`electron-updater` was planned but **never installed**, and will not be. The reason is supply-chain
risk, and it is worth stating precisely because "we skipped a dependency" is usually the weaker
argument:

An auto-updater is the single most dangerous dependency an app can take. Ordinary packages run with
the privileges of the build; an updater is *designed* to fetch remote code and execute it on the
user's machine, forever, without asking. A compromised release of any other package harms whoever
rebuilds; a compromised updater harms everyone who ever installed. Combined with the choice not to
code-sign, there would be no second line of defence.

The cost of skipping it is real and accepted: users re-download the `.exe` from GitHub Releases to
upgrade. For a single-file portable app, that is a drag-and-drop.

### Supply-chain posture generally

The app currently has **zero runtime dependencies** — `npm ls` returns an empty tree. Everything in
`package.json` is a `devDependency`, bundled by Vite at build time. Rules adopted to keep it that
way:

- A new **runtime** dependency needs a reason that survives being asked twice. Prefer ~40 lines of
  our own code over a package (see 5.2 and `electron-store`)
- Dev dependencies get the same question, less strictly. Oxlint over ESLint was forced by TS 7,
  but 2 packages instead of ~100 is the outcome we'd have wanted anyway
- CI installs with `npm ci`, never `npm install` — the lockfile is the source of truth
- GitHub Actions are pinned to **commit SHAs**, not tags: tags are mutable and a compromised action
  is arbitrary code execution inside a workflow that can write releases
- Workflow `permissions:` are declared per job at the minimum needed, not left at the default

---

## 6. Suggested order

**Phase 1 → 3 → 4 → 2 → 5**, not strictly numerically. Phases 1 and 3 are done; **Phase 4 is next.**

The reasoning: Phase 1 is the product and blocks everything. But it's worth doing **Phase 3 and 4
before Phase 2** — CI is most valuable while the codebase is still small enough that setting it up
is quick, and every later change then arrives already tested and released. Mermaid is the most
*fun* part, which makes it a good reward rather than a good next step.

Before the first push, two things a public repo needs that a private folder does not: a `LICENSE`
file (package.json claims MIT with no license text to back it) and a `README.md`.

Phase 4 is also the stated learning goal of the project, and it's the part most likely to be
skipped forever if deferred until "after the features are done".
