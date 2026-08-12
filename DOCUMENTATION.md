# Note Taker — Design & Decision Record

A hotkey-summoned markdown notes overlay for the desktop.

This document records **what the product is**, **what it deliberately is not**, and **why each
technical choice was made**. It is written to be read by someone joining the project cold —
including future me, who will not remember the reasoning.

> See also **[STACK.md](STACK.md)** — a reference for what every tool, library, and Electron API in
> the project actually is and does. This file is the *why*; that one is the *what*.
>
> And **[ROADMAP.md](ROADMAP.md)** — current status, known gaps, and what's next. That one is the
> *when*, and it's the file to open first when picking the project back up.
>
> **[README.md](README.md)** is the front door: what the app is and how to run it. It's written for
> someone who wants to *use* this; the three documents above are for someone changing it.

---

## 1. Product

### 1.1 The one-sentence version

Press a key anywhere, a panel fades in over whatever you were doing, you type a note in
markdown, press Escape, and it's gone — saved as a plain `.md` file on your disk.

### 1.2 Why it should exist

The gap it fills is **the context switch**. Capturing a thought today means leaving what you're
doing: alt-tab, find the app, wait for it to load, find the right page, then find your way back.
The cost of that round trip is high enough that thoughts get dropped instead of written down.

An overlay eliminates the round trip. That is the entire product thesis, and it is the bar every
feature must clear: *does this let me capture or retrieve something without leaving what I'm doing?*

### 1.3 Business rules

These are the invariants. Code that violates one of these is a bug, even if it passes its tests.

| # | Rule | Rationale |
|---|------|-----------|
| BR-1 | Summoning is **instant** — under ~100ms from keypress to visible, always. | If capture is slower than the thought, the thought is lost. This is the product. |
| BR-2 | The overlay **never steals focus from your work** in a destructive way, and dismissing it returns you exactly where you were. | An overlay that disrupts your task defeats its own purpose. |
| BR-3 | Notes are **plain `.md` files in a normal folder** the user chooses. | The user owns their data. It must be readable, greppable, and syncable without this app. |
| BR-4 | The app is **usable with the keyboard alone**, start to finish. | Reaching for the mouse is a context switch too. |
| BR-5 | **No accounts, no login, no network requirement.** The app works fully offline. | Trust and speed. Notes are private by construction, not by policy. |
| BR-6 | **No data loss, ever.** Content is persisted on a debounce while typing, not only on explicit save. | A notes app that loses a note has failed at its only job. |
| BR-7 | Markdown source is **the** document. Any rendering is a view of it, never a replacement. | Guarantees BR-3 holds forever, and avoids the WYSIWYG rabbit hole. |

### 1.4 Non-goals

Explicitly out of scope. Recorded here because the failure mode of this kind of project is
gradual accumulation, not any single bad decision.

- **No databases of blocks, no nested pages, no wikis.** The project's stated inspiration is
  Notepad++ (fast, plain, no ceremony) and its stated anti-pattern is Notion, which the author
  considers to have accumulated so many capabilities it lost its original point.
- **No collaboration, sharing, or multiplayer.**
- **No plugin system.** (Tempting, and a trap at this scale.)
- **No WYSIWYG editing.** See BR-7.
- **No AI features** in v1. Note that this is a *timing* decision, not a permanent one.
- **No voice notes.** Considered and cut during planning — it forced a heavier runtime and
  roughly doubled the scope for a feature that wasn't the core thesis.

### 1.5 Scope of v1

Done means all of this works and nothing more is built:

- [x] Global hotkey summons and dismisses the overlay
- [x] Type markdown immediately on summon, no clicking required
- [ ] Live preview pane, toggleable
- [ ] Mermaid diagrams render inside the preview
- [x] Notes autosave as `.md` files
- [x] Browse and search past notes
- [ ] Configurable hotkey and notes folder
- [ ] Cross-platform builds released by CI

---

## 2. Technology choices

### 2.1 Electron

**Chosen over Tauri v2.**

The recommendation on the table was Tauri: roughly a 10× smaller installer (~10MB vs ~90MB) and
far lower idle memory (~80MB vs ~250MB). The author chose Electron deliberately, accepting the
size cost, for:

- a single language across the whole codebase — Tauri's backend is Rust
- the largest desktop ecosystem and the most available answers when stuck
- faster iteration (no Rust compile step)

**The trade-off we are accepting:** the app will be ~80–90MB installed, and we cannot meaningfully
reduce that, because Chromium ships inside it. We compensate where we actually can — the frontend
bundle — via code splitting and lazy loading (see §3.4).

**Exit path if this becomes wrong:** the renderer is plain React/TypeScript with no Electron APIs
in it, talking to the outside world only through `window.api`. Porting to Tauri would mean
reimplementing the main process and the preload bridge — the entire UI would carry over unchanged.
This is a deliberate architectural hedge, not an accident. See §3.2.

### 2.2 electron-vite

Handles the awkward part of Electron tooling: three separate build targets (main, preload,
renderer) that need different module formats and different globals, plus hot reload wired across
all three. Rolling this by hand with raw Vite is a known time sink with no learning payoff.

### 2.3 TypeScript in `strict` mode

Non-negotiable given that learning is an explicit goal of the project. Strict mode is the
difference between TypeScript catching real bugs and TypeScript being decoration.

Note that `electron-vite` compiles with esbuild, which **strips** types without checking them. So
type errors would otherwise pass straight into a build. The `build` script therefore runs
`tsc --noEmit` first — that step is what makes the types load-bearing.

### 2.4 React 19

Chosen for ecosystem depth and transferability rather than technical necessity; the UI is small
enough that any framework would do. The one thing it genuinely buys us is that the editor
integration (§3.3) is a well-understood pattern in React.

### 2.5 CodeMirror 6 for the editor

**Chosen over Monaco and over WYSIWYG editors (TipTap / Milkdown).**

- **Monaco** is VS Code's editor: several MB, built for large codebases with language servers.
  Wrong tool, and it would dominate the bundle.
- **TipTap / Milkdown** give WYSIWYG markdown. Rejected on BR-7 — rich-text markdown editing is
  a deep, deep rabbit hole, and it puts a translation layer between the user and their file.
- **CodeMirror 6** is modular (you import only what you use), TypeScript-native, and plain-text
  first — which is exactly the Notepad++ ethos this product is aiming at.

### 2.6 marked + mermaid

`marked` parses markdown to HTML; it's small and fast. `mermaid` renders fenced ` ```mermaid `
blocks into SVG diagrams.

**mermaid is by far the largest dependency in the app** — larger than everything else combined.
It is therefore loaded with a dynamic `import()` that only fires when a note actually contains a
mermaid block. Notes without diagrams never pay for it. See §3.4.

### 2.7 No auto-updater — a supply-chain decision

`electron-updater` was planned early on. It will not be added. Worth stating the reasoning
precisely, because "we skipped a dependency" is normally the weaker argument.

An auto-updater is the most dangerous dependency an application can take. An ordinary package runs
with the privileges of the build; an updater is *designed* to fetch remote code and execute it on
the user's machine, indefinitely, without asking again. A compromised release of any other package
harms whoever rebuilds from it. A compromised updater harms everyone who ever installed. Combined
with §3.6's decision not to code-sign, there would be no second line of defence.

The cost is accepted and real: upgrading means re-downloading the executable. For a single-file
portable app that is a drag-and-drop.

This generalises into a standing rule. The app currently has **zero runtime dependencies** —
everything in `package.json` is a `devDependency` that Vite bundles at build time — and that is
treated as a property worth defending, not an accident. A new runtime dependency needs a reason
that survives being asked twice.

### 2.8 oxlint, not ESLint

ESLint was the plan. It turned out to be uninstallable: `typescript-eslint` declares a peer range of
`>=4.8.4 <6.1.0`, and this project is on TypeScript 7 (§2.3). No published version supports it, and
forcing the resolution would install a parser built against a compiler API that TS 7 replaced —
producing a linter that runs, reports nothing useful, and is trusted anyway.

Oxlint parses TypeScript natively, needs no TypeScript peer at all, and adds **2 packages instead
of roughly 100** — which happens to serve §2.7's posture as well.

**The trade-off:** oxlint has no type-aware rules, the class that needs a real type checker. 265
rules are active, including `react-hooks/exhaustive-deps`. Every suppression in `.oxlintrc.json`
carries its reasoning inline, because a disabled rule with no explanation is indistinguishable from
a bug someone gave up on.

Revisit if `typescript-eslint` gains TS 7 support.

---

## 3. Implementation choices

### 3.1 The three-process model

Electron apps are not one program. Understanding this is a prerequisite for reading the codebase.

```
MAIN (Node.js, full OS access)
  owns windows, the global hotkey, and all file I/O
        |
        |  IPC — structured message passing
        |
PRELOAD (the airlock)
  runs before the page; whitelists exactly which capabilities the UI may request
        |
        |  window.api.*
        |
RENDERER (Chromium, sandboxed)
  the React app: editor, preview, animations. No filesystem access.
```

**Why the airlock exists:** the renderer is a web page. If it could call `fs.writeFile` directly,
anything that ever got rendered — a pasted payload, a compromised dependency — could write
anywhere on disk. Electron sandboxes the renderer and requires capabilities to be explicitly
whitelisted.

The whitelist is the security boundary of the entire app, and it is designed around **intent, not
mechanism**: the renderer is given `saveNote(id, content)`, never `writeFile(path, data)`. The UI
can save *a note*; it cannot write *a file*. Path construction and validation stay in the main
process, where the renderer cannot influence them.

Corresponding settings: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.

### 3.2 The renderer knows nothing about Electron

No file in `src/renderer/` imports from `electron`. All privileged operations go through the
`window.api` surface defined in the preload script, typed by a shared interface.

Two payoffs: it keeps the security boundary honest, and it is what makes the Tauri exit path in
§2.1 cheap.

### 3.3 Window strategy — created once, hidden, never destroyed

BR-1 (instant summon) rules out creating the window when the hotkey fires; constructing a
`BrowserWindow` and booting a renderer takes hundreds of milliseconds.

Instead the window is built at app start, kept alive and hidden for the process lifetime, and the
hotkey only calls `show()`/`hide()`. Dismissing never destroys it. The cost is a little idle
memory; the benefit is that summoning is effectively instantaneous.

Related choices:
- `showInactive()` where appropriate, so summoning doesn't rip focus away destructively (BR-2)
- positioned on the display containing the **cursor**, not the primary display — the right
  behaviour on multi-monitor setups
- `alwaysOnTop` at the `screen-saver` level, so it floats above fullscreen apps
- placed slightly **above** vertical center, which reads as better-balanced than true center

### 3.4 Bundle discipline

Given §2.1, the runtime size is fixed and the frontend is the only place we control. Two measures:

1. **`manualChunks`** splits CodeMirror into its own chunk rather than one monolithic bundle.
2. **Dynamic `import('mermaid')`** defers the largest dependency until a note actually needs it,
   keeping cold start fast for the common case.

### 3.5 Visual approach — "glass" without native blur

The target aesthetic is Apple-like: real depth, motion with weight, restraint.

**The constraint worth knowing:** CSS `backdrop-filter` does *not* blur the desktop behind a
transparent Electron window — it only blurs page content beneath an element. True desktop blur
needs OS-level compositing: `backgroundMaterial: 'acrylic'` (Windows **11** only) or `vibrancy`
(macOS). The development machine for this project runs **Windows 10**, where neither is available.

So the default look does not depend on real blur. It uses a rich semi-opaque background, a
1px light top border to catch the "edge", and a large soft shadow for lift — which reads as glass
without needing compositor support. Native acrylic/vibrancy is enabled opportunistically where
the OS supports it, as an enhancement rather than a requirement.

Motion uses **spring physics**, not duration-based easing. Apple's characteristic feel comes from
motion that has weight and settles, and it is the single highest-leverage detail in the whole UI.

### 3.6 Portable executable, not an installer

The Windows target is `portable`: a single self-extracting `.exe` with no installer, no Start-menu
entry and no uninstaller.

The reasoning is that Note Taker is a background utility, and "download one file, double-click, it
works" is worth more here than integration with the OS's software inventory. It also lets the app
live on a USB stick or in a synced folder.

Two consequences follow, and they are the reason this is written down:

1. **`electron-updater` cannot update a portable build** — there is no install location to replace.
   This would have been a genuine tension with auto-update, and §2.7 dissolved it. The two
   decisions reinforce each other.
2. **The extraction directory is pinned** (`unpackDirName`). A portable target is a self-extracting
   archive; left to its default it unpacks ~350 MB to a fresh temp folder on *every* launch.

**Code signing is deliberately skipped.** A certificate is $200–400/year, and an OV certificate
still has to build SmartScreen reputation from zero. Users will see a SmartScreen warning on first
run. For a personal project that is accepted, and it is documented in the README rather than hidden.

### 3.7 Pure logic is separated so it can be tested

`notes.ts` imports `electron` at module scope, and `electron` cannot be imported outside an Electron
runtime. Any test wanting to assert on a string function would first have to mock the module — so
the pure half moved to `note-utils.ts`: `deriveTitle`, `assertValidId`, `byRecency`.

This is a small structural cost paid for a specific benefit. `assertValidId` is the security
boundary described in §3.1 — the check that makes path traversal unrepresentable — and a security
control that is not tested is a claim, not a control. Its tests are written as attacks (traversal,
absolute paths, UNC paths, null bytes, percent-encoding) rather than as examples.

The same split is what will make the search and markdown logic testable later.

---

## 4. Decision log

| Date | Decision | Status |
|------|----------|--------|
| 2026-08-07 | Overlay notes app, not a productivity suite | Settled |
| 2026-08-07 | Voice notes cut from scope | Settled |
| 2026-08-07 | Markdown files on disk, not SQLite | Settled |
| 2026-08-07 | Mermaid included, lazy-loaded | Settled |
| 2026-08-07 | Electron over Tauri, size cost accepted | Settled, revisitable (§2.1) |
| 2026-08-07 | CodeMirror 6 over Monaco/WYSIWYG | Settled |
| 2026-08-10 | Named **Note Taker** (was "Slate") | Settled |
| 2026-08-10 | Portable `.exe` over an NSIS installer | Settled (§3.6) |
| 2026-08-10 | No auto-updater, on supply-chain grounds | Settled (§2.7) |
| 2026-08-10 | Zero runtime dependencies treated as an invariant | Standing rule (§2.7) |
| 2026-08-10 | oxlint over ESLint — forced by TypeScript 7 | Settled, revisitable (§2.8) |
| 2026-08-10 | Hotkey stays `Ctrl+Space` — fewest keys wins | Settled, mitigated by 5.1 |
| 2026-08-10 | Notes default to `Documents/Note Taker`, changeable in settings | Settled |
| 2026-08-10 | Settings in a hand-rolled `settings.json`, not `electron-store` | Settled (§2.7) |
| 2026-08-10 | Public GitHub repository | Settled |

### Open questions

- Search: naive full-scan first. Only revisit if it gets slow at realistic note counts.
- Should the overlay hide automatically when it loses focus? Feels native, but risks vanishing
  mid-thought when you click elsewhere. Needs real-world use to decide.
- Note identity: filename-as-title, or frontmatter with a stable ID? Affects renaming.
- `Ctrl+Space` collides with the Windows input-language switcher and with Spotlight on macOS. The
  fewest-keys argument won for the default; the real fix is the configurable hotkey in Phase 5.1.
  Whether the *default* should also change is unresolved.
