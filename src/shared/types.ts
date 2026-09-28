/** Shape of the data crossing the IPC boundary. Imported by both processes. */

/** Enough to render a note in the list without loading its body. */
export interface NoteMeta {
  /**
   * Filename without the `.md` extension.
   *
   * This is both the note's identity *and* its display name: renaming a note
   * renames the file on disk, so what you see in the list is what you see in
   * Explorer (BR-3). Ids are therefore not stable across renames — callers
   * holding one must update it from the result of `rename`.
   */
  id: string
  /**
   * First meaningful line of the content, heading markers stripped.
   * Used for search and previews, never for identity.
   */
  title: string
  /** Unix ms, from the file's mtime. */
  updatedAt: number
}

export interface Note extends NoteMeta {
  content: string
}

export type ThemePreference = 'system' | 'light' | 'dark'

/**
 * How much of the screen the overlay takes.
 *
 * Three fixed choices rather than a draggable edge: the window is repositioned
 * on every summon (BR-1 keeps one window alive for the whole session), so a
 * freely resized one would need its size remembered and re-fitted whenever the
 * user moved to a display of a different shape. A preset survives that by
 * being recomputed from the work area each time.
 */
export type OverlaySize = 'small' | 'medium' | 'full'

/** User-facing options. Persisted as JSON in the app's userData folder. */
export interface Settings {
  /** Electron accelerator string, e.g. `CommandOrControl+Space`. */
  hotkey: string
  /** Absolute path to the notes folder. Always resolved — never null. */
  notesDir: string
  theme: ThemePreference
  /** Small, medium, or the whole work area. See `shared/overlay-size.ts`. */
  overlaySize: OverlaySize
  /**
   * Read from and written to the OS, not the settings file — the operating
   * system is the source of truth, and the two could otherwise disagree after
   * a user edits their startup items directly.
   */
  launchAtLogin: boolean
}

/**
 * Result of applying a settings change.
 *
 * Some updates can fail for reasons outside our control — a hotkey another
 * application already owns, a folder that can't be created. The settings that
 * *did* apply are still returned, alongside a message describing what didn't.
 */
export interface SettingsResult {
  settings: Settings
  error?: string
}
