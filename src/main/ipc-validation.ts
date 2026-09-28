import type { OverlaySize, Settings, ThemePreference } from '../shared/types'

/**
 * Validation for everything arriving over IPC.
 *
 * Split from `ipc.ts` for the same reason `note-utils.ts` is split from
 * `notes.ts`: that module imports `electron` at load time, which cannot be
 * imported outside a real Electron runtime. These are the checks guarding the
 * process boundary, so they should be testable without one.
 *
 * TypeScript types are erased at runtime and stop at the process boundary
 * anyway: a compromised renderer can invoke any channel with any payload at
 * all. Everything here treats its input as hostile.
 */

export function asString(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new TypeError(`Expected "${field}" to be a string, received ${typeof value}`)
  }
  return value
}

function isTheme(value: unknown): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark'
}

function isOverlaySize(value: unknown): value is OverlaySize {
  return value === 'small' || value === 'medium' || value === 'full'
}

/**
 * Copies across only the fields we recognise, with the types we expect.
 *
 * Spreading the payload straight into the settings object would let a renderer
 * write arbitrary keys into the persisted JSON — harmless today, but exactly
 * the kind of thing that becomes a vulnerability once some later field is
 * trusted. `updateSettings` validates the *values*; this validates the *shape*.
 *
 * Unknown keys are dropped silently rather than rejected: a newer renderer
 * talking to an older main process should degrade, not fail outright.
 */
export function asSettingsPatch(value: unknown): Partial<Settings> {
  if (!value || typeof value !== 'object') return {}
  const raw = value as Record<string, unknown>
  const patch: Partial<Settings> = {}

  if (typeof raw.hotkey === 'string') patch.hotkey = raw.hotkey
  if (typeof raw.notesDir === 'string') patch.notesDir = raw.notesDir
  if (isTheme(raw.theme)) patch.theme = raw.theme
  if (isOverlaySize(raw.overlaySize)) patch.overlaySize = raw.overlaySize
  if (typeof raw.launchAtLogin === 'boolean') patch.launchAtLogin = raw.launchAtLogin

  return patch
}
