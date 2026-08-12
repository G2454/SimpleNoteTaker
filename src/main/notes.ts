import { basename, join } from 'node:path'
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { app, shell } from 'electron'
import type { Note, NoteMeta } from '../shared/types'
import { assertValidId, byRecency, deriveTitle } from './note-utils'

/**
 * Note storage: one markdown file per note, in a normal folder (BR-3).
 *
 * Everything here runs in the main process. The renderer never sees a path and
 * has no way to construct one — see `assertValidId` in `./note-utils`, which
 * holds the pure logic so it can be unit tested without an Electron runtime.
 */

const EXTENSION = '.md'

/**
 * Default location. Documents rather than the app's private userData folder,
 * because BR-3 says the user owns these files: they should be easy to find,
 * back up, and sync without knowing anything about Electron.
 */
function notesDir(): string {
  return join(app.getPath('documents'), 'Note Taker')
}

async function ensureNotesDir(): Promise<string> {
  const dir = notesDir()
  await mkdir(dir, { recursive: true })
  return dir
}

function pathFor(id: string): string {
  assertValidId(id)
  return join(notesDir(), id + EXTENSION)
}

/** Every note with its content, newest first. The shared basis for list and search. */
async function readAll(): Promise<Note[]> {
  const dir = await ensureNotesDir()
  const entries = await readdir(dir, { withFileTypes: true })

  const notes = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(EXTENSION))
      .map(async (entry) => {
        const id = basename(entry.name, EXTENSION)
        const full = join(dir, entry.name)
        const [content, stats] = await Promise.all([readFile(full, 'utf8'), stat(full)])
        return { id, title: deriveTitle(content), updatedAt: stats.mtimeMs, content }
      })
  )

  return notes.sort(byRecency)
}

export async function listNotes(): Promise<NoteMeta[]> {
  return (await readAll()).map(({ id, title, updatedAt }) => ({ id, title, updatedAt }))
}

/**
 * Full-text search across every note.
 *
 * Deliberately naive: it reads every file on every query. At a realistic number
 * of personal notes this is imperceptible, and an index would be a second
 * source of truth to keep in sync with the files — which BR-3 says are
 * authoritative. Revisit only if it actually becomes slow.
 *
 * Runs in the main process so note content never crosses IPC just to be filtered.
 */
export async function searchNotes(query: string): Promise<NoteMeta[]> {
  const needle = query.trim().toLowerCase()
  if (!needle) return listNotes()

  return (await readAll())
    .filter(
      (note) =>
        note.title.toLowerCase().includes(needle) || note.content.toLowerCase().includes(needle)
    )
    .map(({ id, title, updatedAt }) => ({ id, title, updatedAt }))
}

export async function readNote(id: string): Promise<Note> {
  const path = pathFor(id)
  const [content, stats] = await Promise.all([readFile(path, 'utf8'), stat(path)])
  return { id, title: deriveTitle(content), updatedAt: stats.mtimeMs, content }
}

export async function writeNote(id: string, content: string): Promise<NoteMeta> {
  await ensureNotesDir()
  const path = pathFor(id)
  await writeFile(path, content, 'utf8')
  return { id, title: deriveTitle(content), updatedAt: Date.now() }
}

/**
 * IDs are timestamp-based: sortable, human-readable, and collision-free within
 * a second thanks to the random suffix. They are never derived from the note's
 * text, so renaming a heading can never move or clobber a file.
 */
export async function createNote(): Promise<Note> {
  await ensureNotesDir()

  const now = new Date()
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0')
  ].join('-')
  const suffix = Math.random().toString(36).slice(2, 6)
  const id = `${stamp}-${suffix}`

  await writeNote(id, '')
  return { id, title: 'Untitled', updatedAt: Date.now(), content: '' }
}

export async function deleteNote(id: string): Promise<void> {
  // `rm` rather than `unlink` so deleting an already-missing note is a no-op
  // instead of a crash — the renderer may retry after an optimistic update.
  await rm(pathFor(id), { force: true })
}

/** Opens the notes folder in Explorer/Finder — reinforces that the files are the user's. */
export async function revealNotesFolder(): Promise<void> {
  await shell.openPath(await ensureNotesDir())
}
