import { app, BrowserWindow, globalShortcut, ipcMain } from 'electron'
import { createOverlayWindow, positionOnActiveDisplay } from './window'
import { createTray, destroyTray } from './tray'
import { registerNoteHandlers } from './ipc'
import { DEFAULT_HOTKEY, IPC } from '../shared/constants'

let overlay: BrowserWindow | null = null

/**
 * Set once the user has genuinely asked to exit.
 *
 * Without this flag, a future "hide instead of close" handler on the window
 * would swallow the quit and leave an unkillable background process.
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

function onReady(): void {
  overlay = createOverlayWindow()

  // The tray is the app's only visible surface — no taskbar entry, no window
  // chrome — and the only way to quit.
  createTray({ onToggle: toggleOverlay, onQuit: quitApp })

  // Alt+F4 (and any other OS-level close) would otherwise destroy the window,
  // making every later summon slow and eventually breaking the hotkey. Treat a
  // close request as "hide" unless the user is genuinely quitting.
  overlay.on('close', (event) => {
    if (isQuitting) return
    event.preventDefault()
    hideOverlay()
  })

  registerNoteHandlers()

  // Hiding is triggered from the renderer (Escape, or clicking away), because
  // the renderer is what knows whether the note has been saved.
  ipcMain.on(IPC.hideOverlay, hideOverlay)

  const registered = globalShortcut.register(DEFAULT_HOTKEY, toggleOverlay)
  if (!registered) {
    // Another app owns this accelerator. Non-fatal, but the app is useless
    // without it, so make the failure loud rather than silent.
    console.error(
      `[note-taker] Could not register hotkey "${DEFAULT_HOTKEY}" — another application is using it.`
    )
  }
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
 * Note Taker is a background app: hiding the overlay must not end the process, or
 * the hotkey would stop working after first use. On macOS this is the norm
 * anyway; here we apply it to every platform.
 *
 * Quitting is therefore only possible from the tray menu.
 */
app.on('window-all-closed', () => {
  // intentionally empty
})
