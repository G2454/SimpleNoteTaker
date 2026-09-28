import { describe, expect, it } from 'vitest'
import { isExternallyOpenable, isRenderableUrl, normalizeUrl, urlScheme } from './urls'

/**
 * Written as attacks rather than examples, in the same spirit as
 * `assertValidId`'s tests. Every case below is a published technique for
 * smuggling a `javascript:` URL past a naive scheme check — and each one works
 * against the obvious implementation (`href.startsWith('javascript:')`).
 *
 * A note is a plain `.md` file, so its content is not necessarily the user's
 * own writing: it can arrive from a synced folder, a template, or a file
 * downloaded from the web. The renderer holds `window.api`, so a script running
 * there can read and rewrite every note.
 */

describe('normalizeUrl', () => {
  it('removes the characters a browser strips from anywhere in a URL', () => {
    // Tab, LF and CR are deleted by the URL parser wherever they appear. This
    // is the bypass that matters: the check sees `java\nscript:` and shrugs,
    // then the browser sees `javascript:`.
    expect(normalizeUrl('java\nscript:alert(1)')).toBe('javascript:alert(1)')
    expect(normalizeUrl('java\tscript:alert(1)')).toBe('javascript:alert(1)')
    expect(normalizeUrl('java\rscript:alert(1)')).toBe('javascript:alert(1)')
  })

  it('trims leading and trailing control characters and spaces', () => {
    expect(normalizeUrl('  https://example.com  ')).toBe('https://example.com')
    expect(normalizeUrl('\u0000\u0001javascript:alert(1)')).toBe('javascript:alert(1)')
    expect(normalizeUrl('https://example.com\u007f')).toBe('https://example.com')
  })

  it('leaves interior spaces alone', () => {
    // A space inside the scheme makes it invalid to the browser too, so there
    // is nothing to normalise away — and stripping it would corrupt real paths.
    expect(normalizeUrl('https://example.com/a b')).toBe('https://example.com/a b')
  })
})

describe('urlScheme', () => {
  it.each([
    ['https://example.com', 'https'],
    ['HTTPS://EXAMPLE.COM', 'https'],
    ['mailto:someone@example.com', 'mailto'],
    ['JavaScript:alert(1)', 'javascript'],
    ['data:text/html,<script>alert(1)</script>', 'data'],
    ['file:///C:/Windows/System32', 'file'],
    ['vbscript:msgbox(1)', 'vbscript']
  ])('reads the scheme of %s as %s', (raw, expected) => {
    expect(urlScheme(raw)).toBe(expected)
  })

  it.each([
    ['a relative path', 'notes/other.md'],
    ['a fragment', '#section-two'],
    ['a protocol-relative URL', '//example.com/page'],
    ['an empty string', ''],
    ['a leading digit', '1http://example.com'],
    ['an HTML entity', '&#106;avascript:alert(1)']
  ])('reports no scheme for %s', (_label, raw) => {
    expect(urlScheme(raw)).toBeNull()
  })
})

describe('isRenderableUrl', () => {
  it.each([
    'https://example.com',
    'http://example.com/path?q=1#frag',
    'mailto:someone@example.com',
    '#anchor',
    'sibling-note.md',
    ''
  ])('allows %s', (raw) => {
    expect(isRenderableUrl(raw)).toBe(true)
  })

  it.each([
    ['plain javascript', 'javascript:alert(1)'],
    ['mixed case', 'JaVaScRiPt:alert(1)'],
    ['leading whitespace', '   javascript:alert(1)'],
    ['embedded newline', 'java\nscript:alert(1)'],
    ['embedded tab', 'java\tscript:alert(1)'],
    ['leading NUL', '\u0000javascript:alert(1)'],
    ['data URL carrying HTML', 'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=='],
    ['data URL carrying SVG', 'data:image/svg+xml,<svg onload="alert(1)"/>'],
    ['vbscript', 'vbscript:msgbox(1)'],
    ['a local file', 'file:///C:/Windows/System32/calc.exe'],
    ['a scheme we simply never allowed', 'ms-msdt:/id']
  ])('refuses %s', (_label, raw) => {
    expect(isRenderableUrl(raw)).toBe(false)
  })
})

describe('isExternallyOpenable', () => {
  it.each(['https://example.com', 'http://example.com', 'mailto:a@b.com'])('allows %s', (raw) => {
    expect(isExternallyOpenable(raw)).toBe(true)
  })

  it.each([
    ['a relative path', 'notes/other.md'],
    ['a fragment', '#anchor'],
    ['an empty string', ''],
    ['a protocol-relative URL', '//example.com'],
    ['javascript', 'javascript:alert(1)'],
    ['a local executable', 'file:///C:/Windows/System32/calc.exe']
  ])('refuses %s', (_label, raw) => {
    expect(isExternallyOpenable(raw)).toBe(false)
  })
})
