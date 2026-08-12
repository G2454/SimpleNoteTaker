import { ipcMain } from 'electron'
import { IPC } from '../shared/constants'
import {
  createNote,
  deleteNote,
  listNotes,
  readNote,
  revealNotesFolder,
  searchNotes,
  writeNote
} from './notes'

/**
 * IPC handlers for note storage.
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

  ipcMain.handle(IPC.notesDelete, (_event, id: unknown) => deleteNote(asString(id, 'id')))

  ipcMain.handle(IPC.notesSearch, (_event, query: unknown) => searchNotes(asString(query, 'query')))

  ipcMain.handle(IPC.notesRevealFolder, () => revealNotesFolder())
}

/**
 * TypeScript types are erased at runtime and stop at the process boundary
 * anyway: a compromised renderer can invoke a channel with any payload at all.
 * These arguments are untrusted input and get checked like any other.
 */
function asString(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new TypeError(`Expected "${field}" to be a string, received ${typeof value}`)
  }
  return value
}
