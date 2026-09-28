/**
 * How much of the workspace the editor and the preview each get.
 *
 * Three states rather than a boolean "preview on/off": on a 760px overlay,
 * side-by-side is genuinely cramped, so reading a long note wants the whole
 * panel — but watching a diagram take shape as you type wants both at once.
 */
export type ViewMode = 'edit' | 'split' | 'preview'

/** Display order, and the order the keyboard shortcut cycles through. */
export const VIEW_MODES: readonly ViewMode[] = ['edit', 'split', 'preview']

export const VIEW_MODE_LABELS: Record<ViewMode, string> = {
  edit: 'Edit',
  split: 'Split',
  preview: 'Preview'
}

/** The next mode, wrapping around. One shortcut reaches all three. */
export function nextViewMode(current: ViewMode): ViewMode {
  const index = VIEW_MODES.indexOf(current)
  return VIEW_MODES[(index + 1) % VIEW_MODES.length]
}

/** Is the editor on screen? Drives whether the formatting buttons are shown. */
export function showsEditor(mode: ViewMode): boolean {
  return mode !== 'preview'
}

export function showsPreview(mode: ViewMode): boolean {
  return mode !== 'edit'
}
