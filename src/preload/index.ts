import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/constants'
import type { Note, NoteMeta } from '../shared/types'

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
 */
const api = {
  /** Ask the main process to dismiss the overlay. */
  hide(): void {
    ipcRenderer.send(IPC.hideOverlay)
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

  notes: {
    list: (): Promise<NoteMeta[]> => ipcRenderer.invoke(IPC.notesList),
    read: (id: string): Promise<Note> => ipcRenderer.invoke(IPC.notesRead, id),
    write: (id: string, content: string): Promise<NoteMeta> =>
      ipcRenderer.invoke(IPC.notesWrite, id, content),
    create: (): Promise<Note> => ipcRenderer.invoke(IPC.notesCreate),
    remove: (id: string): Promise<void> => ipcRenderer.invoke(IPC.notesDelete, id),
    search: (query: string): Promise<NoteMeta[]> => ipcRenderer.invoke(IPC.notesSearch, query),
    revealFolder: (): Promise<void> => ipcRenderer.invoke(IPC.notesRevealFolder)
  }
}

export type NoteTakerApi = typeof api

// With contextIsolation on, this is the only way to put something on the
// renderer's `window`. A plain assignment would land in the preload's own
// isolated context and be invisible to the page.
contextBridge.exposeInMainWorld('api', api)
