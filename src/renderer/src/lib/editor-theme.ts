import { EditorView } from '@codemirror/view'
import { HighlightStyle } from '@codemirror/language'
import { tags } from '@lezer/highlight'

/**
 * CodeMirror's own styling layer.
 *
 * Everything resolves to the CSS custom properties in global.css, so the editor
 * follows the panel's light/dark theme automatically rather than carrying a
 * second, independent palette.
 */
export const editorTheme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '14px',
    backgroundColor: 'transparent',
    color: 'var(--text-primary)'
  },
  // Focus rings belong on inputs, not on a full-panel writing surface.
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': {
    fontFamily: 'var(--font-ui)',
    lineHeight: '1.7',
    padding: '18px 22px',
    overflow: 'auto'
  },
  '.cm-content': {
    // Long lines are hard to read. ~72 characters is the usual comfortable max.
    maxWidth: '72ch',
    padding: 0,
    caretColor: 'var(--accent)'
  },
  '.cm-line': { padding: 0 },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: 'var(--accent)',
    borderLeftWidth: '2px'
  },
  // CodeMirror renders its own selection layer, so the native ::selection
  // colour does not apply and must be set separately.
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: 'var(--selection)'
  },
  '.cm-placeholder': { color: 'var(--text-tertiary)' },
  '.cm-scroller::-webkit-scrollbar': { width: '10px' },
  '.cm-scroller::-webkit-scrollbar-thumb': {
    background: 'var(--scrollbar)',
    borderRadius: '5px',
    border: '3px solid transparent',
    backgroundClip: 'content-box'
  }
})

/**
 * Markdown syntax highlighting.
 *
 * The guiding idea: style the *meaning*, and mute the *markup*. A heading looks
 * like a heading, while its leading `#` fades back — you keep plain-text
 * editing (BR-7) but the document still reads as structured prose.
 */
export const markdownHighlightStyle = HighlightStyle.define([
  { tag: tags.heading1, fontSize: '1.5em', fontWeight: '680', lineHeight: '1.9' },
  { tag: tags.heading2, fontSize: '1.28em', fontWeight: '660', lineHeight: '1.8' },
  { tag: tags.heading3, fontSize: '1.12em', fontWeight: '640' },
  { tag: [tags.heading4, tags.heading5, tags.heading6], fontWeight: '620' },

  { tag: tags.strong, fontWeight: '700' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through', color: 'var(--text-tertiary)' },

  { tag: tags.link, color: 'var(--accent)', textDecoration: 'underline' },
  { tag: tags.url, color: 'var(--text-tertiary)' },

  {
    tag: tags.monospace,
    fontFamily: 'var(--font-mono)',
    fontSize: '0.92em',
    color: 'var(--code)'
  },
  { tag: tags.quote, color: 'var(--text-secondary)', fontStyle: 'italic' },
  { tag: tags.list, color: 'var(--accent)' },

  // The markers themselves: `#`, `*`, backticks, list bullets. Present and
  // editable, but visually out of the way.
  { tag: tags.processingInstruction, color: 'var(--text-tertiary)', fontWeight: '400' }
])
