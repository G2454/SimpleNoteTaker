import { describe, expect, it } from 'vitest'
import { acceleratorFromEvent, formatAccelerator, type KeyCombination } from './accelerator'

/**
 * Electron silently fails to register an accelerator it doesn't understand —
 * no error, no warning, the shortcut simply never fires. That makes this
 * translation a place where a bug is invisible until a user reports "the
 * shortcut doesn't work", so it is worth covering thoroughly.
 */

/** A key press, with no modifiers held unless stated. */
const press = (key: string, modifiers: Partial<KeyCombination> = {}): KeyCombination => ({
  key,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...modifiers
})

describe('acceleratorFromEvent', () => {
  it('builds the app default', () => {
    expect(acceleratorFromEvent(press(' ', { ctrlKey: true }))).toBe('CommandOrControl+Space')
  })

  it('upper-cases letters, because Electron matches physical keys', () => {
    // `CommandOrControl+n` would never fire.
    expect(acceleratorFromEvent(press('n', { ctrlKey: true }))).toBe('CommandOrControl+N')
  })

  it('maps Cmd and Ctrl to the same portable modifier', () => {
    expect(acceleratorFromEvent(press('k', { metaKey: true }))).toBe('CommandOrControl+K')
    expect(acceleratorFromEvent(press('k', { ctrlKey: true }))).toBe('CommandOrControl+K')
  })

  it('orders modifiers consistently', () => {
    // A stable order means the stored string can be compared to itself later.
    const result = acceleratorFromEvent(
      press('j', { ctrlKey: true, altKey: true, shiftKey: true })
    )
    expect(result).toBe('CommandOrControl+Alt+Shift+J')
  })

  it.each([
    [' ', 'Space'],
    ['ArrowUp', 'Up'],
    ['ArrowDown', 'Down'],
    ['ArrowLeft', 'Left'],
    ['ArrowRight', 'Right'],
    ['Enter', 'Return'],
    ['+', 'Plus']
  ])('renames the browser key %s to Electron\'s %s', (browserKey, electronKey) => {
    expect(acceleratorFromEvent(press(browserKey, { ctrlKey: true }))).toBe(
      `CommandOrControl+${electronKey}`
    )
  })

  it('passes function keys through unchanged', () => {
    expect(acceleratorFromEvent(press('F5', { altKey: true }))).toBe('Alt+F5')
    expect(acceleratorFromEvent(press('F12', { altKey: true }))).toBe('Alt+F12')
  })

  it('passes shared named keys through unchanged', () => {
    expect(acceleratorFromEvent(press('Home', { ctrlKey: true }))).toBe('CommandOrControl+Home')
    expect(acceleratorFromEvent(press('PageDown', { ctrlKey: true }))).toBe(
      'CommandOrControl+PageDown'
    )
  })

  it('refuses a key with no modifier', () => {
    // This is the important one. A bare letter registers GLOBALLY, so typing
    // "k" in any application would summon the overlay — and the user could not
    // easily undo it, because typing itself would be broken.
    expect(acceleratorFromEvent(press('k'))).toBeNull()
    expect(acceleratorFromEvent(press('F5'))).toBeNull()
    expect(acceleratorFromEvent(press(' '))).toBeNull()
  })

  it.each([['Control'], ['Alt'], ['Shift'], ['Meta'], ['AltGraph'], ['CapsLock']])(
    'refuses %s pressed on its own',
    (key) => {
      // Held modifiers fire keydown repeatedly while the user reaches for the
      // real key; treating one as a binding would end recording too early.
      expect(acceleratorFromEvent(press(key, { ctrlKey: true, altKey: true }))).toBeNull()
    }
  )

  it.each([['Escape'], ['Tab']])('refuses the reserved key %s', (key) => {
    // Escape cancels recording; Tab must keep moving focus or the options
    // screen becomes a keyboard trap.
    expect(acceleratorFromEvent(press(key, { ctrlKey: true }))).toBeNull()
  })

  it.each([['Unidentified'], ['Dead'], ['Process']])(
    'refuses the non-key %s, which Electron cannot bind',
    (key) => {
      // Regression guard: these match the "named key" pattern, so without an
      // explicit rejection they produce an accelerator that silently never
      // fires — the worst possible failure for a shortcut.
      expect(acceleratorFromEvent(press(key, { ctrlKey: true }))).toBeNull()
    }
  )

  it('refuses an empty key', () => {
    expect(acceleratorFromEvent(press('', { ctrlKey: true }))).toBeNull()
  })

  it('accepts a real KeyboardEvent shape', () => {
    // The structural type exists so tests need no DOM, but it must still be
    // satisfied by the thing actually passed at runtime.
    const event: KeyCombination = {
      key: 'p',
      ctrlKey: true,
      metaKey: false,
      altKey: false,
      shiftKey: true
    }
    expect(acceleratorFromEvent(event)).toBe('CommandOrControl+Shift+P')
  })
})

describe('formatAccelerator', () => {
  it('spells modifiers out on Windows and Linux', () => {
    expect(formatAccelerator('CommandOrControl+Space', false)).toBe('Ctrl + Space')
    expect(formatAccelerator('CommandOrControl+Alt+Shift+J', false)).toBe('Ctrl + Alt + Shift + J')
  })

  it('uses symbols, unseparated, on macOS', () => {
    expect(formatAccelerator('CommandOrControl+Space', true)).toBe('⌘Space')
    expect(formatAccelerator('CommandOrControl+Alt+Shift+J', true)).toBe('⌘⌥⇧J')
  })

  it('renders Super as the platform key', () => {
    expect(formatAccelerator('Super+L', false)).toBe('Win + L')
    expect(formatAccelerator('Super+L', true)).toBe('⌘L')
  })

  it('leaves unknown parts alone rather than dropping them', () => {
    // A settings file written by a future version must still display legibly.
    expect(formatAccelerator('Meta+Q', false)).toBe('Meta + Q')
  })

  it('round-trips what acceleratorFromEvent produces', () => {
    const accelerator = acceleratorFromEvent(press('n', { ctrlKey: true, shiftKey: true }))
    expect(accelerator).not.toBeNull()
    expect(formatAccelerator(accelerator as string, false)).toBe('Ctrl + Shift + N')
  })
})
