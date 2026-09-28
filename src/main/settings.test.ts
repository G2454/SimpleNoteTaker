import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Settings tests.
 *
 * The settings file is plain JSON sitting in a folder the user can open, so it
 * is untrusted input: absent, truncated, hand-edited, or written by a future
 * version. A bad value must never stop the app booting, because the app has no
 * UI to fix it with until it has booted. Most of what follows is that argument,
 * expressed as tests.
 *
 * `vi.hoisted` is required because `vi.mock` factories are lifted above the
 * imports — a plain `let` would still be in its temporal dead zone.
 */
const state = vi.hoisted(() => ({
  userData: '',
  documents: '',
  launchAtLogin: false,
  themeSource: 'system'
}))

vi.mock('electron', () => ({
  app: {
    getPath: (name: string): string => (name === 'userData' ? state.userData : state.documents),
    // The OS is the source of truth for startup items, so the fake models it
    // as external state rather than as something settings.ts owns.
    getLoginItemSettings: () => ({ openAtLogin: state.launchAtLogin }),
    setLoginItemSettings: (options: { openAtLogin: boolean }): void => {
      state.launchAtLogin = options.openAtLogin
    }
  },
  nativeTheme: {
    get themeSource(): string {
      return state.themeSource
    },
    set themeSource(value: string) {
      state.themeSource = value
    }
  }
}))

/**
 * A fresh copy of the module.
 *
 * `settings.ts` keeps an in-memory cache in module scope so `notesDirectory()`
 * can stay synchronous. That cache would otherwise leak between tests.
 */
async function freshSettings(): Promise<typeof import('./settings')> {
  vi.resetModules()
  return import('./settings')
}

const settingsFile = (): string => join(state.userData, 'settings.json')

/** Accepts every hotkey — the common case, overridden where rejection matters. */
const alwaysAvailable = { applyHotkey: (): boolean => true }

beforeEach(async () => {
  state.userData = await mkdtemp(join(tmpdir(), 'note-taker-userdata-'))
  state.documents = await mkdtemp(join(tmpdir(), 'note-taker-docs-'))
  state.launchAtLogin = false
  state.themeSource = 'system'
})

afterEach(async () => {
  await rm(state.userData, { recursive: true, force: true })
  await rm(state.documents, { recursive: true, force: true })
  delete process.env['PORTABLE_EXECUTABLE_DIR']
})

describe('loadSettings', () => {
  it('uses defaults on a first run, with no file present', async () => {
    const { loadSettings } = await freshSettings()
    const settings = await loadSettings()

    expect(settings.hotkey).toBe('CommandOrControl+Space')
    expect(settings.theme).toBe('system')
    expect(settings.notesDir).toBe(join(state.documents, 'Note Taker'))
  })

  it('reads back what was stored', async () => {
    await writeFile(
      settingsFile(),
      JSON.stringify({ hotkey: 'Alt+N', notesDir: join(state.documents, 'Elsewhere'), theme: 'dark' })
    )

    const { loadSettings } = await freshSettings()
    const settings = await loadSettings()

    expect(settings.hotkey).toBe('Alt+N')
    expect(settings.theme).toBe('dark')
    expect(settings.notesDir).toBe(join(state.documents, 'Elsewhere'))
  })

  it.each([
    ['truncated JSON', '{"hotkey": "Alt+N"'],
    ['not JSON at all', 'hotkey=Alt+N'],
    ['an empty file', ''],
    ['a JSON array', '[]'],
    ['a JSON string', '"dark"'],
    ['JSON null', 'null']
  ])('falls back to defaults given %s', async (_label, contents) => {
    await writeFile(settingsFile(), contents)

    const { loadSettings } = await freshSettings()
    // The bar is simply that this resolves rather than throwing — a corrupt
    // file must not prevent the app from starting.
    await expect(loadSettings()).resolves.toMatchObject({ hotkey: 'CommandOrControl+Space' })
  })

  it('repairs field by field, keeping the valid parts', async () => {
    await writeFile(settingsFile(), JSON.stringify({ hotkey: 'Alt+N', theme: 'ultraviolet' }))

    const { loadSettings } = await freshSettings()
    const settings = await loadSettings()

    expect(settings.hotkey).toBe('Alt+N') // kept
    expect(settings.theme).toBe('system') // repaired
  })

  it('rejects a relative notes folder', async () => {
    // A relative path resolves against the process working directory, which for
    // a packaged app is wherever the user happened to launch it from.
    await writeFile(settingsFile(), JSON.stringify({ notesDir: './notes' }))

    const { loadSettings } = await freshSettings()
    expect((await loadSettings()).notesDir).toBe(join(state.documents, 'Note Taker'))
  })

  it.each([
    ['an empty hotkey', ''],
    ['a whitespace hotkey', '   ']
  ])('rejects %s', async (_label, hotkey) => {
    await writeFile(settingsFile(), JSON.stringify({ hotkey }))

    const { loadSettings } = await freshSettings()
    expect((await loadSettings()).hotkey).toBe('CommandOrControl+Space')
  })

  it('ignores values of the wrong type', async () => {
    await writeFile(settingsFile(), JSON.stringify({ hotkey: 42, notesDir: true, theme: [] }))

    const { loadSettings } = await freshSettings()
    const settings = await loadSettings()

    expect(settings.hotkey).toBe('CommandOrControl+Space')
    expect(settings.theme).toBe('system')
  })

  it('defaults the window size to small, so an old settings file does not move the window', async () => {
    // Every settings file written before this option existed lacks the key. The
    // window those users know is the small one, and it must stay that way.
    await writeFile(settingsFile(), JSON.stringify({ hotkey: 'Alt+N', theme: 'dark' }))

    const { loadSettings } = await freshSettings()
    expect((await loadSettings()).overlaySize).toBe('small')
  })

  it.each([['small'], ['medium'], ['full']])('keeps a stored window size of %s', async (size) => {
    await writeFile(settingsFile(), JSON.stringify({ overlaySize: size }))

    const { loadSettings } = await freshSettings()
    expect((await loadSettings()).overlaySize).toBe(size)
  })

  it.each([
    ['a size that does not exist', 'enormous'],
    ['a number', 3],
    ['an object', { width: 4000 }],
    ['null', null]
  ])('repairs %s back to small', async (_label, overlaySize) => {
    await writeFile(settingsFile(), JSON.stringify({ overlaySize }))

    const { loadSettings } = await freshSettings()
    expect((await loadSettings()).overlaySize).toBe('small')
  })

  it('applies the stored theme to the OS', async () => {
    await writeFile(settingsFile(), JSON.stringify({ theme: 'dark' }))

    const { loadSettings } = await freshSettings()
    await loadSettings()

    // This is what makes an explicit choice work without any CSS: Electron
    // feeds themeSource into the renderer's prefers-color-scheme.
    expect(state.themeSource).toBe('dark')
  })
})

describe('notesDirectory and currentHotkey', () => {
  it('answer with defaults before loadSettings has run', async () => {
    // Both are synchronous and may be called during startup, before the file
    // has been read.
    const { notesDirectory, currentHotkey } = await freshSettings()
    expect(notesDirectory()).toBe(join(state.documents, 'Note Taker'))
    expect(currentHotkey()).toBe('CommandOrControl+Space')
  })

  it('answer with stored values afterwards', async () => {
    await writeFile(
      settingsFile(),
      JSON.stringify({ hotkey: 'Alt+N', notesDir: join(state.documents, 'Custom') })
    )

    const { loadSettings, notesDirectory, currentHotkey } = await freshSettings()
    await loadSettings()

    expect(notesDirectory()).toBe(join(state.documents, 'Custom'))
    expect(currentHotkey()).toBe('Alt+N')
  })
})

describe('getSettings', () => {
  it('reads launchAtLogin live from the OS, not from our file', async () => {
    // The user can change startup items outside this app. A mirrored copy would
    // show the wrong state and then overwrite the real one on the next save.
    const { loadSettings, getSettings } = await freshSettings()
    await loadSettings()

    expect(getSettings().launchAtLogin).toBe(false)
    state.launchAtLogin = true
    expect(getSettings().launchAtLogin).toBe(true)
  })
})

describe('updateSettings', () => {
  it('persists a change and survives a reload', async () => {
    const first = await freshSettings()
    await first.loadSettings()
    await first.updateSettings({ theme: 'light' }, alwaysAvailable)

    const second = await freshSettings()
    expect((await second.loadSettings()).theme).toBe('light')
  })

  it('writes readable JSON, since the file is in a folder the user can open', async () => {
    const { loadSettings, updateSettings } = await freshSettings()
    await loadSettings()
    await updateSettings({ hotkey: 'Alt+N' }, alwaysAvailable)

    const raw = await readFile(settingsFile(), 'utf8')
    expect(raw).toContain('\n') // pretty-printed, not minified
    expect(JSON.parse(raw)).toMatchObject({ hotkey: 'Alt+N' })
  })

  it('does not persist launchAtLogin — the OS owns it', async () => {
    const { loadSettings, updateSettings } = await freshSettings()
    await loadSettings()
    await updateSettings({ launchAtLogin: true }, alwaysAvailable)

    expect(state.launchAtLogin).toBe(true)
    expect(JSON.parse(await readFile(settingsFile(), 'utf8'))).not.toHaveProperty('launchAtLogin')
  })

  it('keeps the old hotkey when the OS refuses the new one', async () => {
    const { loadSettings, updateSettings, currentHotkey } = await freshSettings()
    await loadSettings()

    const result = await updateSettings(
      { hotkey: 'CommandOrControl+Shift+X' },
      { applyHotkey: () => false }
    )

    // A rejected change must never leave the app with no way to summon it.
    expect(result.error).toMatch(/already using/)
    expect(result.settings.hotkey).toBe('CommandOrControl+Space')
    expect(currentHotkey()).toBe('CommandOrControl+Space')
  })

  it('adopts the hotkey when the OS accepts it', async () => {
    const { loadSettings, updateSettings, currentHotkey } = await freshSettings()
    await loadSettings()

    const result = await updateSettings({ hotkey: 'Alt+N' }, alwaysAvailable)

    expect(result.error).toBeUndefined()
    expect(currentHotkey()).toBe('Alt+N')
  })

  it('does not re-register when the hotkey is unchanged', async () => {
    const applyHotkey = vi.fn(() => true)
    const { loadSettings, updateSettings } = await freshSettings()
    await loadSettings()

    await updateSettings({ hotkey: 'CommandOrControl+Space' }, { applyHotkey })

    // Re-registering would briefly release the accelerator for no reason.
    expect(applyHotkey).not.toHaveBeenCalled()
  })

  it('rejects an empty hotkey without consulting the OS', async () => {
    const applyHotkey = vi.fn(() => true)
    const { loadSettings, updateSettings } = await freshSettings()
    await loadSettings()

    const result = await updateSettings({ hotkey: '  ' }, { applyHotkey })

    expect(result.error).toBe('Shortcut cannot be empty.')
    expect(applyHotkey).not.toHaveBeenCalled()
  })

  it('creates the notes folder while the user is watching', async () => {
    const target = join(state.documents, 'Nested', 'Notes')
    const { loadSettings, updateSettings, notesDirectory } = await freshSettings()
    await loadSettings()

    const result = await updateSettings({ notesDir: target }, alwaysAvailable)

    expect(result.error).toBeUndefined()
    expect(notesDirectory()).toBe(target)
    // Failing here, rather than on the next silent autosave, is the point.
    await expect(readFile(join(target, 'probe'), 'utf8')).rejects.toThrow(/ENOENT/)
  })

  it('refuses a relative notes folder', async () => {
    const { loadSettings, updateSettings, notesDirectory } = await freshSettings()
    await loadSettings()

    const result = await updateSettings({ notesDir: 'notes' }, alwaysAvailable)

    expect(result.error).toMatch(/absolute/)
    expect(notesDirectory()).toBe(join(state.documents, 'Note Taker'))
  })

  it('applies a theme change immediately', async () => {
    const { loadSettings, updateSettings } = await freshSettings()
    await loadSettings()

    await updateSettings({ theme: 'dark' }, alwaysAvailable)
    expect(state.themeSource).toBe('dark')
  })

  it('changes the window size', async () => {
    const { loadSettings, updateSettings } = await freshSettings()
    await loadSettings()

    const result = await updateSettings({ overlaySize: 'full' }, alwaysAvailable)

    expect(result.error).toBeUndefined()
    expect(result.settings.overlaySize).toBe('full')
  })

  it('persists the window size across a restart', async () => {
    const first = await freshSettings()
    await first.loadSettings()
    await first.updateSettings({ overlaySize: 'medium' }, alwaysAvailable)

    const second = await freshSettings()
    expect((await second.loadSettings()).overlaySize).toBe('medium')
    expect(second.currentOverlaySize()).toBe('medium')
  })

  it('ignores a window size it does not recognise', async () => {
    const { loadSettings, updateSettings } = await freshSettings()
    await loadSettings()

    // The renderer's payload is validated for shape before it gets here, but
    // this is the layer that owns the *values*, so it checks them too.
    const result = await updateSettings(
      { overlaySize: 'gigantic' } as never,
      alwaysAvailable
    )
    expect(result.settings.overlaySize).toBe('small')
  })

  it('applies the changes that worked even when another one failed', async () => {
    const { loadSettings, updateSettings } = await freshSettings()
    await loadSettings()

    const result = await updateSettings(
      { hotkey: 'Alt+Taken', theme: 'dark' },
      { applyHotkey: () => false }
    )

    // Partial success is the honest outcome: the user sees why the shortcut
    // was refused, and the theme they also picked still takes effect.
    expect(result.error).toBeTruthy()
    expect(result.settings.theme).toBe('dark')
    expect(result.settings.hotkey).toBe('CommandOrControl+Space')
  })

  it('ignores an empty patch', async () => {
    const { loadSettings, updateSettings } = await freshSettings()
    const before = await loadSettings()

    const result = await updateSettings({}, alwaysAvailable)

    expect(result.error).toBeUndefined()
    expect(result.settings).toMatchObject(before)
  })
})

describe('portable builds', () => {
  it('stores settings beside the executable when running portable', async () => {
    // electron-builder's portable target sets this to the folder holding the
    // .exe. Writing there keeps a USB copy self-contained instead of leaving
    // its options in the AppData of whichever machine it was last plugged into.
    const portableDir = await mkdtemp(join(tmpdir(), 'note-taker-portable-'))
    process.env['PORTABLE_EXECUTABLE_DIR'] = portableDir

    try {
      const { loadSettings, updateSettings } = await freshSettings()
      await loadSettings()
      await updateSettings({ theme: 'dark' }, alwaysAvailable)

      const written = await readFile(join(portableDir, 'settings.json'), 'utf8')
      expect(JSON.parse(written)).toMatchObject({ theme: 'dark' })
      // And nothing in the per-user location.
      await expect(readFile(settingsFile(), 'utf8')).rejects.toThrow(/ENOENT/)
    } finally {
      await rm(portableDir, { recursive: true, force: true })
    }
  })
})
