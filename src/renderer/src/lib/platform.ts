/**
 * Platform detection for the renderer.
 *
 * Deliberately not `navigator.platform`, which is deprecated and frozen in
 * modern Chromium. The user-agent string still reports "Macintosh" reliably in
 * Electron, and `userAgentData` is not worth the async API for one boolean.
 *
 * The renderer has no access to `process.platform` — that lives in Node, on the
 * other side of the sandbox — so this is the signal available to us here.
 */
export function isMac(): boolean {
  return /Mac|iPhone|iPad/.test(navigator.userAgent)
}
