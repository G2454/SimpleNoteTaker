import { app, BrowserWindow, globalShortcut, ipcMain } from 'electron'
import { createOverlayWindow, positionOnActiveDisplay } from './window'
import { createTray, destroyTray, rebuildTrayMenu } from './tray'
import { registerNoteHandlers, registerSettingsHandlers } from './ipc'
import { currentHotkey, loadSettings } from './settings'
import { IPC } from '../shared/constants'

let overlay: BrowserWindow | null = null

/**
 * The accelerator currently held with the OS.
 *
 * Tracked separately from the stored setting because the two can disagree: a
 * requested hotkey that another application owns is rejected, and the previous
 * binding stays live.
 */
let activeHotkey: string | null = null

/**
 * Set once the user has genuinely asked to exit.
 *
 * Without this flag, the "hide instead of close" handler below would swallow
 * the quit and leave an unkillable background process.
 */
let isQuitting = false

/**
 * Only one copy of Note Taker may run at a time.
 *
 * This matters more than usual for a hotkey app: `globalShortcut.register`
 * fails for an accelerator another process already holds, so a second instance
 * would start up with a dead hotkey and the user would see nothing happen.
 */
const gotLock = app.requestSingleInstanceLock()

if (!gotLock) {
  app.quit()
} else {
  // Someone launched Note Taker again — treat it as "show me the overlay".
  app.on('second-instance', showOverlay)
  void app.whenReady().then(onReady)
}

async function onReady(): Promise<void> {
  // Must come first: it decides both the hotkey to claim and the folder the
  // storage layer will read from.
  await loadSettings()

  overlay = createOverlayWindow()

  // The tray is the app's only visible surface — no taskbar entry, no window
  // chrome — and the only way to quit.
  createTray({ onToggle: toggleOverlay, onOpenSettings: openSettings, onQuit: quitApp })

  // Alt+F4 (and any other OS-level close) would otherwise destroy the window,
  // making every later summon slow and eventually breaking the hotkey. Treat a
  // close request as "hide" unless the user is genuinely quitting.
  overlay.on('close', (event) => {
    if (isQuitting) return
    event.preventDefault()
    hideOverlay()
  })

  registerNoteHandlers()
  registerSettingsHandlers({ applyHotkey, getWindow: () => overlay })

  // Hiding is triggered from the renderer (Escape, or clicking away), because
  // the renderer is what knows whether the note has been saved.
  ipcMain.on(IPC.hideOverlay, hideOverlay)

  if (!applyHotkey(currentHotkey())) {
    // Another app owns this accelerator. Non-fatal, but the app is useless
    // without it, so make the failure loud rather than silent. The user can
    // pick a different one in Options.
    console.error(
      `[note-taker] Could not register hotkey "${currentHotkey()}" — another application is using it.`
    )
  }
}

/**
 * Claims an accelerator, releasing whichever one we held before.
 *
 * Returns false if the OS refuses — typically because another application got
 * there first. On failure the previous binding is restored, so a rejected
 * change never leaves the app with no way to summon it.
 */
function applyHotkey(accelerator: string): boolean {
  const previous = activeHotkey

  // Free the old one first: registering while we still hold a conflicting
  // accelerator would fail against ourselves.
  if (previous) globalShortcut.unregister(previous)

  if (globalShortcut.register(accelerator, toggleOverlay)) {
    activeHotkey = accelerator
    rebuildTrayMenu() // the menu shows the accelerator as a label
    return true
  }

  if (previous && globalShortcut.register(previous, toggleOverlay)) {
    activeHotkey = previous
  } else {
    activeHotkey = null
  }
  return false
}

function toggleOverlay(): void {
  if (!overlay) return
  if (overlay.isVisible()) {
    hideOverlay()
  } else {
    showOverlay()
  }
}

function showOverlay(): void {
  if (!overlay) return

  // Reposition on every summon, not just the first: the user may have moved to
  // a different monitor since last time.
  positionOnActiveDisplay(overlay)

  overlay.show()
  overlay.focus() // we *do* want keyboard input, so take focus deliberately

  // Let the renderer run its entrance animation and focus the editor.
  overlay.webContents.send(IPC.overlayShown)
}

function hideOverlay(): void {
  if (!overlay?.isVisible()) return

  // `hide()` rather than `close()`. The window is reused for the whole session
  // so the next summon is instant (BR-1).
  overlay.hide()
}

/** Tray → "Options…". Summons the overlay first; the screen is inside it. */
function openSettings(): void {
  if (!overlay) return
  showOverlay()
  overlay.webContents.send(IPC.openSettings)
}

/**
 * The one intentional exit path, from the tray menu.
 *
 * `app.quit()` is graceful: it fires `before-quit` / `will-quit`, letting us
 * release the hotkey and the tray icon before the process goes away. Prefer it
 * to `app.exit()`, which terminates immediately and skips that cleanup.
 */
function quitApp(): void {
  isQuitting = true
  app.quit()
}

app.on('before-quit', () => {
  isQuitting = true
})

/**
 * Global shortcuts are an OS-level registration and outlive the JS heap.
 * Failing to release them can leave the accelerator dead until reboot.
 */
app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  destroyTray()
})

/**
 * Deliberately does NOT quit.
 *
 * Note Taker is a background app: hiding the overlay must not end the process,
 * or the hotkey would stop working after first use. On macOS this is the norm
 * anyway; here we apply it to every platform.
 *
 * Quitting is therefore only possible from the tray menu.
 */
app.on('window-all-closed', () => {
  // intentionally empty
})
