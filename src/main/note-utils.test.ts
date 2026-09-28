import { describe, expect, it } from 'vitest'
import { assertValidId, deriveTitle, nextAvailableName, sanitizeNoteName } from './note-utils'

/**
 * `assertValidId` is the boundary between a renderer that displays arbitrary
 * text and the user's filesystem. These are the tests that matter most in the
 * project, so they are written as attacks rather than as examples.
 *
 * Note names became user-chosen when renaming was added, so the old
 * `[a-z0-9-]` allow-list is gone — it could not express `Meeting notes.md`.
 * The attack cases below are unchanged; only the cases that were rejected
 * *merely* for being outside that alphabet now pass.
 */
describe('assertValidId', () => {
  it('accepts the ids the app actually generates', () => {
    expect(() => assertValidId('Untitled')).not.toThrow()
    expect(() => assertValidId('Untitled 2')).not.toThrow()
    expect(() => assertValidId('2026-08-09-2222-de2g')).not.toThrow()
    expect(() => assertValidId('a')).not.toThrow()
    expect(() => assertValidId('0')).not.toThrow()
  })

  it('accepts ordinary human names, which is the point of renaming', () => {
    expect(() => assertValidId('Meeting notes')).not.toThrow()
    expect(() => assertValidId('ABC')).not.toThrow()
    expect(() => assertValidId('café')).not.toThrow()
    expect(() => assertValidId('note_1')).not.toThrow()
    expect(() => assertValidId('100% done')).not.toThrow()
    expect(() => assertValidId('a'.repeat(80))).not.toThrow()
  })

  it.each([
    ['parent traversal', '../secrets'],
    ['deep traversal', '../../../../Windows/System32/config'],
    ['traversal mid-path', 'notes/../../etc/passwd'],
    ['absolute posix path', '/etc/passwd'],
    ['absolute windows path', 'C:\\Windows\\System32'],
    ['UNC path', '\\\\server\\share'],
    ['bare parent', '..'],
    ['bare dot', '.'],
    ['dotfile', '.env'],
    ['forward slash', 'a/b'],
    ['backslash', 'a\\b'],
    ['null byte', 'note\u0000.md'],
    ['other control character', 'note\u001funtitled'],
    ['url-ish', 'http://example.com'],
    ['home expansion', '~/notes'],
    ['NTFS alternate data stream', 'note.md:hidden']
  ])('rejects %s', (_label, id) => {
    expect(() => assertValidId(id)).toThrow(/Invalid note id/)
  })

  it.each([['<'], ['>'], ['"'], ['|'], ['?'], ['*']])(
    'rejects the Windows-forbidden character %s',
    (character) => {
      expect(() => assertValidId(`note${character}name`)).toThrow()
    }
  )

  it.each([['CON'], ['con'], ['NUL'], ['nul.md'], ['COM1'], ['LPT9'], ['aux.txt']])(
    'rejects the reserved device name %s',
    (name) => {
      // Writing to NUL.md silently discards the note; reading CON.md can block
      // forever waiting on console input.
      expect(() => assertValidId(name)).toThrow()
    }
  )

  it('rejects names Windows would silently alter', () => {
    // Windows strips these, so the file you opened would not be the file you
    // named — two ids addressing one file.
    expect(() => assertValidId('trailing ')).toThrow()
    expect(() => assertValidId(' leading')).toThrow()
    expect(() => assertValidId('trailing.')).toThrow()
  })

  it('rejects empty and over-long ids', () => {
    expect(() => assertValidId('')).toThrow()
    expect(() => assertValidId('a'.repeat(81))).toThrow()
  })

  it('treats percent-encoded traversal as an ordinary name', () => {
    // Safe precisely because nothing in the app ever URL-decodes an id: this
    // is a file literally called "%2e%2e%2fetc.md", not a path.
    expect(() => assertValidId('%2e%2e%2fetc')).not.toThrow()
  })

  it('names the offending id in the error, quoted', () => {
    expect(() => assertValidId('../etc')).toThrow('Invalid note id: "../etc"')
  })
})

describe('sanitizeNoteName', () => {
  it('replaces forbidden characters rather than rejecting the name', () => {
    expect(sanitizeNoteName('Q3: Plan')).toBe('Q3 Plan')
    expect(sanitizeNoteName('a/b')).toBe('a b')
  })

  it('replaces EVERY forbidden character, not just the first', () => {
    // Regression guard: a non-global regex in `replace` only substitutes the
    // first match, which would leave later illegal characters in the filename.
    expect(sanitizeNoteName('a<b>c|d')).toBe('a b c d')
    expect(() => assertValidId(sanitizeNoteName('a<b>c|d'))).not.toThrow()
  })

  it('collapses whitespace and trims', () => {
    expect(sanitizeNoteName('  spaced    out  ')).toBe('spaced out')
  })

  it('strips leading and trailing dots', () => {
    expect(sanitizeNoteName('...hidden')).toBe('hidden')
    expect(sanitizeNoteName('trailing...')).toBe('trailing')
  })

  it('falls back to a default when nothing usable is left', () => {
    expect(sanitizeNoteName('')).toBe('Untitled')
    expect(sanitizeNoteName('   ')).toBe('Untitled')
    expect(sanitizeNoteName('///')).toBe('Untitled')
    expect(sanitizeNoteName('...')).toBe('Untitled')
  })

  it('defuses reserved device names', () => {
    expect(sanitizeNoteName('CON')).toBe('CON_')
    expect(() => assertValidId(sanitizeNoteName('CON'))).not.toThrow()
  })

  it('truncates without leaving a trailing dot or space', () => {
    expect(sanitizeNoteName('x'.repeat(200))).toHaveLength(80)
    expect(sanitizeNoteName('y'.repeat(79) + ' tail')).not.toMatch(/[\s.]$/)
  })

  it('always produces something assertValidId accepts', () => {
    const nasty = ['../../etc/passwd', 'C:\\Windows', 'note\u0000', '..', 'nul', '   ', '<<<>>>']
    for (const input of nasty) {
      expect(() => assertValidId(sanitizeNoteName(input))).not.toThrow()
    }
  })
})

describe('nextAvailableName', () => {
  it('returns the base name when it is free', () => {
    expect(nextAvailableName('Untitled', [])).toBe('Untitled')
    expect(nextAvailableName('Untitled', ['Other'])).toBe('Untitled')
  })

  it('appends the first free numeric suffix', () => {
    expect(nextAvailableName('Untitled', ['Untitled'])).toBe('Untitled 2')
    expect(nextAvailableName('Untitled', ['Untitled', 'Untitled 2'])).toBe('Untitled 3')
  })

  it('skips gaps rather than reusing them', () => {
    expect(nextAvailableName('Note', ['Note', 'Note 3'])).toBe('Note 2')
  })

  it('compares case-insensitively, because Windows and macOS do', () => {
    // Treating these as distinct would give two ids addressing one file, and
    // the second write would clobber the first.
    expect(nextAvailableName('Notes', ['notes'])).toBe('Notes 2')
    expect(nextAvailableName('NOTES', ['Notes', 'notes 2'])).toBe('NOTES 3')
  })

  it('keeps the result within the length limit', () => {
    const result = nextAvailableName('a'.repeat(80), ['a'.repeat(80)])
    expect(result.length).toBeLessThanOrEqual(80)
    expect(() => assertValidId(result)).not.toThrow()
  })
})

describe('deriveTitle', () => {
  it('uses the first non-empty line', () => {
    expect(deriveTitle('first line\nsecond line')).toBe('first line')
  })

  it('skips leading blank lines and trims surrounding whitespace', () => {
    expect(deriveTitle('\n\n\n   spaced out   \nmore')).toBe('spaced out')
  })

  it('strips ATX heading markers, one through six', () => {
    expect(deriveTitle('# Heading\nbody')).toBe('Heading')
    expect(deriveTitle('###### Six deep')).toBe('Six deep')
  })

  it('leaves a hash that is not a heading alone', () => {
    expect(deriveTitle('#hashtag')).toBe('#hashtag')
    expect(deriveTitle('####### too deep')).toBe('####### too deep')
  })

  it('keeps hashes that appear later in the line', () => {
    expect(deriveTitle('## Issue #42 is fixed')).toBe('Issue #42 is fixed')
  })

  it('survives CRLF line endings', () => {
    expect(deriveTitle('# Hello\r\nworld')).toBe('Hello')
  })

  it('truncates to 80 characters', () => {
    expect(deriveTitle('x'.repeat(100))).toHaveLength(80)
    expect(deriveTitle('# ' + 'y'.repeat(100))).toBe('y'.repeat(80))
  })

  it('falls back to Untitled when there is nothing to read', () => {
    expect(deriveTitle('')).toBe('Untitled')
    expect(deriveTitle('   \n\t\n  ')).toBe('Untitled')
  })
})
