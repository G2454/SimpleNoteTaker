/**
 * URL safety, shared by the renderer (which decides what to *render* as a link)
 * and the main process (which decides what to *open*).
 *
 * It lives in `shared` because the two sides must agree. A renderer-only check
 * would be worth nothing — the renderer is the side that gets compromised — and
 * a main-only check would silently produce dead links in the preview.
 */

/**
 * Schemes a note may link to.
 *
 * Deliberately short. `javascript:` is the obvious attack, but `data:` is the
 * subtle one: `data:text/html,<script>…</script>` is a same-origin page, and
 * `data:image/svg+xml` can carry script inside an `<img>`. Neither is worth
 * supporting in a notes app, so the allowlist is stated positively — anything
 * not named here is refused, including schemes invented after this was written.
 */
export const SAFE_URL_SCHEMES: readonly string[] = ['http', 'https', 'mailto']

/**
 * Applies the same cleanup a browser's URL parser does, *before* we inspect the
 * scheme.
 *
 * This is the whole trick. A browser strips tab, LF and CR from a URL and trims
 * leading/trailing control characters, so `java\nscript:alert(1)` becomes
 * `javascript:alert(1)` **after** our check would have seen a harmless-looking
 * relative path. Normalising first means we test the string the browser will
 * actually act on, not the one the note happens to contain.
 */
export function normalizeUrl(raw: string): string {
  return (
    raw
      // Removed outright by the URL parser, anywhere in the string.
      .replace(/[\t\n\r]/g, '')
      /*
       * Trimmed from both ends: C0 controls, space, and DEL.
       *
       * `no-control-regex` is suppressed rather than satisfied. That rule
       * exists to catch control characters that reached a pattern by
       * accident; here they are the entire subject — the characters a
       * browser silently strips are exactly the ones a scheme can hide
       * behind — so the pattern has to name them.
       */
      // eslint-disable-next-line no-control-regex
      .replace(/^[\u0000-\u0020\u007f]+/, '')
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0020\u007f]+$/, '')
  )
}

/**
 * The URL's scheme in lower case, or null when it has none (relative paths,
 * fragments and protocol-relative URLs all land here).
 *
 * The character class is the one from the URL spec: a scheme starts with a
 * letter and continues with letters, digits, `+`, `-` and `.`. Anything else
 * before the first colon means there is no scheme, which is exactly how the
 * browser will read it too.
 */
export function urlScheme(raw: string): string | null {
  const match = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(normalizeUrl(raw))
  return match ? match[1].toLowerCase() : null
}

/**
 * May this URL be rendered as a link or an image in the preview?
 *
 * Relative URLs and fragments are allowed: they cannot execute anything, and
 * refusing them would break in-note anchors. Note that a relative URL resolves
 * against the app's own page, not the notes folder, so a link to a sibling file
 * will not resolve — see DOCUMENTATION.md §2.7.
 */
export function isRenderableUrl(raw: string): boolean {
  const scheme = urlScheme(raw)
  return scheme === null || SAFE_URL_SCHEMES.includes(scheme)
}

/**
 * May this URL be handed to the operating system?
 *
 * Stricter than `isRenderableUrl`: a relative URL is safe to *print* but
 * meaningless to *launch*, and `shell.openExternal` on an unexpected scheme is
 * how an app ends up starting programs on the user's behalf. An explicit,
 * allowed scheme is required.
 */
export function isExternallyOpenable(raw: string): boolean {
  const scheme = urlScheme(raw)
  return scheme !== null && SAFE_URL_SCHEMES.includes(scheme)
}
