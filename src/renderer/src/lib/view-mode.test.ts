import { describe, expect, it } from 'vitest'
import { nextViewMode, showsEditor, showsPreview, VIEW_MODES, type ViewMode } from './view-mode'

describe('nextViewMode', () => {
  it('goes editor, split, preview, and back', () => {
    expect(nextViewMode('edit')).toBe('split')
    expect(nextViewMode('split')).toBe('preview')
    expect(nextViewMode('preview')).toBe('edit')
  })

  it('returns to where it started after one full cycle', () => {
    // The shortcut is the only way to reach every mode from the keyboard, so
    // it must never strand the user in one of them.
    let mode: ViewMode = 'edit'
    for (let step = 0; step < VIEW_MODES.length; step++) mode = nextViewMode(mode)
    expect(mode).toBe('edit')
  })

  it('reaches every mode', () => {
    let mode: ViewMode = 'edit'
    const seen = new Set<ViewMode>([mode])
    for (let step = 0; step < VIEW_MODES.length; step++) {
      mode = nextViewMode(mode)
      seen.add(mode)
    }
    expect([...seen].sort()).toEqual([...VIEW_MODES].sort())
  })
})

describe('pane visibility', () => {
  it('shows the editor everywhere except preview', () => {
    expect(showsEditor('edit')).toBe(true)
    expect(showsEditor('split')).toBe(true)
    expect(showsEditor('preview')).toBe(false)
  })

  it('shows the preview everywhere except edit', () => {
    expect(showsPreview('edit')).toBe(false)
    expect(showsPreview('split')).toBe(true)
    expect(showsPreview('preview')).toBe(true)
  })

  it('always shows at least one pane', () => {
    // An empty workspace is the one state that would look like a crash.
    for (const mode of VIEW_MODES) {
      expect(showsEditor(mode) || showsPreview(mode)).toBe(true)
    }
  })
})
