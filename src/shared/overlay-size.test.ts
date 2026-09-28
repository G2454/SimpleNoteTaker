import { describe, expect, it } from 'vitest'
import { overlayBounds, OVERLAY_SIZES, type Bounds } from './overlay-size'
import { WINDOW_HEIGHT, WINDOW_WIDTH } from './constants'

/**
 * The failure this guards against is a window placed partly off-screen, which
 * on a frameless always-on-top overlay is unrecoverable: there is no title bar
 * to drag back and no taskbar entry to restore from. So the cases below are
 * mostly awkward displays rather than ordinary ones.
 *
 * `workArea` carries a non-zero origin on a secondary monitor, and a non-zero
 * `y` on a display whose taskbar is at the top — both are real configurations
 * and both are easy to get wrong by centring against width/height alone.
 */

/** A typical 1080p primary display with a 40px taskbar at the bottom. */
const primary: Bounds = { x: 0, y: 0, width: 1920, height: 1040 }

/** A second monitor to the right of it, in the same coordinate space. */
const secondary: Bounds = { x: 1920, y: 0, width: 2560, height: 1400 }

/** A small laptop panel — narrower than the medium preset asks for. */
const laptop: Bounds = { x: 0, y: 0, width: 1024, height: 640 }

const within = (bounds: Bounds, workArea: Bounds): boolean =>
  bounds.x >= workArea.x &&
  bounds.y >= workArea.y &&
  bounds.x + bounds.width <= workArea.x + workArea.width &&
  bounds.y + bounds.height <= workArea.y + workArea.height

describe('overlayBounds', () => {
  it('keeps small at the size the app has always been', () => {
    const bounds = overlayBounds('small', primary)
    expect(bounds.width).toBe(WINDOW_WIDTH)
    expect(bounds.height).toBe(WINDOW_HEIGHT)
  })

  it('makes each size at least as large as the one before it', () => {
    const areas = OVERLAY_SIZES.map((size) => {
      const bounds = overlayBounds(size, primary)
      return bounds.width * bounds.height
    })
    expect(areas).toEqual([...areas].sort((a, b) => a - b))
  })

  it('gives full the entire work area', () => {
    const bounds = overlayBounds('full', primary)
    expect(bounds).toEqual({ x: 0, y: 0, width: 1920, height: 1040 })
  })

  it('centres horizontally', () => {
    const bounds = overlayBounds('small', primary)
    expect(bounds.x + bounds.width / 2).toBe(primary.width / 2)
  })

  it('sits slightly above vertical centre', () => {
    // Above the geometric middle, but still in the upper-middle of the screen
    // rather than pinned to the top.
    const bounds = overlayBounds('small', primary)
    const centred = (primary.height - bounds.height) / 2
    expect(bounds.y).toBeLessThan(centred)
    expect(bounds.y).toBeGreaterThan(0)
  })

  it.each(OVERLAY_SIZES)('keeps %s fully on a 1080p display', (size) => {
    expect(within(overlayBounds(size, primary), primary)).toBe(true)
  })

  it.each(OVERLAY_SIZES)('keeps %s fully on a small laptop display', (size) => {
    // The medium preset is wider than this screen. Clamping, not overflowing,
    // is the whole point.
    expect(within(overlayBounds(size, laptop), laptop)).toBe(true)
  })

  it.each(OVERLAY_SIZES)('keeps %s on the second monitor, not back on the first', (size) => {
    const bounds = overlayBounds(size, secondary)
    expect(within(bounds, secondary)).toBe(true)
    // The bug this catches: centring on width alone puts the window at x≈580,
    // which is the middle of the *primary* display.
    expect(bounds.x).toBeGreaterThanOrEqual(secondary.x)
  })

  it('respects a taskbar along the top of the screen', () => {
    const topTaskbar: Bounds = { x: 0, y: 48, width: 1920, height: 1032 }
    for (const size of OVERLAY_SIZES) {
      expect(overlayBounds(size, topTaskbar).y).toBeGreaterThanOrEqual(48)
    }
  })

  it('never asks for a window larger than the screen', () => {
    const tiny: Bounds = { x: 0, y: 0, width: 640, height: 400 }
    for (const size of OVERLAY_SIZES) {
      const bounds = overlayBounds(size, tiny)
      expect(bounds.width).toBeLessThanOrEqual(tiny.width)
      expect(bounds.height).toBeLessThanOrEqual(tiny.height)
    }
  })

  it('produces whole-pixel positions', () => {
    // Fractional window coordinates are rounded by the OS anyway, and an odd
    // work-area width would otherwise put the panel on a half pixel.
    const odd: Bounds = { x: 3, y: 7, width: 1601, height: 903 }
    for (const size of OVERLAY_SIZES) {
      const bounds = overlayBounds(size, odd)
      expect(Number.isInteger(bounds.x)).toBe(true)
      expect(Number.isInteger(bounds.y)).toBe(true)
    }
  })

  it('is a pure function of its inputs', () => {
    // It runs on every summon; the same display must give the same answer.
    expect(overlayBounds('medium', primary)).toEqual(overlayBounds('medium', primary))
  })
})
