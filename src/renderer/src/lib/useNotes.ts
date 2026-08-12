import { useCallback, useEffect, useRef, useState } from 'react'
import { AUTOSAVE_DEBOUNCE_MS } from '../../../shared/constants'
import type { NoteMeta } from '../../../shared/types'

export type SaveState = 'idle' | 'pending' | 'saved'

/**
 * All note state for the app: the list, the open note, and autosave.
 *
 * Kept in one hook because these three things are genuinely coupled — saving
 * updates the list's titles and ordering — and splitting them would just mean
 * synchronising them from the outside.
 */
export function useNotes() {
  const [notes, setNotes] = useState<NoteMeta[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [query, setQuery] = useState('')
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [loading, setLoading] = useState(true)

  const saveTimer = useRef<number | undefined>(undefined)
  /** Latest unsaved text, so a flush can write without waiting for a render. */
  const pending = useRef<{ id: string; content: string } | null>(null)

  /** Applies a save result to the list: updated title, then re-sort by recency. */
  const applyMeta = useCallback((meta: NoteMeta) => {
    setNotes((prev) =>
      prev
        .map((note) => (note.id === meta.id ? meta : note))
        .sort((a, b) => b.updatedAt - a.updatedAt)
    )
  }, [])

  /** Writes immediately, cancelling any pending debounce. */
  const flush = useCallback(async () => {
    window.clearTimeout(saveTimer.current)
    const outstanding = pending.current
    if (!outstanding) return

    pending.current = null
    applyMeta(await window.api.notes.write(outstanding.id, outstanding.content))
    setSaveState('saved')
  }, [applyMeta])

  /**
   * Debounced autosave (BR-6). Saving on every keystroke would mean a disk write
   * per character; saving only on close risks losing work if the process dies.
   * A short pause in typing is the natural commit point.
   */
  const changeContent = useCallback(
    (value: string) => {
      setContent(value)
      if (!activeId) return

      pending.current = { id: activeId, content: value }
      setSaveState('pending')

      window.clearTimeout(saveTimer.current)
      saveTimer.current = window.setTimeout(() => void flush(), AUTOSAVE_DEBOUNCE_MS)
    },
    [activeId, flush]
  )

  const openNote = useCallback(
    async (id: string) => {
      // Never switch away with unsaved text still buffered.
      await flush()
      const note = await window.api.notes.read(id)
      setActiveId(note.id)
      setContent(note.content)
      setSaveState('idle')
    },
    [flush]
  )

  const createNote = useCallback(async () => {
    await flush()
    const note = await window.api.notes.create()
    setNotes((prev) => [note, ...prev])
    setActiveId(note.id)
    setContent('')
    setSaveState('idle')
  }, [flush])

  const deleteNote = useCallback(
    async (id: string) => {
      window.clearTimeout(saveTimer.current)
      if (pending.current?.id === id) pending.current = null

      await window.api.notes.remove(id)

      const remaining = notes.filter((note) => note.id !== id)
      setNotes(remaining)

      // Deleting the open note has to leave *something* open.
      if (id !== activeId) return
      if (remaining.length > 0) {
        await openNote(remaining[0].id)
      } else {
        await createNote()
      }
    },
    [notes, activeId, openNote, createNote]
  )

  /** First load: open the most recent note, or create one if there are none. */
  useEffect(() => {
    void (async () => {
      const list = await window.api.notes.list()
      if (list.length === 0) {
        const note = await window.api.notes.create()
        setNotes([note])
        setActiveId(note.id)
        setContent('')
      } else {
        setNotes(list)
        const note = await window.api.notes.read(list[0].id)
        setActiveId(note.id)
        setContent(note.content)
      }
      setLoading(false)
    })()
  }, [])

  /**
   * Re-runs the search when the query changes.
   *
   * Gated on `loading` deliberately: without it, this effect races the initial
   * load above. Both write `notes`, and on a first run with no notes yet the
   * search could resolve after the freshly created note was stored and
   * overwrite it with an empty list.
   */
  useEffect(() => {
    if (loading) return undefined

    let cancelled = false
    const timer = window.setTimeout(() => {
      void window.api.notes.search(query).then((results) => {
        // Responses can arrive out of order; only the newest query wins.
        if (!cancelled) setNotes(results)
      })
    }, 120)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [query, loading])

  /** Don't leave a timer holding unsaved text if the tree ever unmounts. */
  useEffect(() => {
    return () => window.clearTimeout(saveTimer.current)
  }, [])

  return {
    notes,
    activeId,
    content,
    query,
    saveState,
    loading,
    setQuery,
    changeContent,
    openNote,
    createNote,
    deleteNote,
    flush
  }
}
