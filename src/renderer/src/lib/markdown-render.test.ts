import { describe, expect, it } from 'vitest'
import { DIAGRAM_CLASS, escapeHtml, renderMarkdown } from './markdown-render'

/**
 * The security half of these tests is written as attacks, like
 * `assertValidId`'s. The bar is not "the output looks fine" but "no note,
 * however hostile, can put an executable construct into the preview" — the
 * preview shares a renderer with `window.api`, which can read and rewrite
 * every note on disk.
 *
 * Assertions inspect the **tags** in the output rather than searching the raw
 * string, because the two are very different claims. `&lt;img onerror=…&gt;`
 * contains the text "onerror=" and is completely inert; a substring search
 * cannot tell it apart from a real attribute, so it would fail on correct
 * output and pass on subtly wrong output.
 */

/** Every tag this renderer is ever allowed to produce. */
const ALLOWED_TAGS = new Set([
  'p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'strong', 'em', 'del', 'code', 'pre', 'blockquote',
  'ul', 'ol', 'li', 'input', 'a', 'img',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'div', 'span'
])

const DANGEROUS_SCHEME = /^(?:javascript|data|vbscript|file):/i

/**
 * Everything about the rendered HTML that would be a vulnerability, as a list
 * of descriptions — an empty list is the pass condition, and a failure names
 * exactly what got through.
 */
function unsafeParts(html: string): string[] {
  const problems: string[] = []

  for (const tag of html.match(/<[a-zA-Z][^>]*>/g) ?? []) {
    const name = (/^<([a-zA-Z][\w-]*)/.exec(tag)?.[1] ?? '').toLowerCase()
    if (!ALLOWED_TAGS.has(name)) problems.push(`disallowed tag <${name}>`)

    // Attribute *values* are blanked before looking for event handlers, so
    // text that merely says "onclick=" inside a title is not mistaken for one.
    const skeleton = tag.replace(/"[^"]*"/g, '""').replace(/'[^']*'/g, "''")
    if (/\son\w+\s*=/.test(skeleton)) problems.push(`event handler in ${tag}`)

    for (const match of tag.matchAll(/(?:href|src)="([^"]*)"/g)) {
      // The same normalisation a browser applies before reading the scheme.
      const url = match[1].replace(/[\t\n\r]/g, '').trim()
      if (DANGEROUS_SCHEME.test(url)) problems.push(`dangerous URL ${match[1]}`)
    }
  }

  return problems
}

describe('escapeHtml', () => {
  it('escapes every character that can break out of markup', () => {
    expect(escapeHtml(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&#39;')
  })

  it('escapes the ampersand first, so escapes are not double-escaped', () => {
    // Getting this order wrong turns `<` into `&amp;lt;`, which renders as the
    // literal text "&lt;" instead of "<".
    expect(escapeHtml('<')).toBe('&lt;')
    expect(escapeHtml('&lt;')).toBe('&amp;lt;')
  })
})

describe('raw HTML in a note', () => {
  it.each([
    ['a script tag', '<script>alert(1)</script>'],
    ['an image error handler', '<img src=x onerror=alert(1)>'],
    ['an SVG load handler', '<svg onload=alert(1)></svg>'],
    ['an iframe', '<iframe src="https://example.com"></iframe>'],
    ['an inline event handler', '<div onmouseover="alert(1)">hover</div>'],
    ['a style block', '<style>body{display:none}</style>'],
    ['a form posting elsewhere', '<form action="https://evil.test"><input name="a"></form>'],
    ['a base tag', '<base href="https://evil.test/">'],
    ['an object tag', '<object data="evil.swf"></object>'],
    ['a link tag pulling a stylesheet', '<link rel="stylesheet" href="https://evil.test/x.css">'],
    ['inline HTML mid-sentence', 'hello <script>alert(1)</script> world'],
    ['HTML inside a heading', '# Title <script>alert(1)</script>'],
    ['HTML inside a list item', '- item <img src=x onerror=alert(1)>'],
    ['HTML inside a blockquote', '> quoted <script>alert(1)</script>'],
    ['HTML inside a table cell', '| a |\n| --- |\n| <script>alert(1)</script> |'],
    ['a comment hiding a tag', '<!-- --><script>alert(1)</script>']
  ])('shows %s as text instead of running it', (_label, payload) => {
    const html = renderMarkdown(payload)

    expect(unsafeParts(html)).toEqual([])
    // Escaped, not deleted: the note still says what it says.
    expect(html).toContain('&lt;')
  })
})

describe('link URLs', () => {
  it.each([
    ['javascript', '[click](javascript:alert(1))'],
    ['mixed-case javascript', '[click](JaVaScRiPt:alert(1))'],
    ['javascript split by a newline', '[click](java\nscript:alert%281%29)'],
    ['a data URL', '[click](data:text/html,alert)'],
    ['vbscript', '[click](vbscript:msgbox(1))'],
    ['a local file', '[click](file:///C:/Windows/System32/calc.exe)'],
    ['a reference-style javascript link', '[click][ref]\n\n[ref]: javascript:alert(1)'],
    ['an autolinked javascript URL', '<javascript:alert(1)>']
  ])('refuses %s', (_label, payload) => {
    expect(unsafeParts(renderMarkdown(payload))).toEqual([])
  })

  it('keeps the text of a link it refused', () => {
    // Repaired, not rejected: the words are still readable, they just are not
    // a link any more.
    const html = renderMarkdown('[click here](javascript:alert(1))')
    expect(html).toContain('preview__refused')
    expect(html).toContain('click here')
  })

  it('renders ordinary links', () => {
    const html = renderMarkdown('[docs](https://example.com/page)')
    expect(html).toContain('href="https://example.com/page"')
    expect(html).toContain('>docs</a>')
  })

  it('keeps inline formatting inside a link label', () => {
    expect(renderMarkdown('[**bold** link](https://example.com)')).toContain('<strong>bold</strong>')
  })

  it('escapes a quote in a link title, so it cannot start a new attribute', () => {
    const html = renderMarkdown('[x](https://example.com "a\\" onmouseover=alert(1) b")')

    expect(unsafeParts(html)).toEqual([])
    // The quote survives as text inside the title rather than closing it.
    expect(html).toContain('title="a&quot; onmouseover=alert(1) b"')
  })

  it('leaves an entity-encoded scheme inert', () => {
    // `&#106;avascript:` is not a scheme until the browser decodes it. Escaping
    // the `&` on output means it never gets decoded into one.
    const html = renderMarkdown('[click](&#106;avascript:alert&#40;1&#41;)')

    expect(unsafeParts(html)).toEqual([])
    expect(html).toContain('&amp;#106;')
  })

  it('allows relative links and fragments', () => {
    expect(renderMarkdown('[up](#section)')).toContain('href="#section"')
    expect(renderMarkdown('[other](other-note.md)')).toContain('href="other-note.md"')
  })
})

describe('image URLs', () => {
  it.each([
    ['an SVG data URL', '![x](data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=)'],
    ['a javascript URL', '![x](javascript:alert(1))'],
    ['a local file', '![x](file:///C:/Windows/win.ini)']
  ])('refuses %s', (_label, payload) => {
    const html = renderMarkdown(payload)
    expect(unsafeParts(html)).toEqual([])
    expect(html).not.toContain('<img')
  })

  it('renders an ordinary image with escaped alt text', () => {
    const html = renderMarkdown('![a "quote"](https://example.com/x.png)')
    expect(html).toContain('src="https://example.com/x.png"')
    expect(html).toContain('alt="a &quot;quote&quot;"')
  })
})

describe('ordinary markdown', () => {
  it('renders the constructs the toolbar produces', () => {
    expect(renderMarkdown('# Title')).toContain('<h1>Title</h1>')
    expect(renderMarkdown('**bold**')).toContain('<strong>bold</strong>')
    expect(renderMarkdown('*italic*')).toContain('<em>italic</em>')
    expect(renderMarkdown('~~gone~~')).toContain('<del>gone</del>')
    expect(renderMarkdown('`code`')).toContain('<code>code</code>')
    expect(renderMarkdown('> quoted')).toContain('<blockquote>')
    expect(renderMarkdown('- one\n- two')).toContain('<ul>')
    expect(renderMarkdown('1. one\n2. two')).toContain('<ol>')
    expect(renderMarkdown('---')).toContain('<hr>')
  })

  it('renders a GFM table', () => {
    const html = renderMarkdown('| a | b |\n| --- | --- |\n| 1 | 2 |')
    expect(html).toContain('<table>')
    expect(html).toContain('<th>a</th>')
  })

  it('renders a task list as checkboxes', () => {
    const html = renderMarkdown('- [ ] todo\n- [x] done')
    expect(html).toContain('type="checkbox"')
    expect(html).toContain('checked')
  })

  it('does not turn a single newline into a line break', () => {
    // Standard markdown, matching VS Code and GitHub. A note has to look the
    // same wherever it is opened.
    expect(renderMarkdown('one\ntwo')).not.toContain('<br>')
  })

  it('escapes the contents of a code block', () => {
    const html = renderMarkdown('```\n<script>alert(1)</script>\n```')
    expect(unsafeParts(html)).toEqual([])
    expect(html).toContain('&lt;script&gt;')
  })

  it('labels a fenced block with its language', () => {
    expect(renderMarkdown('```ts\nconst x = 1\n```')).toContain('class="language-ts"')
  })

  it('ignores a language tag that is not a plain word', () => {
    // The language goes into a class attribute, so it must not be able to
    // close it. Escaping would be enough; refusing is simpler to be sure of.
    const html = renderMarkdown('```" onload="alert(1)\ncode\n```')
    expect(unsafeParts(html)).toEqual([])
    expect(html).not.toContain('class="language-')
  })
})

describe('mermaid blocks', () => {
  it('wraps a mermaid fence so the preview can find it', () => {
    const html = renderMarkdown('```mermaid\nflowchart TD\n  A --> B\n```')
    expect(html).toContain(DIAGRAM_CLASS)
    expect(html).toContain('flowchart TD')
  })

  it('escapes the diagram source', () => {
    // Mermaid source is attacker-controlled text like any other. It reaches
    // the DOM as text content and is only ever read back with `textContent`.
    const html = renderMarkdown('```mermaid\n</pre><script>alert(1)</script>\n```')

    expect(unsafeParts(html)).toEqual([])
    expect(html).toContain('&lt;/pre&gt;')
  })

  it('treats an uppercase language tag as mermaid too', () => {
    expect(renderMarkdown('```MERMAID\ngraph TD\n```')).toContain(DIAGRAM_CLASS)
  })

  it('leaves other fenced languages as ordinary code', () => {
    expect(renderMarkdown('```js\nalert(1)\n```')).not.toContain(DIAGRAM_CLASS)
  })
})

describe('renderMarkdown', () => {
  it('returns empty output for an empty note rather than failing', () => {
    expect(renderMarkdown('')).toBe('')
  })

  it('survives input that is nothing but punctuation', () => {
    expect(() => renderMarkdown('[](((*_~`#>|\\')).not.toThrow()
  })
})
