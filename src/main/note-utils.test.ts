import { describe, expect, it } from 'vitest'
import { assertValidId, byRecency, deriveTitle } from './note-utils'
import type { NoteMeta } from '../shared/types'

/**
 * `assertValidId` is the boundary between a renderer that displays arbitrary
 * text and the user's filesystem. These are the tests that matter most in the
 * project, so they are written as attacks rather than as examples.
 */
describe('assertValidId', () => {
  it('accepts the ids the app actually generates', () => {
    expect(() => assertValidId('2026-08-09-2222-de2g')).not.toThrow()
    expect(() => assertValidId('a')).not.toThrow()
    expect(() => assertValidId('0')).not.toThrow()
    expect(() => assertValidId('abc-123-xyz')).not.toThrow()
    expect(() => assertValidId('a'.repeat(64))).not.toThrow()
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
    ['percent-encoded traversal', '%2e%2e%2fetc'],
    ['null byte', 'note\u0000.md'],
    ['url-ish', 'http://example.com'],
    ['home expansion', '~/notes']
  ])('rejects %s', (_label, id) => {
    expect(() => assertValidId(id)).toThrow(/Invalid note id/)
  })

  it('rejects anything outside [a-z0-9-]', () => {
    // Uppercase is excluded deliberately: Windows paths are case-insensitive,
    // so allowing it would make `Note` and `note` the same file with two ids.
    expect(() => assertValidId('ABC')).toThrow()
    expect(() => assertValidId('note id')).toThrow()
    expect(() => assertValidId('note.md')).toThrow()
    expect(() => assertValidId('café')).toThrow()
    expect(() => assertValidId('note_1')).toThrow()
  })

  it('rejects empty and over-long ids', () => {
    expect(() => assertValidId('')).toThrow()
    expect(() => assertValidId('a'.repeat(65))).toThrow()
  })

  it('names the offending id in the error, quoted', () => {
    // Quoted via JSON.stringify so an id containing whitespace or control
    // characters is still legible in a log.
    expect(() => assertValidId('../etc')).toThrow('Invalid note id: "../etc"')
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
    // No space after the hashes, so it is text — matching markdown's own rule.
    expect(deriveTitle('#hashtag')).toBe('#hashtag')
    // Seven hashes is not a valid heading level.
    expect(deriveTitle('####### too deep')).toBe('####### too deep')
  })

  it('keeps hashes that appear later in the line', () => {
    expect(deriveTitle('## Issue #42 is fixed')).toBe('Issue #42 is fixed')
  })

  it('survives CRLF line endings', () => {
    // Notes are plain files a user may have edited in any Windows editor.
    expect(deriveTitle('# Hello\r\nworld')).toBe('Hello')
  })

  it('truncates to 80 characters', () => {
    expect(deriveTitle('x'.repeat(100))).toHaveLength(80)
    // Measured after the heading marker is stripped, not before.
    expect(deriveTitle('# ' + 'y'.repeat(100))).toBe('y'.repeat(80))
  })

  it('falls back to Untitled when there is nothing to read', () => {
    expect(deriveTitle('')).toBe('Untitled')
    expect(deriveTitle('   \n\t\n  ')).toBe('Untitled')
  })
})

const note = (id: string, updatedAt: number): NoteMeta => ({ id, title: id, updatedAt })

describe('byRecency', () => {
  it('orders most recently updated first', () => {
    const sorted = [note('old', 1000), note('newest', 3000), note('middle', 2000)].sort(byRecency)
    expect(sorted.map((n) => n.id)).toEqual(['newest', 'middle', 'old'])
  })

  it('treats equal timestamps as equal', () => {
    expect(byRecency(note('a', 500), note('b', 500))).toBe(0)
  })
})
