import type { NoteMeta } from '../shared/types'

/**
 * The pure half of note storage: logic with no filesystem and no Electron.
 *
 * Split out from `notes.ts` for one concrete reason — `notes.ts` imports
 * `electron` at module scope, and `electron` cannot be imported outside a real
 * Electron runtime. Any test touching it would have to mock the module before
 * it could assert on a string function.
 *
 * Everything here is deterministic and takes plain arguments, so it can be
 * tested directly. That matters most for `assertValidId`, which is a security
 * control rather than a convenience.
 */

/**
 * Derives a display title from the note body.
 *
 * Deliberately not stored anywhere: the markdown file is the single source of
 * truth (BR-7), so a title kept alongside it could drift out of sync when the
 * file is edited outside Note Taker.
 */
export function deriveTitle(content: string): string {
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim()
    if (!line) continue
    // Only strips a real ATX heading: 1–6 hashes *followed by whitespace*.
    // `#hashtag` is text, not a heading, and keeps its hash.
    return line.replace(/^#{1,6}\s+/, '').slice(0, 80)
  }
  return 'Untitled'
}

/**
 * The single most important function in this file.
 *
 * IDs arrive from the renderer, and the renderer is a web page rendering
 * arbitrary note content. An id of `../../../../Windows/System32/config` would
 * otherwise let it read or overwrite anything the user can. Allowing only
 * `[a-z0-9-]` makes path traversal unrepresentable rather than merely filtered:
 * there is no separator, no dot, and no drive letter in the alphabet.
 */
export function assertValidId(id: string): void {
  if (!/^[a-z0-9-]{1,64}$/.test(id)) {
    throw new Error(`Invalid note id: ${JSON.stringify(id)}`)
  }
}

/**
 * Most recently edited first — for a capture tool, recency is the only
 * ordering anyone actually wants.
 */
export function byRecency(a: NoteMeta, b: NoteMeta): number {
  return b.updatedAt - a.updatedAt
}
