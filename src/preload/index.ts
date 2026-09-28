import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/constants'
import type { Note, NoteMeta, Settings, SettingsResult } from '../shared/types'

/**
 * The airlock. See DOCUMENTATION.md §3.1.
 *
 * This is the ONLY channel through which the React app can reach the operating
 * system. Everything exposed here is a capability the renderer permanently has,
 * so the surface is kept deliberately small and phrased in terms of *intent*
 * ("save this note") rather than *mechanism* ("write to this path").
 *
 * Note there is no `readFile`, no `writeFile`, and no path anywhere in this
 * file. The renderer cannot express the idea of a filesystem location, which is
 * what makes path traversal impossible rather than merely guarded against.
 *
 * The one apparent exception is `settings.notesDir`, which is a real path. It
 * is safe because the renderer can only *choose* it through the OS folder
 * picker — `chooseFolder` returns a path the user selected in a native dialog,
 * and the renderer can never invent one that the user did not approve.
 */
const api = {
  /** Ask the main process to dismiss the overlay. */
  hide(): void {
    ipcRenderer.send(IPC.hideOverlay)
  },

  /**
   * Hands a link from the preview to the user's default browser.
   *
   * Phrased as intent, like everything else here: the renderer asks for a URL
   * to be opened, and the main process decides whether that is allowed. It
   * resolves to false for anything outside the scheme allowlist in
   * `shared/urls.ts`, so this cannot be used to launch a local program.
   */
  openExternal(url: string): Promise<boolean> {
    return ipcRenderer.invoke(IPC.shellOpenExternal, url)
  },

  /**
   * Subscribe to "the overlay just became visible".
   * Returns an unsubscribe function — without it, React strict mode's
   * double-mounting would stack duplicate listeners.
   */
  onShown(callback: () => void): () => void {
    const listener = (): void => callback()
    ipcRenderer.on(IPC.overlayShown, listener)
    return () => ipcRenderer.removeListener(IPC.overlayShown, listener)
  },

  /** Subscribe to the tray's "Options…" item. Same unsubscribe contract. */
  onOpenSettings(callback: () => void): () => void {
    const listener = (): void => callback()
    ipcRenderer.on(IPC.openSettings, listener)
    return () => ipcRenderer.removeListener(IPC.openSettings, listener)
  },

  notes: {
    list: (): Promise<NoteMeta[]> => ipcRenderer.invoke(IPC.notesList),
    read: (id: string): Promise<Note> => ipcRenderer.invoke(IPC.notesRead, id),
    write: (id: string, content: string): Promise<NoteMeta> =>
      ipcRenderer.invoke(IPC.notesWrite, id, content),
    create: (): Promise<Note> => ipcRenderer.invoke(IPC.notesCreate),
    /**
     * Renames the note's file. The returned meta carries the *actual* new id,
     * which may differ from what was asked for if the name was already taken.
     */
    rename: (id: string, name: string): Promise<NoteMeta> =>
      ipcRenderer.invoke(IPC.notesRename, id, name),
    remove: (id: string): Promise<void> => ipcRenderer.invoke(IPC.notesDelete, id),
    search: (query: string): Promise<NoteMeta[]> => ipcRenderer.invoke(IPC.notesSearch, query),
    revealFolder: (): Promise<void> => ipcRenderer.invoke(IPC.notesRevealFolder)
  },

  settings: {
    get: (): Promise<Settings> => ipcRenderer.invoke(IPC.settingsGet),
    /** Applies a partial change. Check `error` — some updates can be refused. */
    update: (patch: Partial<Settings>): Promise<SettingsResult> =>
      ipcRenderer.invoke(IPC.settingsUpdate, patch),
    /** Opens the native folder picker. Resolves to null if cancelled. */
    chooseFolder: (): Promise<string | null> => ipcRenderer.invoke(IPC.settingsChooseFolder)
  }
}

export type NoteTakerApi = typeof api

// With contextIsolation on, this is the only way to put something on the
// renderer's `window`. A plain assignment would land in the preload's own
// isolated context and be invisible to the page.
contextBridge.exposeInMainWorld('api', api)
