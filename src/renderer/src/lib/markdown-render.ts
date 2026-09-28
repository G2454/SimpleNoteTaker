import { Marked, type RendererObject } from 'marked'
import { isRenderableUrl, normalizeUrl } from '../../../shared/urls'

/**
 * Markdown → HTML for the preview pane.
 *
 * ## Why this file is careful
 *
 * The preview puts the result of parsing a note into the DOM of a renderer
 * that holds `window.api` — the capability to read, rewrite and delete every
 * note on disk. `marked` emits raw HTML by design, so `<script>` in a note
 * would otherwise run with that capability. Notes are plain `.md` files, so
 * their content is not necessarily something the user typed: it can arrive
 * from a synced folder, a template, or a file downloaded from the web.
 *
 * ## The approach: don't sanitize, don't emit
 *
 * The usual fix is to render everything and then clean it up with a sanitizer.
 * This does the opposite and never produces dangerous HTML in the first place,
 * which removes a whole class of "the sanitizer and the browser disagreed"
 * bugs — and needs no new dependency (ROADMAP.md §5).
 *
 * There are exactly two ways attacker-controlled text reaches the output:
 *
 * 1. **Raw HTML.** `renderer.html` escapes it instead of passing it through,
 *    so `<script>` renders as visible text. Everything else `marked` emits is
 *    built from a fixed set of tags with escaped contents.
 * 2. **URLs**, in links and images. Checked against the allowlist in
 *    `shared/urls.ts` and escaped on the way out. Escaping `&` is what defeats
 *    the entity-encoded variants: `&#106;avascript:` written into an attribute
 *    as `&amp;#106;avascript:` is decoded once, to a literal that is not a
 *    scheme, and never to `j`.
 *
 * Markdown that would have produced a link is *repaired* rather than dropped
 * — the text still appears, just not as a link — which matches how the rest of
 * the app treats bad input (ROADMAP.md §1).
 */

/** Wrapper for a ` ```mermaid ` block, found by `Preview` and replaced with SVG. */
export const DIAGRAM_CLASS = 'preview__diagram'

/**
 * Wrapper around the whole rendered note.
 *
 * It exists so the text column can be capped and centred in one place. `ch`
 * resolves against the font size of the element it is written on, so a measure
 * set per-block would give every heading a wider column than the prose under it.
 */
export const DOC_CLASS = 'preview__doc'

/**
 * The five characters that can break out of HTML text or an attribute value.
 *
 * `&` must be first: escaping it after the others would rewrite the `&` in the
 * replacements themselves and turn `&lt;` into `&amp;lt;`.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** A language tag is written into a class attribute, so keep it to a word. */
function codeLanguage(lang: string | undefined): string {
  const first = (lang ?? '').trim().split(/\s+/)[0] ?? ''
  return /^[\w+-]{1,32}$/.test(first) ? first.toLowerCase() : ''
}

const renderer: RendererObject = {
  /**
   * Raw HTML, inline and block alike, shown as text.
   *
   * This single override is what closes the XSS hole. It is deliberately not
   * configurable: a note that wants a table has markdown for one.
   */
  html({ text }) {
    return escapeHtml(text)
  },

  code({ text, lang, escaped }) {
    const body = escaped ? text : escapeHtml(text)
    const language = codeLanguage(lang)

    if (language === 'mermaid') {
      // The source is kept as the element's text content rather than an
      // attribute: it needs no second round of escaping, it is what
      // `textContent` hands back verbatim, and until the diagram renders it
      // reads as an ordinary code block instead of a blank space.
      return `<div class="${DIAGRAM_CLASS}"><pre class="${DIAGRAM_CLASS}-source"><code>${body}</code></pre></div>`
    }

    const className = language ? ` class="language-${language}"` : ''
    return `<pre class="preview__code"><code${className}>${body}</code></pre>`
  },

  link({ href, title, tokens }) {
    const label = this.parser.parseInline(tokens)

    if (!isRenderableUrl(href)) {
      return `<span class="preview__refused" title="Link removed: unsupported URL scheme">${label}</span>`
    }

    const titleAttr = title ? ` title="${escapeHtml(title)}"` : ''
    // `rel` is belt and braces — clicks are intercepted and handed to the OS
    // browser, and the main process refuses to navigate the window anyway.
    return `<a href="${escapeHtml(normalizeUrl(href))}"${titleAttr} rel="noreferrer noopener">${label}</a>`
  },

  image({ href, title, text }) {
    if (!isRenderableUrl(href)) {
      return `<span class="preview__refused" title="Image removed: unsupported URL scheme">${escapeHtml(text)}</span>`
    }

    const titleAttr = title ? ` title="${escapeHtml(title)}"` : ''
    return `<img src="${escapeHtml(normalizeUrl(href))}" alt="${escapeHtml(text)}"${titleAttr}>`
  }
}

/**
 * A private instance rather than the global `marked`.
 *
 * `marked.use()` mutates module-level state, so a second caller anywhere in
 * the app — now or later — could quietly remove the overrides above. Those
 * overrides are a security boundary, so they are not left where something else
 * can reach them.
 */
const parser = new Marked({
  gfm: true,
  // Standard markdown: a single newline is not a line break. This matches
  // VS Code's preview and GitHub's rendering of `.md` files, which is the
  // point — a note should look the same wherever it is opened (BR-7).
  breaks: false
})

parser.use({ renderer })

/** Renders a note. Never throws: a broken note should not blank the pane. */
export function renderMarkdown(source: string): string {
  try {
    return parser.parse(source, { async: false })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return `<p class="preview__refused">This note could not be rendered: ${escapeHtml(message)}</p>`
  }
}
