import { isMac } from './platform'

/**
 * Translates a key press into an Electron accelerator string.
 *
 * The two vocabularies differ in small, annoying ways — the browser says
 * `ArrowUp` and `Enter`, Electron wants `Up` and `Return` — and Electron
 * silently fails to register anything it doesn't recognise, so this mapping is
 * what stands between the user and a shortcut that just doesn't work.
 */

/**
 * The parts of a `KeyboardEvent` this module actually reads.
 *
 * Declared structurally rather than taking `KeyboardEvent` so the logic can be
 * exercised with plain objects — no DOM, no jsdom, no synthetic event
 * construction in tests. A real `KeyboardEvent` satisfies it for free.
 */
export interface KeyCombination {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  shiftKey: boolean
}

/** Keys whose browser name differs from Electron's. */
const RENAMED: Record<string, string> = {
  ' ': 'Space',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Enter: 'Return',
  '+': 'Plus'
}

/** Pressed on their own these are not a shortcut, just a modifier being held. */
const MODIFIER_KEYS = new Set(['Control', 'Alt', 'Shift', 'Meta', 'AltGraph', 'CapsLock'])

/**
 * Reserved by the UI itself: Escape cancels recording, and Tab must keep moving
 * focus or the options screen becomes a keyboard trap.
 */
const RESERVED = new Set(['Escape', 'Tab'])

/**
 * Not real keys, and each one slips past the "named key" pattern below.
 *
 * The browser reports `Unidentified` when it cannot work out which physical key
 * was pressed, `Dead` while a dead key is composing an accent, and `Process`
 * while an IME is handling the input. Electron has no accelerator for any of
 * them, so binding one registers nothing and fails silently — the user would
 * see their shortcut simply stop working, with no error anywhere.
 */
const UNNAMEABLE = new Set(['Unidentified', 'Dead', 'Process'])

function normalizeKey(event: KeyCombination): string | null {
  const { key } = event

  if (MODIFIER_KEYS.has(key) || RESERVED.has(key) || UNNAMEABLE.has(key)) return null
  if (RENAMED[key]) return RENAMED[key]
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(key)) return key

  // Single characters cover letters, digits and punctuation. Upper-cased
  // because Electron matches physical keys, and `Shift+a` would never fire.
  if (key.length === 1) return key.toUpperCase()

  // Named keys Electron shares with the browser: Home, End, PageUp, Delete…
  if (/^[A-Z][A-Za-z]+$/.test(key)) return key

  return null
}

/**
 * Builds an accelerator, or returns null if the combination isn't usable.
 *
 * At least one modifier is required. A bare letter would register *globally* —
 * pressing `k` in any application would summon the overlay, and the user would
 * have no obvious way to undo it because typing itself would be broken.
 */
export function acceleratorFromEvent(event: KeyCombination): string | null {
  const key = normalizeKey(event)
  if (!key) return null

  const modifiers: string[] = []
  // Cmd on macOS, Ctrl elsewhere — one accelerator that is idiomatic on both.
  if (event.ctrlKey || event.metaKey) modifiers.push('CommandOrControl')
  if (event.altKey) modifiers.push('Alt')
  if (event.shiftKey) modifiers.push('Shift')

  if (modifiers.length === 0) return null
  return [...modifiers, key].join('+')
}

/**
 * Renders an accelerator for display, using the platform's conventions.
 *
 * `mac` is a parameter with a default rather than a direct `isMac()` call so
 * both renderings can be asserted without stubbing the environment.
 */
export function formatAccelerator(accelerator: string, mac: boolean = isMac()): string {
  return accelerator
    .split('+')
    .map((part) => {
      if (part === 'CommandOrControl') return mac ? '⌘' : 'Ctrl'
      if (part === 'Alt') return mac ? '⌥' : 'Alt'
      if (part === 'Shift') return mac ? '⇧' : 'Shift'
      if (part === 'Super') return mac ? '⌘' : 'Win'
      return part
    })
    .join(mac ? '' : ' + ')
}
