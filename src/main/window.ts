import { join } from 'node:path'
import { app, BrowserWindow, screen } from 'electron'
import {
  VERTICAL_PLACEMENT,
  WINDOW_HEIGHT,
  WINDOW_WIDTH
} from '../shared/constants'

/**
 * Builds the overlay window.
 *
 * Called exactly once, at startup. The window is then kept alive and hidden for
 * the lifetime of the process — see `positionOnActiveDisplay` and the toggle
 * logic in `index.ts`. Constructing a BrowserWindow costs hundreds of
 * milliseconds, which would blow the "instant summon" requirement (BR-1).
 */
export function createOverlayWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,

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

  loadRenderer(win)
  return win
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
 * Centres the window horizontally on whichever display currently holds the
 * cursor, and places it slightly above vertical centre.
 *
 * Using the cursor's display rather than the primary one is what makes this
 * behave correctly on multi-monitor setups: the overlay appears on the screen
 * you're actually looking at.
 *
 * `workArea` (not `bounds`) excludes the taskbar, so we never sit under it.
 */
export function positionOnActiveDisplay(win: BrowserWindow): void {
  const cursor = screen.getCursorScreenPoint()
  const { workArea } = screen.getDisplayNearestPoint(cursor)
  const [width, height] = win.getSize()

  win.setPosition(
    Math.round(workArea.x + (workArea.width - width) / 2),
    Math.round(workArea.y + (workArea.height - height) * VERTICAL_PLACEMENT)
  )
}
