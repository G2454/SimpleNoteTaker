import { useCallback, useEffect, useState } from 'react'
import { OVERLAY_SIZE_LABELS, OVERLAY_SIZES } from '../../../shared/overlay-size'
import type { Settings as SettingsValue, ThemePreference } from '../../../shared/types'
import { acceleratorFromEvent, formatAccelerator } from '../lib/accelerator'
import { isMac } from '../lib/platform'

interface SettingsProps {
  settings: SettingsValue | null
  error?: string
  onUpdate: (patch: Partial<SettingsValue>) => Promise<unknown>
  onChooseFolder: () => Promise<void>
  onClose: () => void
}

const THEMES: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' }
]

/**
 * Records a key combination.
 *
 * While recording, key events are swallowed rather than handled — otherwise
 * pressing Ctrl+N to bind it would also create a note, and the app's own
 * shortcuts would be unbindable.
 */
function HotkeyRecorder({
  value,
  onChange
}: {
  value: string
  onChange: (accelerator: string) => void
}): React.JSX.Element {
  const [recording, setRecording] = useState(false)

  useEffect(() => {
    if (!recording) return undefined

    const onKeyDown = (event: KeyboardEvent): void => {
      // Capture phase, so this runs before the app's global shortcut handler
      // and can stop it entirely.
      event.preventDefault()
      event.stopPropagation()

      if (event.key === 'Escape') {
        setRecording(false)
        return
      }

      const accelerator = acceleratorFromEvent(event)
      if (!accelerator) return // modifier held on its own, or an unusable key

      setRecording(false)
      onChange(accelerator)
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [recording, onChange])

  return (
    <button
      type="button"
      className={`hotkey ${recording ? 'hotkey--recording' : ''}`}
      onClick={() => setRecording((on) => !on)}
      onBlur={() => setRecording(false)}
    >
      {recording ? 'Press a shortcut…' : formatAccelerator(value)}
    </button>
  )
}

export default function Settings({
  settings,
  error,
  onUpdate,
  onChooseFolder,
  onClose
}: SettingsProps): React.JSX.Element {
  const setHotkey = useCallback(
    (accelerator: string) => void onUpdate({ hotkey: accelerator }),
    [onUpdate]
  )

  if (!settings) {
    return (
      <main className="main">
        <header className="titlebar">
          <span className="titlebar__title">Options</span>
        </header>
        <div className="settings settings--loading">Loading…</div>
      </main>
    )
  }

  return (
    <main className="main">
      <header className="titlebar">
        <span className="titlebar__title">Options</span>
        <span className="titlebar__status">
          <button type="button" className="link-button" onClick={onClose}>
            Done
          </button>
        </span>
      </header>

      <div className="settings">
        {error && <p className="settings__error">{error}</p>}

        <section className="settings__row">
          <div className="settings__label">
            <span>Shortcut</span>
            <span className="settings__hint">Summons and dismisses the overlay</span>
          </div>
          <HotkeyRecorder value={settings.hotkey} onChange={setHotkey} />
        </section>

        <section className="settings__row">
          <div className="settings__label">
            <span>Notes folder</span>
            {/* `dir` makes the ellipsis fall at the start, keeping the folder
                name visible — the useful half of a long path. */}
            <span className="settings__hint settings__path" dir="rtl" title={settings.notesDir}>
              {settings.notesDir}
            </span>
          </div>
          <div className="settings__actions">
            <button type="button" className="button" onClick={() => void onChooseFolder()}>
              Change…
            </button>
            <button
              type="button"
              className="button"
              onClick={() => void window.api.notes.revealFolder()}
            >
              Open
            </button>
          </div>
        </section>

        <section className="settings__row">
          <div className="settings__label">
            <span>Appearance</span>
          </div>
          <div className="segmented">
            {THEMES.map((theme) => (
              <button
                key={theme.value}
                type="button"
                className={`segmented__option ${
                  settings.theme === theme.value ? 'segmented__option--active' : ''
                }`}
                onClick={() => void onUpdate({ theme: theme.value })}
              >
                {theme.label}
              </button>
            ))}
          </div>
        </section>

        <section className="settings__row">
          <div className="settings__label">
            <span>Window size</span>
            <span className="settings__hint">
              Full uses the whole screen, minus the taskbar
            </span>
          </div>
          <div className="segmented">
            {OVERLAY_SIZES.map((size) => (
              <button
                key={size}
                type="button"
                className={`segmented__option ${
                  settings.overlaySize === size ? 'segmented__option--active' : ''
                }`}
                aria-pressed={settings.overlaySize === size}
                onClick={() => void onUpdate({ overlaySize: size })}
              >
                {OVERLAY_SIZE_LABELS[size]}
              </button>
            ))}
          </div>
        </section>

        <section className="settings__row">
          <div className="settings__label">
            <span>{isMac() ? 'Open at login' : 'Start with Windows'}</span>
            <span className="settings__hint">
              A shortcut overlay is only useful if it is already running
            </span>
          </div>
          <label className="switch">
            <input
              type="checkbox"
              checked={settings.launchAtLogin}
              onChange={(event) => void onUpdate({ launchAtLogin: event.target.checked })}
            />
            <span className="switch__track" />
          </label>
        </section>

        <p className="settings__footnote">
          Changing the notes folder points Note Taker at the new location. Existing notes stay
          where they are — move them yourself if you want them to come along.
        </p>
      </div>
    </main>
  )
}
