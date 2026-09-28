import { VERTICAL_PLACEMENT, WINDOW_HEIGHT, WINDOW_WIDTH } from './constants'
import type { OverlaySize } from './types'

/**
 * How big the overlay is, and where it sits.
 *
 * Kept out of `window.ts` because that module imports `electron` at load time
 * and so cannot be loaded outside a real Electron runtime — the same split as
 * `note-utils.ts` from `notes.ts`. The arithmetic here is the part that can get
 * a note placed half off-screen, so it is the part worth testing.
 */

/** Display order, smallest first. */
export const OVERLAY_SIZES: readonly OverlaySize[] = ['small', 'medium', 'full']

export const OVERLAY_SIZE_LABELS: Record<OverlaySize, string> = {
  small: 'Small',
  medium: 'Medium',
  full: 'Full'
}

/** A rectangle in screen coordinates — the shape of Electron's `workArea`. */
export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

/**
 * The size each preset asks for, before it is fitted to the display.
 *
 * `full` is expressed as the work area itself rather than some very large
 * number: the work area already excludes the taskbar, so "full" means every
 * pixel the user can actually use, and never sits underneath anything.
 */
const PREFERRED: Record<OverlaySize, (workArea: Bounds) => { width: number; height: number }> = {
  // The original dimensions. Small stays the default, so nothing moves for
  // anyone who never opens this setting.
  small: () => ({ width: WINDOW_WIDTH, height: WINDOW_HEIGHT }),
  medium: () => ({ width: 1080, height: 720 }),
  full: (workArea) => ({ width: workArea.width, height: workArea.height })
}

/**
 * Where to put the overlay on a given display.
 *
 * One formula for all three sizes. Requested dimensions are clamped to the
 * work area — a 1080px-wide panel on a 1024px laptop would otherwise hang off
 * the edge — and `full` needs no special case, because clamping a request for
 * the whole work area to the whole work area is a no-op.
 *
 * Horizontally centred; vertically placed slightly above centre, which reads as
 * better balanced because the optical centre sits higher than the geometric one
 * (see VERTICAL_PLACEMENT). At full size both offsets fall out as zero on their
 * own, leaving the panel exactly over the work area.
 */
export function overlayBounds(size: OverlaySize, workArea: Bounds): Bounds {
  const requested = PREFERRED[size](workArea)

  const width = Math.min(requested.width, workArea.width)
  const height = Math.min(requested.height, workArea.height)

  return {
    width,
    height,
    x: Math.round(workArea.x + (workArea.width - width) / 2),
    y: Math.round(workArea.y + (workArea.height - height) * VERTICAL_PLACEMENT)
  }
}
