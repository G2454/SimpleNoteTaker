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
  notesRevealFolder: 'notes:reveal-folder'
} as const

/** How long typing must pause before an autosave fires. */
export const AUTOSAVE_DEBOUNCE_MS = 500
