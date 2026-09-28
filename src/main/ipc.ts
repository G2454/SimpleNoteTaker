import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { IPC } from '../shared/constants'
import { isExternallyOpenable } from '../shared/urls'
import { asSettingsPatch, asString } from './ipc-validation'
import {
  createNote,
  deleteNote,
  listNotes,
  readNote,
  renameNote,
  revealNotesFolder,
  searchNotes,
  writeNote
} from './notes'
import { getSettings, notesDirectory, updateSettings } from './settings'
import { positionOnActiveDisplay } from './window'

/**
 * IPC handlers.
 *
 * `handle` (rather than `on`) pairs with `invoke` in the renderer and gives us
 * promises: a thrown error here rejects the renderer's promise instead of
 * vanishing, which matters because these are the operations that can fail.
 */
export function registerNoteHandlers(): void {
  ipcMain.handle(IPC.notesList, () => listNotes())

  ipcMain.handle(IPC.notesRead, (_event, id: unknown) => readNote(asString(id, 'id')))

  ipcMain.handle(IPC.notesWrite, (_event, id: unknown, content: unknown) =>
    writeNote(asString(id, 'id'), asString(content, 'content'))
  )

  ipcMain.handle(IPC.notesCreate, () => createNote())

  ipcMain.handle(IPC.notesRename, (_event, id: unknown, name: unknown) =>
    renameNote(asString(id, 'id'), asString(name, 'name'))
  )

  ipcMain.handle(IPC.notesDelete, (_event, id: unknown) => deleteNote(asString(id, 'id')))

  ipcMain.handle(IPC.notesSearch, (_event, query: unknown) => searchNotes(asString(query, 'query')))

  ipcMain.handle(IPC.notesRevealFolder, () => revealNotesFolder())

  /**
   * Opens a link from the preview in the user's browser.
   *
   * The renderer checks the URL before it renders the link, and checks it
   * again before calling this — and neither check counts. The renderer is the
   * process displaying untrusted note content, so it is the one assumed to be
   * compromised; `shell.openExternal` hands a string to the operating system
   * to act on, which is far too much to take on a caller's word.
   *
   * Returns whether the URL was accepted rather than throwing: a refused link
   * is a note being odd, not the app malfunctioning.
   */
  ipcMain.handle(IPC.shellOpenExternal, async (_event, url: unknown) => {
    const target = asString(url, 'url')
    if (!isExternallyOpenable(target)) return false

    await shell.openExternal(target)
    return true
  })
}

export interface SettingsHandlerOptions {
  /** Claims a new accelerator, returning false if another app owns it. */
  applyHotkey: (accelerator: string) => boolean
  /** The overlay, used as the parent for the folder picker. */
  getWindow: () => BrowserWindow | null
}

export function registerSettingsHandlers({
  applyHotkey,
  getWindow
}: SettingsHandlerOptions): void {
  ipcMain.handle(IPC.settingsGet, () => getSettings())

  ipcMain.handle(IPC.settingsUpdate, async (_event, patch: unknown) => {
    const sizeBefore = getSettings().overlaySize
    const result = await updateSettings(asSettingsPatch(patch), { applyHotkey })

    // Resize straight away rather than on the next summon, so the choice can be
    // seen and judged instead of guessed at. Only when it actually changed: this
    // also recentres the window, which would otherwise yank a panel the user had
    // dragged aside back to the middle every time they toggled any setting.
    if (result.settings.overlaySize !== sizeBefore) {
      const window = getWindow()
      if (window) positionOnActiveDisplay(window)
    }

    return result
  })

  ipcMain.handle(IPC.settingsChooseFolder, async () => {
    const parent = getWindow()

    // Parented to the overlay deliberately. The overlay sits at the
    // 'screen-saver' always-on-top level, so an unparented dialog would open
    // *behind* it and look like the app had frozen.
    const options: Electron.OpenDialogOptions = {
      title: 'Choose notes folder',
      defaultPath: notesDirectory(),
      properties: ['openDirectory', 'createDirectory']
    }

    const result = parent
      ? await dialog.showOpenDialog(parent, options)
      : await dialog.showOpenDialog(options)

    return result.canceled ? null : (result.filePaths[0] ?? null)
  })
}
