import { isAbsolute, join } from 'node:path'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { app, nativeTheme } from 'electron'
import { DEFAULT_HOTKEY } from '../shared/constants'
import type { OverlaySize, Settings, ThemePreference } from '../shared/types'

/**
 * Persisted user options.
 *
 * Stored as JSON in the app's userData folder rather than alongside the notes:
 * the notes directory is the user's (BR-3) and should contain nothing but their
 * markdown. It is also the thing this file can point somewhere else, so keeping
 * the setting inside it would be circular.
 */

/** The subset actually written to disk. `launchAtLogin` lives in the OS. */
interface StoredSettings {
  hotkey: string
  notesDir: string
  theme: ThemePreference
  overlaySize: OverlaySize
}

const THEMES = new Set<ThemePreference>(['system', 'light', 'dark'])
const OVERLAY_SIZES = new Set<OverlaySize>(['small', 'medium', 'full'])

/**
 * In-memory copy, so `notesDirectory()` can stay synchronous — it is called on
 * every path the storage layer builds, and making that async would spread
 * `await` through code that has no other reason to be asynchronous.
 */
let cache: StoredSettings | null = null

/**
 * Where settings live.
 *
 * `PORTABLE_EXECUTABLE_DIR` is set by electron-builder's portable target to the
 * folder holding the .exe. Writing there keeps a USB copy self-contained: its
 * options travel with it, instead of being left behind in the AppData of
 * whichever machine it was last plugged into. Installed builds fall back to the
 * normal per-user location.
 */
function settingsDir(): string {
  return process.env['PORTABLE_EXECUTABLE_DIR'] ?? app.getPath('userData')
}

function settingsPath(): string {
  return join(settingsDir(), 'settings.json')
}

function defaultNotesDir(): string {
  return join(app.getPath('documents'), 'Note Taker')
}

function defaults(): StoredSettings {
  // `small` is the size the app has always been, so an existing settings file
  // with no `overlaySize` key keeps the window the user already knows.
  return {
    hotkey: DEFAULT_HOTKEY,
    notesDir: defaultNotesDir(),
    theme: 'system',
    overlaySize: 'small'
  }
}

/**
 * Reads settings from disk, falling back to defaults field by field.
 *
 * The file is plain JSON in a folder the user can open, so it must be treated
 * as untrusted input: it may be absent, truncated, hand-edited, or left over
 * from a future version. A malformed value must never stop the app booting,
 * because the app has no UI to fix it with until it has booted.
 */
export async function loadSettings(): Promise<StoredSettings> {
  const fallback = defaults()

  let stored: Partial<Record<keyof StoredSettings, unknown>> = {}
  try {
    const parsed: unknown = JSON.parse(await readFile(settingsPath(), 'utf8'))
    if (parsed && typeof parsed === 'object') {
      stored = parsed as Partial<Record<keyof StoredSettings, unknown>>
    }
  } catch {
    // Missing or unreadable: defaults are correct, and this is the normal path
    // on first run.
  }

  cache = {
    hotkey:
      typeof stored.hotkey === 'string' && stored.hotkey.trim().length > 0
        ? stored.hotkey
        : fallback.hotkey,
    // Relative paths would resolve against the process's working directory,
    // which for a packaged app is wherever the user happened to launch it from.
    notesDir:
      typeof stored.notesDir === 'string' && isAbsolute(stored.notesDir)
        ? stored.notesDir
        : fallback.notesDir,
    theme: THEMES.has(stored.theme as ThemePreference)
      ? (stored.theme as ThemePreference)
      : fallback.theme,
    overlaySize: OVERLAY_SIZES.has(stored.overlaySize as OverlaySize)
      ? (stored.overlaySize as OverlaySize)
      : fallback.overlaySize
  }

  applyTheme(cache.theme)
  return cache
}

/**
 * Where notes live. Synchronous and always answerable — before `loadSettings`
 * has run it reports the default, which is also what a first run would use.
 */
export function notesDirectory(): string {
  return cache?.notesDir ?? defaultNotesDir()
}

export function currentHotkey(): string {
  return cache?.hotkey ?? DEFAULT_HOTKEY
}

/**
 * The chosen window size. Synchronous and always answerable, like
 * `notesDirectory` — the window is created before anything can await settings.
 */
export function currentOverlaySize(): OverlaySize {
  return cache?.overlaySize ?? 'small'
}

/** Everything the renderer's options screen needs, including OS-owned state. */
export function getSettings(): Settings {
  const stored = cache ?? defaults()
  return {
    ...stored,
    // Read live from the OS rather than mirrored in our JSON: the user can
    // change startup items outside this app, and a stale copy would show the
    // wrong state and then overwrite the real one on the next save.
    launchAtLogin: app.getLoginItemSettings().openAtLogin
  }
}

/**
 * `nativeTheme.themeSource` is what makes an explicit light/dark choice work
 * without any CSS changes: Electron feeds it into the renderer, so the existing
 * `prefers-color-scheme` media queries simply report what the user picked.
 */
function applyTheme(theme: ThemePreference): void {
  nativeTheme.themeSource = theme
}

async function persist(next: StoredSettings): Promise<void> {
  cache = next
  await mkdir(settingsDir(), { recursive: true })
  await writeFile(settingsPath(), JSON.stringify(next, null, 2), 'utf8')
}

export interface UpdateOptions {
  /**
   * Attempts to claim a new hotkey. Returns false if another application owns
   * it — in which case the change is rejected and the old one stays active.
   *
   * Registration lives in `index.ts` alongside the rest of the app lifecycle;
   * this module only decides what the settings *are*.
   */
  applyHotkey: (accelerator: string) => boolean
}

/**
 * Applies a partial settings change, persisting only what succeeded.
 *
 * Returns the resulting settings plus a message for anything that could not be
 * applied, rather than throwing: a rejected hotkey is a normal outcome the user
 * needs to see and correct, not an exceptional condition.
 */
export async function updateSettings(
  patch: Partial<Settings>,
  { applyHotkey }: UpdateOptions
): Promise<{ settings: Settings; error?: string }> {
  const current = cache ?? (await loadSettings())
  const next: StoredSettings = { ...current }
  let error: string | undefined

  if (typeof patch.hotkey === 'string' && patch.hotkey !== current.hotkey) {
    if (patch.hotkey.trim().length === 0) {
      error = 'Shortcut cannot be empty.'
    } else if (applyHotkey(patch.hotkey)) {
      next.hotkey = patch.hotkey
    } else {
      error = `Another application is already using ${patch.hotkey}.`
    }
  }

  if (typeof patch.notesDir === 'string' && patch.notesDir !== current.notesDir) {
    if (!isAbsolute(patch.notesDir)) {
      error = 'Notes folder must be an absolute path.'
    } else {
      try {
        // Create it now so a bad path fails here, with the user watching,
        // rather than on the next silent autosave.
        await mkdir(patch.notesDir, { recursive: true })
        next.notesDir = patch.notesDir
      } catch (cause) {
        error = `Could not use that folder: ${(cause as Error).message}`
      }
    }
  }

  if (patch.theme && THEMES.has(patch.theme)) {
    next.theme = patch.theme
    applyTheme(next.theme)
  }

  // No failure mode worth reporting: every preset is fitted to whatever display
  // the overlay lands on, so there is no such thing as one that will not fit.
  if (patch.overlaySize && OVERLAY_SIZES.has(patch.overlaySize)) {
    next.overlaySize = patch.overlaySize
  }

  if (typeof patch.launchAtLogin === 'boolean') {
    app.setLoginItemSettings({
      openAtLogin: patch.launchAtLogin,
      // macOS only: start without showing a window. On Windows the overlay is
      // hidden at startup anyway, so there is nothing to suppress.
      openAsHidden: true
    })
  }

  await persist(next)
  return { settings: getSettings(), error }
}
