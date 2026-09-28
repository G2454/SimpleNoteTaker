import { describe, expect, it } from 'vitest'
import { applyEdit, markdownEdit, type MarkdownAction } from './markdown-actions'

/**
 * Cases are written with `|` marking a caret and `«…»` marking a selection,
 * which keeps the intent of each one readable. Guillemets rather than
 * brackets: markdown is made of brackets, and `- [ ] task` would collide.
 *
 * Every assertion checks both what the text became *and* where the selection
 * ended up — a formatting button that leaves the caret in the wrong place is
 * broken even when the markdown it produced is correct.
 */
function parse(annotated: string): { doc: string; from: number; to: number } {
  const caret = annotated.indexOf('|')
  if (caret !== -1) {
    return { doc: annotated.replace('|', ''), from: caret, to: caret }
  }

  const open = annotated.indexOf('«')
  const close = annotated.indexOf('»')
  if (open === -1 || close === -1) return { doc: annotated, from: 0, to: 0 }

  const doc = annotated.slice(0, open) + annotated.slice(open + 1, close) + annotated.slice(close + 1)
  return { doc, from: open, to: close - 1 }
}

/** Applies an action and re-annotates the result, so cases read symmetrically. */
function run(action: MarkdownAction, annotated: string): string {
  const { doc, from, to } = parse(annotated)
  const edit = markdownEdit(action, doc, from, to)
  const next = applyEdit(doc, edit)

  if (edit.anchor === edit.head) {
    return next.slice(0, edit.anchor) + '|' + next.slice(edit.anchor)
  }
  return (
    next.slice(0, edit.anchor) + '«' + next.slice(edit.anchor, edit.head) + '»' + next.slice(edit.head)
  )
}

describe('inline wrapping', () => {
  it('wraps a selection and keeps it selected', () => {
    expect(run('bold', 'make «this» bold')).toBe('make **«this»** bold')
    expect(run('italic', 'make «this» italic')).toBe('make *«this»* italic')
    expect(run('strikethrough', 'make «this» gone')).toBe('make ~~«this»~~ gone')
    expect(run('code', 'call «render» now')).toBe('call `«render»` now')
  })

  it('wraps the word under a bare caret', () => {
    // Without this the button would do nothing useful unless you selected
    // first, which is the main thing that makes toolbars annoying.
    expect(run('bold', 'make th|is bold')).toBe('make **«this»** bold')
  })

  it('leaves a caret between the markers when there is no word', () => {
    expect(run('bold', 'ready |')).toBe('ready **|**')
  })

  it('unwraps when the markers are inside the selection', () => {
    expect(run('bold', 'make «**this**» plain')).toBe('make «this» plain')
  })

  it('unwraps when the markers sit just outside the selection', () => {
    // Selecting the word inside `**word**` and pressing Bold has to remove the
    // formatting, not add a second layer.
    expect(run('bold', 'make **«this»** plain')).toBe('make «this» plain')
  })

  it('adds italic to bold rather than eating one of its markers', () => {
    // `**bold**` starts and ends with `*`. A naive unwrap would turn it into
    // `*bold*` — silently downgrading bold to italic.
    expect(run('italic', 'make «**this**» both')).toBe('make *«**this**»* both')
  })

  it('removes italic from text that is both', () => {
    expect(run('italic', 'make *«**this**»* plain')).toBe('make «**this**» plain')
  })

  it('handles a selection at the very start of the document', () => {
    expect(run('bold', '«start» here')).toBe('**«start»** here')
  })

  it('treats a backwards selection like a forwards one', () => {
    const doc = 'make this bold'
    const forwards = markdownEdit('bold', doc, 5, 9)
    const backwards = markdownEdit('bold', doc, 9, 5)
    expect(applyEdit(doc, backwards)).toBe(applyEdit(doc, forwards))
  })
})

describe('heading', () => {
  it('cycles H1 to H2 to H3 and back to plain text', () => {
    expect(run('heading', 'Tit|le')).toBe('# Tit|le')
    expect(run('heading', '# Tit|le')).toBe('## Tit|le')
    expect(run('heading', '## Tit|le')).toBe('### Tit|le')
    expect(run('heading', '### Tit|le')).toBe('Tit|le')
  })

  it('starts a heading on an empty line', () => {
    expect(run('heading', '|')).toBe('# |')
  })

  it('applies the same level to every selected line', () => {
    expect(run('heading', '«One\nTwo»')).toBe('«# One\n# Two»')
  })

  it('decides the level from the first line of the selection', () => {
    expect(run('heading', '«# One\nTwo»')).toBe('«## One\n## Two»')
  })

  it('returns an already-deep heading to plain text', () => {
    expect(run('heading', '###### Deep|')).toBe('Deep|')
  })

  it('keeps indentation', () => {
    expect(run('heading', '  Ind|ented')).toBe('  # Ind|ented')
  })
})

describe('list and quote prefixes', () => {
  it('adds a bullet to the current line and keeps the caret in the text', () => {
    expect(run('bulletList', 'mi|lk')).toBe('- mi|lk')
  })

  it('removes the bullet when pressed again', () => {
    expect(run('bulletList', '- mi|lk')).toBe('mi|lk')
  })

  it('numbers a selection sequentially', () => {
    expect(run('numberedList', '«one\ntwo\nthree»')).toBe('«1. one\n2. two\n3. three»')
  })

  it('renumbers when converting a bullet list', () => {
    expect(run('numberedList', '«- one\n- two»')).toBe('«1. one\n2. two»')
  })

  it('converts a numbered list to bullets rather than stacking markers', () => {
    expect(run('bulletList', '«1. one\n2. two»')).toBe('«- one\n- two»')
  })

  it('converts a bullet list to tasks', () => {
    expect(run('taskList', '«- one\n- two»')).toBe('«- [ ] one\n- [ ] two»')
  })

  it('does not mistake a task item for a plain bullet', () => {
    // `- [ ] x` starts with `- `, so a careless check would strip the bullet
    // and leave `[ ] x` behind.
    expect(run('bulletList', '«- [ ] one»')).toBe('«- one»')
  })

  it('removes a task list when every item already is one, ticked or not', () => {
    expect(run('taskList', '«- [ ] one\n- [x] two»')).toBe('«one\ntwo»')
  })

  it('adds the prefix when only some lines have it', () => {
    // A partly-formatted selection means "finish the job", not "undo it".
    expect(run('bulletList', '«- one\ntwo»')).toBe('«- one\n- two»')
  })

  it('leaves blank lines between items alone', () => {
    expect(run('bulletList', '«one\n\ntwo»')).toBe('«- one\n\n- two»')
  })

  it('numbers only the non-blank lines', () => {
    expect(run('numberedList', '«one\n\ntwo»')).toBe('«1. one\n\n2. two»')
  })

  it('toggles a quote', () => {
    expect(run('quote', 'sa|id')).toBe('> sa|id')
    expect(run('quote', '> sa|id')).toBe('sa|id')
  })

  it('keeps list markers when quoting', () => {
    // Different families: quoting a list should produce a quoted list.
    expect(run('quote', '«- one\n- two»')).toBe('«> - one\n> - two»')
  })

  it('does not format the line after a selection that ends at a line break', () => {
    const { doc } = parse('one\ntwo')
    // Selecting "one\n" — the offset is at the start of line two, but line two
    // is not part of what the user highlighted.
    expect(applyEdit(doc, markdownEdit('bulletList', doc, 0, 4))).toBe('- one\ntwo')
  })
})

describe('link', () => {
  it('wraps a selection and selects the URL, ready to paste', () => {
    expect(run('link', 'see «the docs» here')).toBe('see [the docs](«url») here')
  })

  it('inserts a placeholder and selects the label when nothing is selected', () => {
    expect(run('link', 'see |')).toBe('see [«link»](url)')
  })
})

describe('blocks', () => {
  it('inserts an empty code fence with the caret inside', () => {
    expect(run('codeBlock', '|')).toBe('```\n|\n```\n')
  })

  it('wraps a selection in a code fence', () => {
    expect(run('codeBlock', '«npm run dev»')).toBe('```\n«npm run dev»\n```\n')
  })

  it('separates a block from the paragraph above it', () => {
    // A fence glued to the previous line still parses, but a table would not
    // and a rule would turn the line above into a heading. One rule for all.
    expect(run('codeBlock', 'text|')).toBe('text\n\n```\n|\n```\n')
  })

  it('does not add a blank line that is already there', () => {
    // The caret lands at the end of what was inserted, which is the same rule
    // every block insert follows.
    expect(run('horizontalRule', 'text\n\n|')).toBe('text\n\n---|\n')
  })

  it('inserts a table with the first header cell selected', () => {
    expect(run('table', '|')).toBe(
      '| «Column 1» | Column 2 | Column 3 |\n| --- | --- | --- |\n|  |  |  |\n'
    )
  })

  it('inserts a table after a selection instead of replacing it', () => {
    const { doc, from, to } = parse('keep «this»')
    expect(applyEdit(doc, markdownEdit('table', doc, from, to))).toContain('keep this')
  })

  it('inserts a rule after a selection instead of replacing it', () => {
    const { doc, from, to } = parse('keep «this»')
    expect(applyEdit(doc, markdownEdit('horizontalRule', doc, from, to))).toBe('keep this\n\n---\n')
  })
})

describe('mermaid', () => {
  it('inserts a diagram that already renders', () => {
    const { doc, from, to } = parse('|')
    const result = applyEdit(doc, markdownEdit('mermaid', doc, from, to))

    expect(result).toContain('```mermaid')
    expect(result).toContain('flowchart TD')
    expect(result.trimEnd().endsWith('```')).toBe(true)
  })

  it('leaves the caret at the end of the diagram body, not after the fence', () => {
    const { doc, from, to } = parse('|')
    const edit = markdownEdit('mermaid', doc, from, to)
    const result = applyEdit(doc, edit)

    expect(result.slice(edit.anchor, edit.anchor + 4)).toBe('\n```')
  })

  it('turns a selection into the diagram body', () => {
    const { doc, from, to } = parse('«graph LR\n  A --> B»')
    expect(applyEdit(doc, markdownEdit('mermaid', doc, from, to))).toBe(
      '```mermaid\ngraph LR\n  A --> B\n```\n'
    )
  })
})
