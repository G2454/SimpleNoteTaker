import { join } from 'node:path'
import { app, BrowserWindow, screen, shell } from 'electron'
import { overlayBounds } from '../shared/overlay-size'
import { isExternallyOpenable } from '../shared/urls'
import { currentOverlaySize } from './settings'

/**
 * Builds the overlay window.
 *
 * Called exactly once, at startup. The window is then kept alive and hidden for
 * the lifetime of the process — see `positionOnActiveDisplay` and the toggle
 * logic in `index.ts`. Constructing a BrowserWindow costs hundreds of
 * milliseconds, which would blow the "instant summon" requirement (BR-1).
 */
export function createOverlayWindow(): BrowserWindow {
  // Sized from the saved setting straight away. `positionOnActiveDisplay` will
  // fit it to the real display on the first summon, but starting at roughly the
  // right size avoids creating a small window and visibly growing it.
  const initial = overlayBounds(currentOverlaySize(), {
    x: 0,
    y: 0,
    ...screen.getPrimaryDisplay().workAreaSize
  })

  const win = new BrowserWindow({
    width: initial.width,
    height: initial.height,

    // Never visible on first paint. We show it on the hotkey instead, once the
    // renderer has finished loading, so the user never sees a white flash.
    show: false,

    // No OS title bar or border — we draw our own chrome.
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',

    // Overlay behaviour.
    alwaysOnTop: true,
    skipTaskbar: true, // don't appear in the taskbar / alt-tab list
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,

    // We draw our own shadow in CSS. The native one would clip to the window
    // rectangle and fight the rounded corners.
    hasShadow: false,

    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),

      // The security boundary. See DOCUMENTATION.md §3.1.
      contextIsolation: true, // renderer and preload get separate JS contexts
      nodeIntegration: false, // no `require` in the renderer
      sandbox: true // renderer runs in Chromium's OS-level sandbox
    }
  })

  // 'screen-saver' is the highest ordinary level; it keeps the overlay above
  // fullscreen windows, which the default `true` does not.
  win.setAlwaysOnTop(true, 'screen-saver')

  // Follow the user across virtual desktops instead of being pinned to the one
  // that happened to be active at launch.
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  preventNavigation(win)
  loadRenderer(win)
  return win
}

/**
 * The overlay is an application, and must never become a browser.
 *
 * Once the preview renders links, a single click could otherwise replace the
 * React app with a web page — inside a frameless window with no address bar,
 * no Back button and no way to return short of restarting. Worse, that page
 * would then be the thing sitting next to the `window.api` bridge.
 *
 * So navigation is refused outright and links are handed to the real browser
 * instead. The renderer already intercepts clicks and asks for exactly this;
 * these handlers are what make that a guarantee rather than a convention, and
 * they also cover `window.open`, target="_blank", form posts and redirects.
 */
function preventNavigation(win: BrowserWindow): void {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternallyOpenable(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  win.webContents.on('will-navigate', (event, url) => {
    // A reload targets the page we are already on; that is not navigating away.
    if (url === win.webContents.getURL()) return

    event.preventDefault()
    if (isExternallyOpenable(url)) void shell.openExternal(url)
  })
}

/**
 * In dev, electron-vite serves the renderer over HTTP so we get hot reload.
 * In production there's no server — we load the built HTML off disk.
 */
function loadRenderer(win: BrowserWindow): void {
  const devServerUrl = process.env['ELECTRON_RENDERER_URL']

  if (!app.isPackaged && devServerUrl) {
    void win.loadURL(devServerUrl)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

/**
 * Sizes and places the window on whichever display currently holds the cursor.
 *
 * Using the cursor's display rather than the primary one is what makes this
 * behave correctly on multi-monitor setups: the overlay appears on the screen
 * you're actually looking at — and, since the size is recomputed here rather
 * than stored, it fits *that* screen. Summoning a "full" overlay on a laptop
 * panel and then on a 4K monitor gives the right answer both times.
 *
 * `workArea` (not `bounds`) excludes the taskbar, so we never sit under it.
 */
export function positionOnActiveDisplay(win: BrowserWindow): void {
  const cursor = screen.getCursorScreenPoint()
  const { workArea } = screen.getDisplayNearestPoint(cursor)
  const bounds = overlayBounds(currentOverlaySize(), workArea)

  // `setBounds` rather than `setPosition`: this is the one place the window's
  // size is decided, and it moves and resizes in a single call so the two can
  // never be applied a frame apart. `resizable: false` does not block it — that
  // flag governs dragging an edge, which stays impossible.
  win.setBounds(bounds)
}
