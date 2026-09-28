import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { DIAGRAM_DEBOUNCE_MS, PREVIEW_DEBOUNCE_MS } from '../../../shared/constants'
import { DIAGRAM_CLASS, DOC_CLASS, renderMarkdown } from '../lib/markdown-render'
import { cachedDiagram, renderDiagram, type DiagramResult, type DiagramTheme } from '../lib/mermaid'

interface PreviewProps {
  /** Live note text. Rendering is debounced, so this may arrive per keystroke. */
  source: string
}

/**
 * Which palette diagrams should use.
 *
 * `prefers-color-scheme` is the right signal even though the app has its own
 * theme setting: the main process applies that choice through
 * `nativeTheme.themeSource`, which is exactly what this media query reports.
 * One source of truth, and it updates live when the OS theme changes.
 */
function useDiagramTheme(): DiagramTheme {
  const query = '(prefers-color-scheme: dark)'
  const [theme, setTheme] = useState<DiagramTheme>(() =>
    window.matchMedia(query).matches ? 'dark' : 'light'
  )

  useEffect(() => {
    const media = window.matchMedia(query)
    const onChange = (event: MediaQueryListEvent): void => setTheme(event.matches ? 'dark' : 'light')
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  return theme
}

/** Diagram blocks in document order. */
function diagramsIn(host: HTMLElement): HTMLElement[] {
  return [...host.querySelectorAll<HTMLElement>(`.${DIAGRAM_CLASS}:not([data-rendered])`)]
}

function showDiagram(block: HTMLElement, result: DiagramResult): void {
  if ('svg' in result) {
    // mermaid produced this with `securityLevel: 'strict'`, which routes the
    // diagram's own labels through its bundled sanitizer.
    block.innerHTML = result.svg
    block.dataset.rendered = 'svg'
    return
  }

  // Failure keeps the source on screen — it is still the note's content, and
  // hiding it would leave a blank gap where the user's text used to be. The
  // message goes in via `textContent`, never innerHTML: it can quote the
  // source that failed to parse.
  const note = document.createElement('p')
  note.className = 'preview__diagram-error'
  note.textContent = result.error
  block.append(note)
  block.dataset.rendered = 'error'
}

/**
 * The rendered view of the current note.
 *
 * Markdown becomes HTML through `markdown-render.ts`, which is the module that
 * guarantees the result is inert; this component is only responsible for when
 * that happens and for turning ` ```mermaid ` blocks into pictures.
 *
 * Both of those are debounced, at different rates. Re-parsing markdown is
 * cheap, so it tracks typing closely; laying out a diagram is not, and a
 * diagram is usually mid-sentence and unparseable while you write it.
 */
export default function Preview({ source }: PreviewProps): React.JSX.Element {
  const host = useRef<HTMLDivElement>(null)
  const theme = useDiagramTheme()

  // Seeded rather than empty so opening the preview shows the note at once.
  // Only later changes wait for the debounce.
  const [html, setHtml] = useState(() => renderMarkdown(source))

  useEffect(() => {
    const timer = window.setTimeout(() => setHtml(renderMarkdown(source)), PREVIEW_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [source])

  /**
   * Writes the rendered markup, then puts back any diagram already drawn.
   *
   * The markup is applied here rather than with `dangerouslySetInnerHTML`
   * because React re-applies that property whenever the component re-renders,
   * even when the HTML string is unchanged — and an unrelated re-render is
   * routine here, since every autosave updates state in `App`. Each time it
   * did, the preview's entire contents were replaced with identical markup,
   * silently detaching the diagram elements this component was in the middle
   * of rendering into. Owning the write means the DOM changes exactly when
   * `html` does, and not once more.
   *
   * Restoring cached diagrams in the same layout effect is what stops them
   * blinking back to their source text and in again on every keystroke.
   */
  useLayoutEffect(() => {
    const container = host.current
    if (!container) return

    // Wrapped so the text column has a single element to be measured on — see
    // DOC_CLASS. `html` is inert by construction (markdown-render.ts), so
    // composing it into a string here adds no exposure.
    container.innerHTML = `<div class="${DOC_CLASS}">${html}</div>`

    for (const block of diagramsIn(container)) {
      const svg = cachedDiagram((block.textContent ?? '').trim(), theme)
      if (svg) {
        block.innerHTML = svg
        block.dataset.rendered = 'svg'
      }
    }
  }, [html, theme])

  /** Anything still unrendered is a diagram we have not seen before. */
  useEffect(() => {
    if (!host.current) return undefined

    // The sources, not the elements. Laying out a diagram is asynchronous, and
    // a node captured before an `await` is a node that may not be in the
    // document after it — so the element to write into is looked up again at
    // the point of writing, keyed by the source it belongs to.
    const sources = diagramsIn(host.current).map((block) => (block.textContent ?? '').trim())
    if (sources.length === 0) return undefined

    let cancelled = false
    const timer = window.setTimeout(() => {
      void (async () => {
        /*
         * One at a time, not `Promise.all`. Diagrams are laid out by a single
         * shared mermaid instance with one global config, so running them
         * concurrently buys nothing — and the pause between each is where the
         * cancellation check below gets to run, which is what stops a note
         * full of diagrams from blocking the preview when you switch away
         * mid-render.
         */
        for (const diagram of sources) {
          if (cancelled) return
          // eslint-disable-next-line no-await-in-loop
          const result = await renderDiagram(diagram, theme)
          if (cancelled || !host.current) return

          // First still-unrendered block with this source. Two identical
          // diagrams in one note therefore fill in one after the other, since
          // drawing one takes it out of the running.
          const target = diagramsIn(host.current).find(
            (block) => (block.textContent ?? '').trim() === diagram
          )
          if (target) showDiagram(target, result)
        }
      })()
    }, DIAGRAM_DEBOUNCE_MS)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [html, theme])

  /**
   * An image that does not load becomes its alt text.
   *
   * The app's Content-Security-Policy (see `index.html`) allows images only
   * from the app itself, so a note referencing `https://…/photo.png` renders
   * nothing. That is the intended behaviour — a remote image in a note file is
   * also a tracking pixel that would report to its host every time the note
   * was previewed — but a broken-image icon looks like a bug in the app rather
   * than a deliberate refusal, so say so instead.
   *
   * Listened for in the capture phase because `error` does not bubble.
   */
  useEffect(() => {
    const container = host.current
    if (!container) return undefined

    const onError = (event: Event): void => {
      const image = event.target
      if (!(image instanceof HTMLImageElement)) return

      const placeholder = document.createElement('span')
      placeholder.className = 'preview__refused'
      placeholder.title = 'Image not shown: only local images are loaded'
      placeholder.textContent = image.alt || 'image'
      image.replaceWith(placeholder)
    }

    container.addEventListener('error', onError, true)
    return () => container.removeEventListener('error', onError, true)
  }, [html])

  /**
   * Links open in the user's browser, never in the overlay.
   *
   * Following a link in place would replace the app with a web page and leave
   * no way back — there is no address bar and no Back button. The main process
   * refuses the navigation as well (see `window.ts`); this is the half that
   * makes the link actually work.
   */
  const onClick = useCallback((event: React.MouseEvent<HTMLDivElement>): void => {
    const link = (event.target as HTMLElement).closest('a')
    if (!link) return

    event.preventDefault()
    const href = link.getAttribute('href')
    // Refused by the main process unless it is http, https or mailto.
    if (href) void window.api.openExternal(href)
  }, [])

  if (source.trim().length === 0) {
    // Keyed so React builds a fresh element for each branch rather than
    // reusing one whose children this component writes by hand.
    return (
      <div className="preview preview--empty" key="empty">
        <p>Nothing to preview yet.</p>
      </div>
    )
  }

  // No children in the JSX: the layout effect above owns everything inside.
  return <div className="preview" key="rendered" ref={host} onClick={onClick} />
}
