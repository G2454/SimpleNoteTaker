import { DEFAULT_NOTE_NAME, MAX_NOTE_NAME_LENGTH, MAX_TITLE_LENGTH } from '../shared/constants'

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
    return line.replace(/^#{1,6}\s+/, '').slice(0, MAX_TITLE_LENGTH)
  }
  return DEFAULT_NOTE_NAME
}

/**
 * Path separators, the characters Windows forbids in filenames, and control
 * characters (which include the NUL byte used to truncate paths in C APIs).
 *
 * `:` is here for two reasons on Windows: drive letters, and NTFS alternate
 * data streams (`note.md:hidden`), which would write a payload invisible to
 * every ordinary directory listing.
 */
// Deliberate: NUL and the other control characters must never reach a
// filename, so matching them here is the entire point of the rule.
// oxlint-disable-next-line no-control-regex
const FORBIDDEN_CHARACTERS = /[\u0000-\u001f<>:"|?*/\\]/

/** The same class, global, for `replace` — a non-global regex only replaces the first match. */
const FORBIDDEN_CHARACTERS_GLOBAL = new RegExp(FORBIDDEN_CHARACTERS.source, 'g')

/**
 * Reserved device names on Windows — `CON`, `PRN`, `AUX`, `NUL`, `COM0`-`COM9`,
 * `LPT0`-`LPT9`, with or without an extension. Opening one of these addresses a
 * device rather than a file, so writing to `NUL.md` silently discards the note
 * and reading `CON.md` can block forever waiting on console input.
 */
const RESERVED_DEVICE_NAME = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i

/**
 * The boundary between a renderer that displays arbitrary text and the user's
 * filesystem. Every path this app builds passes through here first.
 *
 * Note names are now user-chosen (BR-3: the file on disk should be the note you
 * recognise), so the old `[a-z0-9-]` allow-list is gone — it could not express
 * `Meeting notes.md`. What replaces it is a deny-list of everything that could
 * escape the notes folder or address something other than a plain file:
 *
 *   - path separators, so a name can never describe a location
 *   - `..`, and any leading dot, so it can neither traverse up nor hide
 *   - Windows-forbidden characters, including `:` for drives and NTFS streams
 *   - control characters, including NUL
 *   - reserved device names
 *   - leading/trailing whitespace and trailing dots, which Windows silently
 *     strips — the file you opened would not be the file you named
 *
 * `notes.ts` additionally verifies the resolved path is still inside the notes
 * directory. That check is the real guarantee; this one is the readable one.
 */
export function assertValidId(id: string): void {
  const reject = (): never => {
    // Quoted via JSON.stringify so an id containing whitespace or control
    // characters is still legible in a log.
    throw new Error(`Invalid note id: ${JSON.stringify(id)}`)
  }

  if (typeof id !== 'string') reject()
  if (id.length === 0 || id.length > MAX_NOTE_NAME_LENGTH) reject()
  if (FORBIDDEN_CHARACTERS.test(id)) reject()
  // Covers `.`, `..` and dotfiles in one rule.
  if (id.startsWith('.')) reject()
  if (id.endsWith('.')) reject()
  // Any leading or trailing whitespace, not just spaces.
  if (id !== id.trim()) reject()
  if (RESERVED_DEVICE_NAME.test(id)) reject()
}

/**
 * Turns whatever the user typed into a name that is guaranteed to satisfy
 * `assertValidId`.
 *
 * Repairs rather than rejects: someone typing `Q3: plan` means a note called
 * "Q3 plan", and an error message would just make them do the edit by hand.
 * The hard validation still runs afterwards — this only reduces how often a
 * legitimate name trips it.
 */
export function sanitizeNoteName(raw: string): string {
  let name = raw
    .replace(FORBIDDEN_CHARACTERS_GLOBAL, ' ')
    // Collapse runs of whitespace so "a    b" doesn't become a wide filename.
    .replace(/\s+/g, ' ')
    // Strip leading dots and spaces *together*, in one pass.
    //
    // Doing these separately is a trap: "../../etc/passwd" becomes
    // ".. .. etc passwd" once separators are blanked, and removing only the
    // first run of dots leaves a second run behind once the space is trimmed —
    // producing a name that still starts with "..".
    .replace(/^[.\s]+/, '')
    .replace(/[.\s]+$/, '')
    .slice(0, MAX_NOTE_NAME_LENGTH)
    // Truncation can re-expose a trailing dot or space.
    .replace(/[.\s]+$/, '')

  if (RESERVED_DEVICE_NAME.test(name)) name = `${name}_`
  return name.length > 0 ? name : DEFAULT_NOTE_NAME
}

/**
 * First free name in the series `base`, `base 2`, `base 3`, …
 *
 * Comparison is case-insensitive because Windows and macOS filesystems are:
 * treating `Notes` and `notes` as different would produce two ids that silently
 * address the same file, and the second write would clobber the first.
 */
export function nextAvailableName(base: string, taken: Iterable<string>): string {
  const used = new Set([...taken].map((name) => name.toLowerCase()))
  if (!used.has(base.toLowerCase())) return base

  for (let suffix = 2; ; suffix++) {
    const tail = ` ${suffix}`
    // Keep room for the suffix rather than letting the result exceed the limit.
    const trimmed = base.slice(0, MAX_NOTE_NAME_LENGTH - tail.length).trimEnd()
    const candidate = `${trimmed}${tail}`
    if (!used.has(candidate.toLowerCase())) return candidate
  }
}
