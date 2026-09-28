import { describe, expect, it } from 'vitest'
import { asSettingsPatch, asString } from './ipc-validation'

/**
 * These run on payloads arriving from the renderer. A renderer is a web page
 * displaying arbitrary note content, and `ipcRenderer.invoke` can be called
 * with anything at all — TypeScript's types are erased long before the message
 * crosses the process boundary. So the inputs here are written as things a
 * hostile or simply buggy caller would send, not as things our own code sends.
 */

describe('asString', () => {
  it('passes strings through, including empty ones', () => {
    expect(asString('hello', 'id')).toBe('hello')
    // Empty is a *value* question, not a type question — callers such as
    // assertValidId reject it with a better message than this would.
    expect(asString('', 'id')).toBe('')
  })

  it.each([
    ['number', 42],
    ['null', null],
    ['undefined', undefined],
    ['boolean', true],
    ['object', { toString: () => 'evil' }],
    ['array', ['a']],
    ['symbol-ish object', Object.create(null)]
  ])('rejects a %s', (_label, value) => {
    expect(() => asString(value, 'id')).toThrow(TypeError)
  })

  it('does not coerce — an object with toString stays rejected', () => {
    // Coercion here would turn `{}` into "[object Object]" and happily build a
    // path from it.
    expect(() => asString({ toString: () => 'notes' }, 'id')).toThrow()
  })

  it('names the field and the actual type, to make the log useful', () => {
    expect(() => asString(42, 'content')).toThrow(
      'Expected "content" to be a string, received number'
    )
  })
})

describe('asSettingsPatch', () => {
  it('keeps the fields it recognises', () => {
    expect(
      asSettingsPatch({
        hotkey: 'CommandOrControl+J',
        notesDir: '/tmp/notes',
        theme: 'dark',
        launchAtLogin: true
      })
    ).toEqual({
      hotkey: 'CommandOrControl+J',
      notesDir: '/tmp/notes',
      theme: 'dark',
      launchAtLogin: true
    })
  })

  it('accepts a partial patch', () => {
    expect(asSettingsPatch({ theme: 'light' })).toEqual({ theme: 'light' })
  })

  it('drops unknown keys entirely', () => {
    // The result is spread into persisted JSON. Without this, a renderer could
    // write arbitrary keys into the settings file — harmless today, and exactly
    // the kind of thing that becomes a vulnerability once a later field is
    // trusted.
    const patch = asSettingsPatch({ theme: 'dark', isAdmin: true, __proto__: { polluted: true } })
    expect(patch).toEqual({ theme: 'dark' })
    expect('isAdmin' in patch).toBe(false)
  })

  it('does not let a payload pollute Object.prototype', () => {
    asSettingsPatch(JSON.parse('{"__proto__": {"polluted": true}}'))
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it('drops fields of the wrong type rather than passing them on', () => {
    expect(asSettingsPatch({ hotkey: 42, notesDir: null, launchAtLogin: 'yes' })).toEqual({})
  })

  it('rejects a theme outside the allowed set', () => {
    expect(asSettingsPatch({ theme: 'midnight' })).toEqual({})
    expect(asSettingsPatch({ theme: '' })).toEqual({})
  })

  it.each([['small'], ['medium'], ['full']])('accepts the %s window size', (size) => {
    expect(asSettingsPatch({ overlaySize: size })).toEqual({ overlaySize: size })
  })

  it.each([
    ['a size outside the set', 'enormous'],
    ['an empty string', ''],
    ['a number', 2],
    ['an object of dimensions', { width: 4000, height: 3000 }]
  ])('rejects %s as a window size', (_label, overlaySize) => {
    expect(asSettingsPatch({ overlaySize })).toEqual({})
  })

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a string', 'theme=dark'],
    ['a number', 7],
    ['a boolean', false]
  ])('returns an empty patch for %s', (_label, value) => {
    expect(asSettingsPatch(value)).toEqual({})
  })

  it('accepts an array as an object but finds nothing usable in it', () => {
    expect(asSettingsPatch(['dark'])).toEqual({})
  })
})
