/**
 * What each toolbar button does to the text.
 *
 * Deliberately a pure function of `(document, selection)` returning a
 * *description* of an edit, rather than something that talks to CodeMirror.
 * Two reasons:
 *
 * 1. This is the part with all the fiddly rules — where the markers go, what
 *    counts as already-bold, how a list renumbers — and it can be tested
 *    exhaustively as plain strings, with no editor and no DOM.
 * 2. The editor stays a thin adapter. `Editor.tsx` turns a `DocumentEdit` into
 *    a CodeMirror transaction in six lines and knows nothing about markdown.
 *
 * The guiding principle throughout: **toggle, don't accumulate.** Pressing Bold
 * on bold text unbolds it; pressing Bullet List on a numbered list converts it.
 * A button that can only add is a button you have to undo by hand.
 */

export type MarkdownAction =
  | 'bold'
  | 'italic'
  | 'strikethrough'
  | 'code'
  | 'heading'
  | 'quote'
  | 'bulletList'
  | 'numberedList'
  | 'taskList'
  | 'link'
  | 'codeBlock'
  | 'table'
  | 'horizontalRule'
  | 'mermaid'

/**
 * An edit to apply, in document offsets.
 *
 * `from`/`to`/`insert` describe the replacement; `anchor`/`head` describe where
 * the selection should end up **after** it has been applied. A collapsed
 * selection (anchor === head) is a caret.
 */
export interface DocumentEdit {
  from: number
  to: number
  insert: string
  anchor: number
  head: number
}

/** Markers for the actions that wrap a run of text on both sides. */
const WRAPPERS = {
  bold: '**',
  italic: '*',
  strikethrough: '~~',
  code: '`'
} as const

/** Where the heading button goes next. Ends back at plain text (BR-7). */
function nextHeadingLevel(current: number): number {
  if (current === 0) return 1
  if (current === 1) return 2
  if (current === 2) return 3
  return 0
}

/* ------------------------------------------------------------------ ranges */

function lineStartAt(doc: string, pos: number): number {
  if (pos <= 0) return 0
  return doc.lastIndexOf('\n', pos - 1) + 1
}

function lineEndAt(doc: string, pos: number): number {
  const newline = doc.indexOf('\n', pos)
  return newline === -1 ? doc.length : newline
}

/**
 * Letters, digits and underscores. Deliberately not "anything but a space":
 * that would swallow the full stop at the end of a sentence into the word.
 * The unicode property escapes matter — notes are not necessarily in English.
 */
function isWordChar(char: string): boolean {
  return /[\p{L}\p{N}_]/u.test(char)
}

/**
 * The word under a caret, used so the inline buttons do something useful
 * without a selection.
 */
function wordAround(doc: string, pos: number): { from: number; to: number } {
  let from = pos
  let to = pos
  while (from > 0 && isWordChar(doc[from - 1])) from--
  while (to < doc.length && isWordChar(doc[to])) to++
  return { from, to }
}

/* ------------------------------------------------------------------ inline */

/**
 * Is this text already wrapped in `marker`?
 *
 * The `*` case needs care: `**bold**` starts and ends with `*`, but italicising
 * it must not strip one marker off each end and leave `*bold*`. Asking for
 * italic on bold text means *both*, so this reports false and the caller wraps.
 */
function isWrappedIn(text: string, marker: string): boolean {
  if (text.length < marker.length * 2) return false
  if (!text.startsWith(marker) || !text.endsWith(marker)) return false
  if (marker === '*' && text.startsWith('**') && text.endsWith('**')) return false
  return true
}

function toggleWrap(doc: string, from: number, to: number, marker: string): DocumentEdit {
  let start = from
  let end = to

  if (start === end) {
    const word = wordAround(doc, start)
    start = word.from
    end = word.to
  }

  const selected = doc.slice(start, end)
  const width = marker.length

  // Case 1: the markers are inside the selection — `**bold**` is selected.
  if (isWrappedIn(selected, marker)) {
    const inner = selected.slice(width, selected.length - width)
    return { from: start, to: end, insert: inner, anchor: start, head: start + inner.length }
  }

  // Case 2: the markers sit just outside it — `bold` is selected, `**` is not.
  const insideOutMarkers =
    start >= width && doc.slice(start - width, start) === marker && doc.slice(end, end + width) === marker
  const wouldSplitBold = marker === '*' && doc.slice(start - 2, start) === '**'

  if (insideOutMarkers && !wouldSplitBold) {
    return {
      from: start - width,
      to: end + width,
      insert: selected,
      anchor: start - width,
      head: start - width + selected.length
    }
  }

  // Case 3: not formatted yet. Wrap it.
  const insert = marker + selected + marker
  const innerStart = start + width
  return {
    from: start,
    to: end,
    insert,
    anchor: innerStart,
    // With nothing selected this leaves a caret between the markers, ready to
    // type into. With a selection it keeps the same text selected.
    head: innerStart + selected.length
  }
}

/* ------------------------------------------------------------------- lines */

const INDENT = /^[ \t]*/
/** Any list marker: bullet, ordered, or task. One family, so they replace each other. */
const LIST_MARKER = /^(?:[-*+] \[[ xX]\] |[-*+] |\d+[.)] )/
const QUOTE_MARKER = /^> ?/
const HEADING_MARKER = /^#{1,6} +/

interface LineParts {
  indent: string
  body: string
}

function splitLine(line: string, strip: RegExp): LineParts {
  const indent = INDENT.exec(line)?.[0] ?? ''
  return { indent, body: line.slice(indent.length).replace(strip, '') }
}

/**
 * Rewrites whole lines, and works out where to leave the selection.
 *
 * With a real selection the whole rewritten block stays selected, so the button
 * can be pressed again to undo it. With a bare caret the caret is kept where it
 * was in the text, shifted by however much the prefix grew or shrank — leaving
 * a freshly bulleted line selected would mean the next keystroke deleted it.
 */
function rewriteLines(
  doc: string,
  from: number,
  to: number,
  rewrite: (lines: string[]) => string[]
): DocumentEdit {
  const blockStart = lineStartAt(doc, from)
  // A selection that ends exactly at the start of a line hasn't really reached
  // that line; without this, selecting one line would format two.
  const lastPos = to > from && to === lineStartAt(doc, to) ? to - 1 : to
  const blockEnd = lineEndAt(doc, lastPos)

  const original = doc.slice(blockStart, blockEnd).split('\n')
  const insert = rewrite(original).join('\n')

  if (from !== to) {
    return { from: blockStart, to: blockEnd, insert, anchor: blockStart, head: blockStart + insert.length }
  }

  const delta = insert.length - (blockEnd - blockStart)
  const caret = Math.min(Math.max(from + delta, blockStart), blockStart + insert.length)
  return { from: blockStart, to: blockEnd, insert, anchor: caret, head: caret }
}

/**
 * Applies or removes a line prefix across the selected lines.
 *
 * Removal wins when *every* non-blank line already has the prefix, which is
 * what makes the button a toggle for a whole list rather than for one line at
 * a time. Blank lines are ignored in that vote and left alone: a blank line in
 * the middle of a selection is a paragraph break, not an empty list item.
 */
function toggleLinePrefix(
  doc: string,
  from: number,
  to: number,
  options: {
    strip: RegExp
    has: (body: string) => boolean
    prefix: (indexAmongMeaningful: number) => string
  }
): DocumentEdit {
  return rewriteLines(doc, from, to, (lines) => {
    const meaningful = lines.filter((line) => line.trim() !== '')
    const removing =
      meaningful.length > 0 &&
      meaningful.every((line) => options.has(line.slice((INDENT.exec(line)?.[0] ?? '').length)))

    let position = 0
    return lines.map((line) => {
      // An all-blank selection still gets the prefix — that is someone starting
      // a list on an empty line.
      if (line.trim() === '' && meaningful.length > 0) return line

      const { indent, body } = splitLine(line, options.strip)
      if (removing) return indent + body

      const prefixed = indent + options.prefix(position) + body
      position++
      return prefixed
    })
  })
}

function toggleHeading(doc: string, from: number, to: number): DocumentEdit {
  const firstLine = doc.slice(lineStartAt(doc, from), lineEndAt(doc, from))
  const firstBody = firstLine.slice((INDENT.exec(firstLine)?.[0] ?? '').length)
  const current = HEADING_MARKER.exec(firstBody)?.[0].trimEnd().length ?? 0
  const level = nextHeadingLevel(current)

  return rewriteLines(doc, from, to, (lines) => {
    const hasProse = lines.some((line) => line.trim() !== '')
    return lines.map((line) => {
      // Blank lines inside a multi-line selection stay blank, but a heading
      // started on an empty line is exactly how you begin a section.
      if (line.trim() === '' && hasProse) return line
      const { indent, body } = splitLine(line, HEADING_MARKER)
      return level === 0 ? indent + body : `${indent}${'#'.repeat(level)} ${body}`
    })
  })
}

/* ------------------------------------------------------------------ blocks */

/**
 * A block needs blank lines around it, and this is not cosmetic.
 *
 * In GFM a table cannot interrupt a paragraph, and — worse — a `---` on the
 * line directly below text turns that text into a heading instead of drawing a
 * rule. Inserting at the caret without checking would silently produce
 * different markdown than the button promises.
 */
function blockPadding(doc: string, from: number, to: number): { before: string; after: string } {
  const preceding = doc.slice(0, from)
  const following = doc.slice(to)

  let before = ''
  if (preceding.length > 0 && !preceding.endsWith('\n\n')) {
    before = preceding.endsWith('\n') ? '\n' : '\n\n'
  }

  let after = '\n'
  if (following.length > 0) {
    after = following.startsWith('\n\n') ? '' : following.startsWith('\n') ? '\n' : '\n\n'
  }

  return { before, after }
}

interface BlockTemplate {
  text: string
  /** Selection within `text`, so the useful part is ready to be replaced. */
  selectFrom: number
  selectTo: number
}

function insertBlock(doc: string, from: number, to: number, block: BlockTemplate): DocumentEdit {
  const { before, after } = blockPadding(doc, from, to)
  const insert = before + block.text + after
  const origin = from + before.length

  return {
    from,
    to,
    insert,
    anchor: origin + block.selectFrom,
    head: origin + block.selectTo
  }
}

function codeBlockTemplate(selected: string): BlockTemplate {
  if (selected.length === 0) {
    // Caret on the empty line between the fences.
    return { text: '```\n\n```', selectFrom: 4, selectTo: 4 }
  }
  return { text: `\`\`\`\n${selected}\n\`\`\``, selectFrom: 4, selectTo: 4 + selected.length }
}

/**
 * A diagram that renders as soon as it is inserted.
 *
 * An empty ` ```mermaid ` fence would be technically correct and completely
 * useless: mermaid's syntax is the part nobody remembers. A working example
 * that already appears in the preview is both the feature and its documentation.
 */
function mermaidTemplate(selected: string): BlockTemplate {
  const body =
    selected.trim().length > 0
      ? selected
      : ['flowchart TD', '  A[Start] --> B{Looks right?}', '  B -- Yes --> C[Ship it]', '  B -- No --> D[Tweak it]', '  D --> B'].join('\n')

  const text = `\`\`\`mermaid\n${body}\n\`\`\``
  // Caret at the end of the diagram body, ready for the next line.
  const end = text.length - 4
  return { text, selectFrom: end, selectTo: end }
}

function tableTemplate(): BlockTemplate {
  const text = ['| Column 1 | Column 2 | Column 3 |', '| --- | --- | --- |', '|  |  |  |'].join('\n')
  // The first header cell is selected: the first thing anyone does with a new
  // table is name its columns.
  return { text, selectFrom: 2, selectTo: 10 }
}

function linkEdit(doc: string, from: number, to: number): DocumentEdit {
  const selected = doc.slice(from, to)

  if (selected.length === 0) {
    const insert = '[link](url)'
    // No text yet, so the label is what needs writing first.
    return { from, to, insert, anchor: from + 1, head: from + 5 }
  }

  const insert = `[${selected}](url)`
  // The label is already written — put the selection on the URL, which is
  // usually about to be pasted.
  const urlStart = from + selected.length + 3
  return { from, to, insert, anchor: urlStart, head: urlStart + 3 }
}

/* ---------------------------------------------------------------- dispatch */

/**
 * Works out the edit a toolbar button should make.
 *
 * `from`/`to` are the current selection; pass the same value twice for a caret.
 * They are normalised here so a backwards selection (dragged right to left)
 * behaves identically to a forwards one.
 */
export function markdownEdit(
  action: MarkdownAction,
  doc: string,
  from: number,
  to: number
): DocumentEdit {
  const start = Math.min(from, to)
  const end = Math.max(from, to)

  switch (action) {
    case 'bold':
    case 'italic':
    case 'strikethrough':
    case 'code':
      return toggleWrap(doc, start, end, WRAPPERS[action])

    case 'heading':
      return toggleHeading(doc, start, end)

    case 'quote':
      return toggleLinePrefix(doc, start, end, {
        strip: QUOTE_MARKER,
        has: (body) => QUOTE_MARKER.test(body),
        prefix: () => '> '
      })

    case 'bulletList':
      return toggleLinePrefix(doc, start, end, {
        strip: LIST_MARKER,
        has: (body) => /^[-*+] (?!\[[ xX]\] )/.test(body),
        prefix: () => '- '
      })

    case 'numberedList':
      return toggleLinePrefix(doc, start, end, {
        strip: LIST_MARKER,
        has: (body) => /^\d+[.)] /.test(body),
        prefix: (index) => `${index + 1}. `
      })

    case 'taskList':
      return toggleLinePrefix(doc, start, end, {
        strip: LIST_MARKER,
        has: (body) => /^[-*+] \[[ xX]\] /.test(body),
        prefix: () => '- [ ] '
      })

    case 'link':
      return linkEdit(doc, start, end)

    case 'codeBlock':
      return insertBlock(doc, start, end, codeBlockTemplate(doc.slice(start, end)))

    case 'mermaid':
      return insertBlock(doc, start, end, mermaidTemplate(doc.slice(start, end)))

    // These two insert *after* the selection rather than replacing it. A code
    // fence or a diagram is a conversion of the selected text; a table or a
    // rule is not, and silently deleting a paragraph to make room for a
    // horizontal line would be a nasty surprise.
    case 'table':
      return insertBlock(doc, end, end, tableTemplate())

    case 'horizontalRule':
      return insertBlock(doc, end, end, { text: '---', selectFrom: 3, selectTo: 3 })
  }
}

/** Convenience for tests and for anything that just wants the resulting text. */
export function applyEdit(doc: string, edit: DocumentEdit): string {
  return doc.slice(0, edit.from) + edit.insert + doc.slice(edit.to)
}
