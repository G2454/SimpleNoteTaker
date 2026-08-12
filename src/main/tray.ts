import { join } from 'node:path'
import { app, Menu, nativeImage, Tray } from 'electron'
import { DEFAULT_HOTKEY } from '../shared/constants'

/**
 * Module-scoped on purpose.
 *
 * A `Tray` that is only referenced by a local variable becomes garbage
 * collected, and the icon silently vanishes from the system tray some seconds
 * after startup. This is one of the most common Electron bugs.
 */
let tray: Tray | null = null

interface TrayHandlers {
  onToggle: () => void
  onQuit: () => void
}

/**
 * Note Taker has no taskbar entry and no window chrome, so the tray icon is the
 * only visible affordance the app exists at all — and the only way to quit it.
 */
export function createTray({ onToggle, onQuit }: TrayHandlers): Tray {
  const icon = nativeImage.createFromPath(resolveIconPath())

  // On macOS a "template image" is recoloured automatically by the OS to suit
  // a light or dark menu bar. Ignored on Windows and Linux.
  icon.setTemplateImage(true)

  tray = new Tray(icon)
  tray.setToolTip('Note Taker')

  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        // The accelerator is shown as a label only — the real binding is the
        // OS-level globalShortcut. Menu accelerators require a focused window,
        // which an overlay app doesn't reliably have.
        label: 'Show / hide Note Taker',
        accelerator: DEFAULT_HOTKEY,
        registerAccelerator: false,
        click: onToggle
      },
      { type: 'separator' },
      {
        label: process.platform === 'darwin' ? 'Open at login' : 'Start with Windows',
        type: 'checkbox',
        checked: app.getLoginItemSettings().openAtLogin,
        click: (item) => setLaunchAtLogin(item.checked)
      },
      { type: 'separator' },
      { label: 'Quit Note Taker', click: onQuit }
    ])
  )

  // Left-click toggles directly. On Windows and macOS this fires; on most
  // Linux desktops only the context menu is available, which is why quitting
  // lives in the menu rather than being click-only.
  tray.on('click', onToggle)

  return tray
}

/**
 * Registers (or removes) Note Taker from the OS's startup items.
 *
 * On Windows this writes a value under
 * `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`; on macOS it adds a
 * login item. No admin rights are needed for either, since both are per-user.
 *
 * A hotkey-summoned overlay is only useful if it's already running, so this is
 * closer to a requirement than a convenience.
 *
 * In development this points at the raw `electron.exe` rather than at a real
 * installed app, so the entry is written but is not meaningfully useful until
 * the app is packaged and installed.
 */
function setLaunchAtLogin(enabled: boolean): void {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    // macOS only: start without showing a window. On Windows the overlay is
    // hidden at startup anyway, so there is nothing to suppress.
    openAsHidden: true
  })
}

export function destroyTray(): void {
  tray?.destroy()
  tray = null
}

/**
 * In dev the compiled main process lives in `out/main/`, so the repo's
 * `resources/` folder is two levels up. In a packaged app the file is copied
 * next to the app bundle — see `extraResources` in electron-builder.yml.
 */
function resolveIconPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'tray.png')
    : join(__dirname, '../../resources/tray.png')
}
