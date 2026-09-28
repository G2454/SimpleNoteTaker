/**
 * Values shared by the main process and the renderer.
 * Keeping them here stops the two sides from drifting apart.
 */

/** Default summon hotkey. Electron maps `CommandOrControl` to Cmd on macOS, Ctrl elsewhere. */
export const DEFAULT_HOTKEY = 'CommandOrControl+Space'

export const WINDOW_WIDTH = 760
export const WINDOW_HEIGHT = 520

/**
 * Vertical placement as a fraction of the work area height.
 * 0.5 is true center; slightly above center reads as better balanced,
 * because we perceive the optical center as higher than the geometric one.
 */
export const VERTICAL_PLACEMENT = 0.38

/** IPC channel names. Typos here are runtime bugs, so they live in one place. */
export const IPC = {
  hideOverlay: 'overlay:hide',
  overlayShown: 'overlay:shown',

  notesList: 'notes:list',
  notesRead: 'notes:read',
  notesWrite: 'notes:write',
  notesCreate: 'notes:create',
  notesDelete: 'notes:delete',
  notesSearch: 'notes:search',
  notesRename: 'notes:rename',
  notesRevealFolder: 'notes:reveal-folder',

  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',
  settingsChooseFolder: 'settings:choose-folder',

  /** Hands a link from the preview to the user's browser. See `shared/urls.ts`. */
  shellOpenExternal: 'shell:open-external',

  /** Main -> renderer: the tray asked for the options screen. */
  openSettings: 'ui:open-settings'
} as const

/** How long typing must pause before an autosave fires. */
export const AUTOSAVE_DEBOUNCE_MS = 500

/**
 * How long typing must pause before the preview re-renders.
 *
 * Short: parsing markdown is cheap, and a preview that visibly lags behind the
 * cursor feels broken rather than efficient.
 */
export const PREVIEW_DEBOUNCE_MS = 150

/**
 * How long before an unseen diagram is laid out.
 *
 * Longer than the preview, because it costs more and because a diagram is
 * unparseable for most of the time you spend writing one — re-running the
 * layout engine on every half-finished arrow would waste the work and flicker.
 */
export const DIAGRAM_DEBOUNCE_MS = 300

/** Longest note name we accept, in characters. */
export const MAX_NOTE_NAME_LENGTH = 80

/** Name given to a note the user hasn't named yet. */
export const DEFAULT_NOTE_NAME = 'Untitled'

/** Longest derived title we keep, in characters. Titles are previews, not names. */
export const MAX_TITLE_LENGTH = 80
