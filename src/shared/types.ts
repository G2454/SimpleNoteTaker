/** Shape of the data crossing the IPC boundary. Imported by both processes. */

/** Enough to render a note in the list without loading its body. */
export interface NoteMeta {
  /** Filename without the `.md` extension. Also the note's identity. */
  id: string
  /** Derived from the content — first heading, else first non-empty line. */
  title: string
  /** Unix ms, from the file's mtime. */
  updatedAt: number
}

export interface Note extends NoteMeta {
  content: string
}
