import { useCallback, useEffect, useState } from 'react'
import type { Settings, SettingsResult } from '../../../shared/types'

/** What `useSettings` hands back. See `NotesController` for why this is spelled out. */
export interface SettingsController {
  /** Null until the first load resolves. */
  settings: Settings | null
  /** Set when part of the last update could not be applied. */
  error: string | undefined
  update: (patch: Partial<Settings>) => Promise<SettingsResult>
  chooseFolder: () => Promise<void>
}

/**
 * Loads and updates user options.
 *
 * The main process is the single source of truth: every update returns the
 * settings as they actually ended up, and we adopt that rather than assuming
 * the change applied. Some can be refused — a hotkey another application owns,
 * a folder that cannot be created — and optimistic local state would then show
 * a setting that isn't real.
 */
export function useSettings(): SettingsController {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [error, setError] = useState<string | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    void window.api.settings.get().then((loaded) => {
      if (!cancelled) setSettings(loaded)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const update = useCallback(async (patch: Partial<Settings>) => {
    const result = await window.api.settings.update(patch)
    setSettings(result.settings)
    setError(result.error)
    return result
  }, [])

  /**
   * Picks a notes folder through the OS dialog.
   *
   * The renderer never types a path — it receives one the user selected in a
   * native picker, which is what keeps `notesDir` from being a way to point the
   * app at an arbitrary location.
   */
  const chooseFolder = useCallback(async () => {
    const chosen = await window.api.settings.chooseFolder()
    if (chosen) await update({ notesDir: chosen })
  }, [update])

  // No explicit `clearError`: every update overwrites `error` with the new
  // result's, which is undefined on success, so a fixed problem clears itself.
  return { settings, error, update, chooseFolder }
}
