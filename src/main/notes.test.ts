import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Storage tests, against a real temporary directory.
 *
 * These are integration tests on purpose. The interesting failures in this
 * module are not logic errors — they are what actually lands on disk: whether a
 * rename leaves the old file behind, whether a collision overwrites a note,
 * whether a crafted id escapes the folder. A mocked filesystem would assert
 * that we *called* rename, which is the part that was never in doubt.
 *
 * `vi.hoisted` is required because `vi.mock` factories are lifted above the
 * imports: a plain `let` would still be in its temporal dead zone when the
 * factory runs.
 */
/**
 * `dir` is the notes folder; `root` is a private parent holding it.
 *
 * The nesting matters for the containment test below, which checks that an
 * escaping id writes nothing *outside* the notes folder by comparing the parent
 * before and after. Using the system temp directory as that parent made the
 * assertion race every other test file — and every other process on the machine
 * — to create a directory in the window between the two reads.
 */
const state = vi.hoisted(() => ({ dir: '', root: '' }))

// `notes.ts` reaches for the notes folder through settings, which needs a real
// Electron `app`. Replacing it points storage at the temp directory instead.
vi.mock('./settings', () => ({ notesDirectory: () => state.dir }))
vi.mock('electron', () => ({ shell: { openPath: vi.fn() } }))

const {
  createNote,
  deleteNote,
  listNotes,
  readNote,
  renameNote,
  searchNotes,
  writeNote
} = await import('./notes')

/** Filenames actually present on disk, sorted for stable comparison. */
async function filesOnDisk(): Promise<string[]> {
  return (await readdir(state.dir)).sort()
}

beforeEach(async () => {
  state.root = await mkdtemp(join(tmpdir(), 'note-taker-test-'))
  state.dir = join(state.root, 'notes')
  await mkdir(state.dir, { recursive: true })
})

afterEach(async () => {
  await rm(state.root, { recursive: true, force: true })
})

describe('createNote', () => {
  it('creates a named file, not a timestamped one', async () => {
    const note = await createNote()
    expect(note.id).toBe('Untitled')
    expect(await filesOnDisk()).toEqual(['Untitled.md'])
  })

  it('numbers subsequent unnamed notes instead of colliding', async () => {
    await createNote()
    await createNote()
    await createNote()
    expect(await filesOnDisk()).toEqual(['Untitled 2.md', 'Untitled 3.md', 'Untitled.md'])
  })

  it('starts empty', async () => {
    const note = await createNote()
    expect(note.content).toBe('')
    expect(await readFile(join(state.dir, 'Untitled.md'), 'utf8')).toBe('')
  })

  it('sanitizes a supplied name', async () => {
    const note = await createNote('Q3: Plan')
    expect(note.id).toBe('Q3 Plan')
    expect(await filesOnDisk()).toEqual(['Q3 Plan.md'])
  })
})

describe('writeNote and readNote', () => {
  it('round-trips content', async () => {
    await createNote()
    await writeNote('Untitled', '# Hello\n\nbody')
    expect((await readNote('Untitled')).content).toBe('# Hello\n\nbody')
  })

  it('derives the title from the content, not the filename', async () => {
    await writeNote('Groceries', '# Shopping list\nmilk')
    expect((await readNote('Groceries')).title).toBe('Shopping list')
  })

  it('overwrites rather than appending', async () => {
    await writeNote('Note', 'first')
    await writeNote('Note', 'second')
    expect((await readNote('Note')).content).toBe('second')
  })

  it('creates the notes folder if it has been deleted underneath us', async () => {
    // The folder is the user's, in Documents — they can move or delete it
    // between one autosave and the next.
    await rm(state.dir, { recursive: true, force: true })
    await writeNote('Recovered', 'still here')
    expect((await readNote('Recovered')).content).toBe('still here')
  })
})

describe('listNotes', () => {
  it('returns most recently updated first', async () => {
    await writeNote('oldest', 'a')
    await new Promise((resolve) => setTimeout(resolve, 12)) // mtime resolution
    await writeNote('newest', 'b')

    expect((await listNotes()).map((note) => note.id)).toEqual(['newest', 'oldest'])
  })

  it('ignores files that are not markdown', async () => {
    await writeNote('Real', 'note')
    await writeFile(join(state.dir, 'notes.txt'), 'not a note')
    await writeFile(join(state.dir, '.DS_Store'), '')

    expect((await listNotes()).map((note) => note.id)).toEqual(['Real'])
  })

  it('is empty, not broken, when there are no notes', async () => {
    expect(await listNotes()).toEqual([])
  })
})

describe('searchNotes', () => {
  beforeEach(async () => {
    await writeNote('Shopping', '# Groceries\nmilk and eggs')
    await writeNote('Standup', '# Notes\ndiscussed the milk budget')
    await writeNote('Empty', '')
  })

  it('matches note content', async () => {
    expect((await searchNotes('eggs')).map((n) => n.id)).toEqual(['Shopping'])
  })

  it('matches the note name, since that is what the user chose', async () => {
    expect((await searchNotes('standup')).map((n) => n.id)).toEqual(['Standup'])
  })

  it('matches the derived title', async () => {
    expect((await searchNotes('groceries')).map((n) => n.id)).toEqual(['Shopping'])
  })

  it('is case-insensitive', async () => {
    expect((await searchNotes('MILK')).map((n) => n.id).sort()).toEqual(['Shopping', 'Standup'])
  })

  it('returns everything for an empty or whitespace query', async () => {
    expect(await searchNotes('')).toHaveLength(3)
    expect(await searchNotes('   ')).toHaveLength(3)
  })

  it('returns nothing for a query that matches nothing', async () => {
    expect(await searchNotes('zzzz')).toEqual([])
  })

  it('does not leak note content across IPC', async () => {
    // Search returns metadata only; the whole point of running it in the main
    // process is that bodies never cross the boundary just to be filtered.
    const [result] = await searchNotes('eggs')
    expect(result).not.toHaveProperty('content')
  })
})

describe('renameNote', () => {
  it('renames the file on disk, not just the label', async () => {
    await writeNote('Untitled', 'content here')
    await renameNote('Untitled', 'Meeting notes')

    expect(await filesOnDisk()).toEqual(['Meeting notes.md'])
    expect((await readNote('Meeting notes')).content).toBe('content here')
  })

  it('returns the new id, because the id is the filename', async () => {
    await writeNote('Untitled', '')
    expect((await renameNote('Untitled', 'Renamed')).id).toBe('Renamed')
  })

  it('sanitizes the requested name', async () => {
    await writeNote('Untitled', '')
    expect((await renameNote('Untitled', 'Q3: Plan')).id).toBe('Q3 Plan')
    expect(await filesOnDisk()).toEqual(['Q3 Plan.md'])
  })

  it('NEVER overwrites an existing note on collision', async () => {
    // The most important test in this file. Overwriting would destroy a note,
    // which BR-6 forbids outright.
    await writeNote('Keep', 'precious original')
    await writeNote('Other', 'the one being renamed')

    const result = await renameNote('Other', 'Keep')

    expect(result.id).toBe('Keep 2')
    expect(await filesOnDisk()).toEqual(['Keep 2.md', 'Keep.md'])
    expect((await readNote('Keep')).content).toBe('precious original')
    expect((await readNote('Keep 2')).content).toBe('the one being renamed')
  })

  it('allows a change of capitalisation', async () => {
    // Filesystems on Windows and macOS are case-insensitive, so a naive
    // collision check would refuse this as a clash with itself.
    await writeNote('notes', 'body')
    expect((await renameNote('notes', 'Notes')).id).toBe('Notes')
    expect((await readNote('Notes')).content).toBe('body')
  })

  it('is a no-op when the name is unchanged', async () => {
    await writeNote('Same', 'body')
    expect((await renameNote('Same', 'Same')).id).toBe('Same')
    expect(await filesOnDisk()).toEqual(['Same.md'])
    expect((await readNote('Same')).content).toBe('body')
  })

  it('falls back to a default when the requested name sanitizes to nothing', async () => {
    await writeNote('Real', 'body')
    expect((await renameNote('Real', '///')).id).toBe('Untitled')
  })

  it('preserves content exactly, including trailing whitespace', async () => {
    await writeNote('Before', 'line one\n\n  trailing spaces  \n')
    await renameNote('Before', 'After')
    expect((await readNote('After')).content).toBe('line one\n\n  trailing spaces  \n')
  })
})

describe('deleteNote', () => {
  it('removes the file', async () => {
    await writeNote('Doomed', 'x')
    await deleteNote('Doomed')
    expect(await filesOnDisk()).toEqual([])
  })

  it('is a no-op for a note that is already gone', async () => {
    // The renderer updates optimistically and may retry.
    await expect(deleteNote('Never existed')).resolves.toBeUndefined()
  })

  it('leaves other notes alone', async () => {
    await writeNote('Keep', 'a')
    await writeNote('Drop', 'b')
    await deleteNote('Drop')
    expect(await filesOnDisk()).toEqual(['Keep.md'])
  })
})

/**
 * The security boundary, tested through the real API rather than against
 * `assertValidId` directly — this is what proves the guard is actually wired in
 * on every path, which is the part that regressions break.
 */
describe('path containment', () => {
  const escapes = [
    '../outside',
    '../../outside',
    'sub/note',
    'C:\\Windows\\System32\\config',
    '..',
    '.hidden',
    'note.md:stream'
  ]

  it.each(escapes)('refuses to read %s', async (id) => {
    await expect(readNote(id)).rejects.toThrow()
  })

  it.each(escapes)('refuses to write %s', async (id) => {
    await expect(writeNote(id, 'payload')).rejects.toThrow()
  })

  it.each(escapes)('refuses to delete %s', async (id) => {
    await expect(deleteNote(id)).rejects.toThrow()
  })

  it('writes nothing outside the notes folder when an escape is attempted', async () => {
    // The parent is private to this test, so anything appearing in it came from
    // the call below and nowhere else.
    expect(await readdir(state.root)).toEqual(['notes'])

    await expect(writeNote('../escaped', 'payload')).rejects.toThrow()

    expect(await readdir(state.root)).toEqual(['notes'])
    expect(await filesOnDisk()).toEqual([])
  })

  it('refuses reserved device names, which would silently discard the note', async () => {
    await expect(writeNote('NUL', 'lost forever')).rejects.toThrow()
    await expect(writeNote('COM1', 'lost forever')).rejects.toThrow()
  })

  it('cannot be tricked into escaping through a rename', async () => {
    await writeNote('Legit', 'body')
    // The requested name is sanitized before it is ever used as a path, so this
    // becomes an ordinary filename rather than a traversal.
    const result = await renameNote('Legit', '../../escaped')
    expect(result.id).toBe('escaped')
    expect(await filesOnDisk()).toEqual(['escaped.md'])
  })
})
