import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { shell } from 'electron'
import { DEFAULT_NOTE_NAME } from '../shared/constants'
import type { Note, NoteMeta } from '../shared/types'
import { assertValidId, deriveTitle, nextAvailableName, sanitizeNoteName } from './note-utils'
import { byRecency } from '../shared/sorting'
import { notesDirectory } from './settings'

/**
 * Note storage: one markdown file per note, in a folder the user chooses (BR-3).
 *
 * Everything here runs in the main process. The renderer never sees a path and
 * has no way to construct one — see `assertValidId` in `./note-utils`, which
 * holds the pure logic so it can be unit tested without an Electron runtime.
 *
 * A note's id *is* its filename, which is also its display name. Renaming a
 * note therefore renames the file: what you see in the app is what you see in
 * Explorer. The cost is that ids are not stable across renames, so every
 * rename returns the new id and callers must adopt it.
 */

const EXTENSION = '.md'

async function ensureNotesDir(): Promise<string> {
  const dir = notesDirectory()
  await mkdir(dir, { recursive: true })
  return dir
}

/**
 * Builds the path for a note id, refusing anything that escapes the folder.
 *
 * Two independent checks, deliberately:
 *
 *  1. `assertValidId` rejects the *shape* of a dangerous name. It is readable
 *     and unit-tested, and it produces the error the user would see.
 *  2. The containment check below verifies the *result* — that the resolved
 *     path really is a direct child of the notes directory. This is the check
 *     that holds even if rule 1 has a gap, and it costs nothing.
 *
 * `relative()` is the reliable way to express this: any escape produces a path
 * starting with `..`, and any nesting introduces a separator.
 */
function pathFor(id: string): string {
  assertValidId(id)

  const dir = notesDirectory()
  const full = resolve(dir, id + EXTENSION)
  const rel = relative(dir, full)

  if (rel.startsWith('..') || isAbsolute(rel) || rel.includes(sep)) {
    throw new Error(`Refusing to leave the notes folder: ${JSON.stringify(id)}`)
  }
  return full
}

/** Just the ids, for collision checks. Cheaper than `readAll` — no file reads. */
async function listIds(): Promise<string[]> {
  const dir = await ensureNotesDir()
  const entries = await readdir(dir, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(EXTENSION))
    .map((entry) => basename(entry.name, EXTENSION))
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

const toMeta = ({ id, title, updatedAt }: Note): NoteMeta => ({ id, title, updatedAt })

export async function listNotes(): Promise<NoteMeta[]> {
  return (await readAll()).map(toMeta)
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
        // The name is searched too — it is the thing the user chose, so it is
        // often what they remember.
        note.id.toLowerCase().includes(needle) ||
        note.title.toLowerCase().includes(needle) ||
        note.content.toLowerCase().includes(needle)
    )
    .map(toMeta)
}

export async function readNote(id: string): Promise<Note> {
  const path = pathFor(id)
  const [content, stats] = await Promise.all([readFile(path, 'utf8'), stat(path)])
  return { id, title: deriveTitle(content), updatedAt: stats.mtimeMs, content }
}

export async function writeNote(id: string, content: string): Promise<NoteMeta> {
  await ensureNotesDir()
  await writeFile(pathFor(id), content, 'utf8')
  return { id, title: deriveTitle(content), updatedAt: Date.now() }
}

/**
 * Creates an empty note.
 *
 * Named rather than timestamped: the filename is what the user sees both in the
 * app and in their file manager, and `2026-08-09-2222-de2g.md` is meaningless
 * in either place. Collisions get a numeric suffix, so creating three unnamed
 * notes gives "Untitled", "Untitled 2", "Untitled 3".
 */
export async function createNote(name: string = DEFAULT_NOTE_NAME): Promise<Note> {
  const id = nextAvailableName(sanitizeNoteName(name), await listIds())
  await writeNote(id, '')
  return { id, title: deriveTitle(''), updatedAt: Date.now(), content: '' }
}

/**
 * Renames a note by renaming its file.
 *
 * On a collision the new name gets a numeric suffix rather than an error or an
 * overwrite. Overwriting would destroy a note — unacceptable under BR-6 — and
 * erroring would leave the user to invent a unique name themselves. The
 * resulting id is returned, so the UI can show what the note is actually called.
 */
export async function renameNote(id: string, requestedName: string): Promise<NoteMeta> {
  const desired = sanitizeNoteName(requestedName)
  const from = pathFor(id)

  // A no-op rename still has to report the current state, and `fs.rename` onto
  // itself is not reliably a no-op across platforms.
  if (desired === id) return toMeta(await readNote(id))

  // Exclude this note from the collision check, case-insensitively: renaming
  // "notes" to "Notes" is a legitimate change of capitalisation, not a clash.
  const taken = (await listIds()).filter((other) => other.toLowerCase() !== id.toLowerCase())
  const target = nextAvailableName(desired, taken)

  await rename(from, pathFor(target))
  return toMeta(await readNote(target))
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
