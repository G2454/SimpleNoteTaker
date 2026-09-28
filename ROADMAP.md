# Note Taker — Roadmap & Status

**Last updated:** 2026-08-27 · **Version:** 0.1.0 · **Status:** Phases 1, 3 and 4 built;
public at [G2454/SimpleNoteTaker](https://github.com/G2454/SimpleNoteTaker). Nothing has been
run end to end yet — neither the app nor the pipeline.

Companion documents: **[DOCUMENTATION.md](DOCUMENTATION.md)** (product rules and why each decision
was made) · **[STACK.md](STACK.md)** (what each tool is, plus troubleshooting) ·
**[README.md](README.md)** (the front door — what it is and how to run it).

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
| Rename notes (file rename) | ✅ Code complete, ⚠️ unverified |
| Options screen (hotkey, folder, theme, startup) | ✅ Code complete, ⚠️ unverified |
| Preview & Mermaid | ✅ Done — toolbar, split preview, diagrams; **verified running** |
| Linting & tests | ✅ Done — 370 tests; `lint`, `test`, `typecheck`, `build` all green |
| CI/CD | ✅ Written, ⚠️ **never run** |
| Auto-update | ⛔ **Removed from scope** — see §5 |

Roughly: **the app works end to end on paper, and partly in fact.** Storage has demonstrably run —
there are real notes on disk — but no human has watched the full summon → type → dismiss → reopen
loop, and no workflow has executed a single time. Both pipelines and the app itself are now
waiting on the same thing: someone actually running them.

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
- Show/hide, **Options…**, **Start with Windows** toggle, and Quit — the app's only visible surface
- The menu is rebuilt when settings change; Electron menus are immutable snapshots, so it would
  otherwise keep showing the hotkey that was current at startup
- Icon generated programmatically and committed at [resources/tray.png](resources/tray.png)

### Storage ([src/main/notes.ts](src/main/notes.ts))
- One `.md` file per note, in `Documents/Note Taker` by default and anywhere the user picks
- `list` / `read` / `write` / `create` / `rename` / `delete` / `search` / `revealFolder`
- **A note's id is its filename**, so renaming a note renames the file (BR-3)
- **Path traversal blocked twice over.** `assertValidId` rejects the *shape* of a dangerous name —
  path separators, `..`, leading dots, Windows-forbidden characters, control characters, reserved
  device names (`NUL`, `CON`, `COM1`…), and names Windows would silently alter. Then `pathFor`
  verifies the *result*: the resolved path must be a direct child of the notes folder. The first
  check is the readable one; the second is the guarantee
- User input is repaired rather than rejected — `sanitizeNoteName` turns `Q3: Plan` into `Q3 Plan`
- Titles derived from content, never stored, so external edits can't desync them
- IPC arguments validated at runtime ([src/main/ipc.ts](src/main/ipc.ts)) — types don't cross
  the process boundary

### Preload ([src/preload/index.ts](src/preload/index.ts))
- `window.api` exposes intent (`notes.write(id, content)`), never mechanism (no paths, no `fs`)
- Event subscriptions return unsubscribe functions for React strict mode

### Renderer
- Panel with a spring entrance animation that replays on each summon
- CodeMirror editor, note list, search, in-place rename, and the Options screen
- Glass styling with light/dark/system support; CSP set in `index.html`

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
- [x] ~~`npm run test` fails~~ — 196 tests, passing
- [x] ~~`electron-updater` is not installed, though auto-update is planned~~ — auto-update is no
      longer planned, so this is resolved rather than outstanding
- [ ] **Renderer bundle is now ~1.77 MB** across two chunks: ~888 kB app (mostly `framer-motion`)
      and ~878 kB CodeMirror. The latter is inflated because `@codemirror/lang-markdown` drags in
      the HTML, JavaScript and CSS grammars (see STACK.md §3). `LazyMotion` should cut the first;
      the second would need the editor itself to be lazy-loaded
- [x] ~~No way to change the hotkey or notes folder~~ — both are configurable in Options (Phase 5.1)
- [ ] **Vite is pinned to 7 by `electron-vite`.** Its latest stable (5.0.0) peers on
      `vite ^5 || ^6 || ^7`; Vite 8 support is only in `electron-vite@6.0.0-beta.1`, and
      `@vitejs/plugin-react@6` hard-requires Vite 8, so the three move as a set. Dependabot ignores
      majors for `vite` and `@vitejs/plugin-react` until electron-vite 6 is stable — revisit then
- [x] ~~**Markdown is not sanitized.**~~ — closed in Phase 2. The renderer never *emits*
      dangerous HTML rather than emitting it and cleaning up afterwards: raw HTML is escaped to
      text, and link and image URLs are checked against a scheme allowlist
      ([src/shared/urls.ts](src/shared/urls.ts)). 49 tests written as attacks cover it, including
      the encoded-scheme bypasses. Navigation is refused in the main process as a second line
      ([window.ts](src/main/window.ts))

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

- [x] **2.1** Preview pane using `marked` — three modes (edit / split / preview) on a segmented
      control and `Ctrl+E`, in [Preview.tsx](src/renderer/src/components/Preview.tsx)
- [x] **2.2** **Sanitize markdown output** — see the closed item above
- [x] **2.3** Mermaid via dynamic `import()`; it is the only reference to the package in the app
- [x] **2.4** Diagrams debounce at 300ms, cache by source, and report invalid syntax as a muted
      line under the source rather than an error box — half-typed syntax is the normal state
- [x] **2.5** Mermaid themed from the panel's own palette, redrawn when light/dark changes
- [x] **2.6** Verified: the entry chunk statically imports only CodeMirror, and mermaid arrives as
      a separate chunk on first preview of a note containing a diagram

### Phase 2b — Formatting toolbar *(added, not originally planned)*

- [x] 14 buttons for the markdown people do not memorise — heading, bold, italic, strikethrough,
      inline code, three list kinds, quote, link, code block, table, rule, diagram
- [x] Every button is a **toggle over the text**, not a rich-text command: pressing Bold on bold
      text unbolds it, and Bullet on a numbered list converts it (BR-7 holds — the file stays
      markdown you could have typed)
- [x] The edit logic is a pure function of `(document, selection)` in
      [markdown-actions.ts](src/renderer/src/lib/markdown-actions.ts), so all 41 of its cases are
      tested as strings with no editor and no DOM
- [x] `Ctrl+B` / `Ctrl+I` bound in the editor; everything else is discoverable by looking at it

### Phase 3 — Quality gates *(prerequisite for CI)* — ✅ done 2026-08-10

- [x] **3.1** Linter configured and clean — **oxlint, not ESLint**. `typescript-eslint` declares a
      peer range of `>=4.8.4 <6.1.0` and this project is on TypeScript 7, so no published version
      can be installed without forcing a resolution npm calls "potentially broken". Oxlint parses
      TypeScript natively, needs no TypeScript peer, and adds 2 packages rather than ~100.
      Config and every suppression's reasoning live in [.oxlintrc.json](.oxlintrc.json)
- [x] **3.2** Vitest tests — **196 across 6 files**, covering every non-UI module.
      `assertValidId` is written as attacks rather than examples: traversal, absolute paths, UNC
      paths, null bytes, NTFS streams, reserved device names, percent-encoding
- [x] **3.5** Storage covered by **integration tests against a real temp directory**
      ([notes.test.ts](src/main/notes.test.ts)) rather than a mocked filesystem. The failures that
      matter here are what lands on disk — whether a rename leaves the old file behind, whether a
      collision overwrites a note — and a mock would only assert that we *called* rename, which was
      never the part in doubt. Each run gets a private parent directory rather than using the
      system temp folder directly: the containment test compares the parent before and after an
      escape attempt, which raced every other test file — and every other process on the machine —
      to create a directory between the two reads. It failed roughly half the time
- [x] **3.6** Settings covered against corrupt, partial and hostile files
      ([settings.test.ts](src/main/settings.test.ts)) — truncated JSON, wrong types, relative
      paths, a JSON array where an object belongs. The bar for each is that the app still boots
- [x] **3.7** IPC payload validation covered ([ipc-validation.test.ts](src/main/ipc-validation.test.ts))
      including prototype-pollution attempts, since these run on input from the renderer
- [x] **3.3** `npm run test` passes. Deliberately *not* passing `--passWithNoTests`: if the suite
      ever disappears, that should fail the build rather than quietly succeed
- [x] **3.4** Pure logic split from Electron-importing modules — now a **project convention**,
      not a one-off. `notes.ts` → [note-utils.ts](src/main/note-utils.ts), `ipc.ts` →
      [ipc-validation.ts](src/main/ipc-validation.ts). Anything importing `electron` at module
      scope cannot load outside an Electron runtime, so the logic worth testing moves next door.
      See STACK.md §"Testing" before adding a module

**Trade-off accepted:** oxlint has no type-aware rules (those needing a type checker). Revisit if
`typescript-eslint` gains TS 7 support.

### Phase 4 — CI/CD *(the DevOps learning goal)* — ⚠️ written 2026-08-10, never run

- [x] **4.1** [`ci.yml`](.github/workflows/ci.yml) — on PR and push to main: typecheck, lint, test,
      build. Lint uses `-f github`, so findings annotate the diff instead of hiding in a log
- [x] **4.2** Cache the npm download cache **and the Electron binary** — the ~100 MB Chromium
      download is the slowest part of a cold install, keyed on the lockfile
- [x] **4.3** [`release.yml`](.github/workflows/release.yml) — on a `v*` tag, matrix across
      `windows-latest` / `macos-latest` / `ubuntu-latest`, with `fail-fast: false` so one platform
      failing doesn't discard the other two
- [x] **4.4** Publishes to GitHub Releases via `electron-builder --publish always`, using the
      automatic `GITHUB_TOKEN` — **no secret to configure**. Assets land in a **draft** release
- [x] **4.5** Every action pinned to a commit SHA with the version in a trailing comment
- [x] **4.6** [Dependabot](.github/dependabot.yml) for npm and Actions, grouped so routine bumps
      aren't one PR each. Electron **majors** are ignored — that's a migration, not a bump
- [x] **4.8** A packaging smoke test on `windows-latest` for pushes to main, uploading the `.exe`
      as an artifact. Catches packaging breakage at commit time rather than at tag time, when
      fixing it would mean deleting a pushed tag
- [x] **4.9** Tag/version guard — the release is blocked if `v0.2.0` is pushed while package.json
      still says `0.1.0`. Runs once, before three runners spend ten minutes building
- [ ] **4.7** Branch protection requiring CI to pass — **must be done in the GitHub UI**, it is not
      a file in the repo. Settings → Branches → Add rule for `main` → *Require status checks to
      pass* → select `Typecheck, lint, test, build`
- [~] **4.10** Verify the pipeline actually runs. **First release attempt (v0.2.0) published only
      the Linux AppImage.** Cause found for macOS: `build/icon.png` was 256×256 and macOS needs
      ≥512 to generate an `.icns` — now 1024×1024. Windows cause still unconfirmed. `fail-fast:
      false` worked as intended: one platform's failure did not discard the others

**Deliberately skipped:** code signing. A certificate costs $200–400/year and OV certs need to
build SmartScreen reputation regardless. Users will see a SmartScreen warning; that is accepted.

**Deliberately skipped:** auto-update — see §5.

### Phase 5 — Polish

- [~] **5.1** Options screen — ⚠️ built, unverified. Custom hotkey (recorded by pressing the
      combination), notes folder, appearance (System/Light/Dark), and launch-at-login. Opened with
      `Ctrl+,` *inside* the overlay rather than as a second window (BR-4, keyboard-first), and also
      from the tray's "Options…" item. **`hide-on-blur` is not included** — still an open question
      under 5.3
- [x] **5.2** Settings persisted in a hand-rolled `settings.json` — **not** `electron-store`, which
      is a dependency's worth of supply-chain surface for ~40 lines of code (§5). Written to
      `PORTABLE_EXECUTABLE_DIR` when set, else `app.getPath('userData')`, so a portable copy on a
      USB stick carries its own configuration
- [x] **5.2b** Notes folder **defaults to `Documents/Note Taker`** and is changeable in Options
      *(decided 2026-08-10)*. Rejected: defaulting next to the `.exe`, because that path is often
      unwritable and is not somewhere a person would think to look for their own files (BR-3).
      Changing it re-points the app; existing notes are **not** moved, which the screen says plainly
- [x] **5.2c** Notes are **named, not timestamped**. A note's id *is* its filename, so renaming a
      note renames the file — the list and Explorer always agree (BR-3). Renamed in place from the
      title bar or with `F2`; new notes are "Untitled", "Untitled 2", … Collisions gain a numeric
      suffix rather than erroring or overwriting, since overwriting would destroy a note (BR-6)
- [ ] **5.3** Decide whether the overlay hides on focus loss *(open question — feels native, but
      risks vanishing mid-thought)*
- [x] **5.4** Window size is a **choice of three presets** — Small (the original 760×520), Medium,
      and Full (the whole work area) — set in Options and persisted. Position is deliberately *not*
      remembered: the overlay is placed on whichever display holds the cursor, and a remembered
      position would put it on a monitor that may not be there this time. The size is recomputed
      from the work area on every summon for the same reason, so "Full" means full on whichever
      screen you summoned it to. Preset rather than a draggable edge, because a freely-resized
      window has the same multi-display problem in a subtler form
      ([overlay-size.ts](src/shared/overlay-size.ts), 18 tests)
- [ ] **5.5** Reduce the framer-motion bundle
- [x] **5.6** Respect `prefers-reduced-motion` — one media query in `global.css`
- [x] **5.7** Light/dark/system theme, applied via `nativeTheme.themeSource` in the main process.
      Electron feeds that into the renderer, so the existing `prefers-color-scheme` queries report
      the user's choice and **no CSS had to change**
- [ ] **5.7** Empty state and first-run experience

---

## 4. Definition of done for v1.0

- [ ] Summon → type markdown → autosaved to a `.md` file
- [ ] Browse and search previous notes, keyboard only
- [x] Preview renders markdown and mermaid diagrams
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
