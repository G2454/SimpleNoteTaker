import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import Editor from './components/Editor'
import NoteList from './components/NoteList'
import { useNotes, type SaveState } from './lib/useNotes'

function SaveIndicator({ state }: { state: SaveState }): React.JSX.Element | null {
  // 'pending' is deliberately silent. A spinner on every keystroke would nag,
  // and the user has no decision to make while it saves.
  if (state !== 'saved') return null
  return <span className="save-indicator">Saved</span>
}

export default function App(): React.JSX.Element {
  const {
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
  } = useNotes()

  /**
   * Incremented whenever the overlay is summoned.
   *
   * The React tree is never unmounted — the main process only hides the OS
   * window — so there is no natural mount event. Used as a `key` it replays the
   * entrance animation, and passed to the editor it restores focus.
   */
  const [summonCount, setSummonCount] = useState(0)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    return window.api.onShown(() => setSummonCount((n) => n + 1))
  }, [])

  /** Always persist before the overlay goes away (BR-6). */
  const dismiss = useCallback(async () => {
    await flush()
    window.api.hide()
  }, [flush])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const mod = event.ctrlKey || event.metaKey

      if (mod && event.key === 'n') {
        event.preventDefault()
        void createNote()
        return
      }

      if (mod && event.key === 'k') {
        event.preventDefault()
        searchRef.current?.select()
        return
      }

      if (event.key === 'Escape') {
        event.preventDefault()
        // Escape is contextual: clear the search first, dismiss only if there's
        // nothing to back out of. Otherwise a filtered list would be waiting the
        // next time you opened the app.
        if (query) {
          setQuery('')
          return
        }
        void dismiss()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [createNote, dismiss, query, setQuery])

  return (
    <motion.div
      key={summonCount}
      className="panel"
      initial={{ opacity: 0, scale: 0.96, y: -8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      /*
       * Spring physics rather than a duration and easing curve. A spring is
       * described by stiffness and resistance, so it settles naturally instead
       * of stopping dead — which is most of what reads as "Apple-like".
       * Just short of critically damped: fast, with a trace of overshoot.
       */
      transition={{ type: 'spring', stiffness: 420, damping: 32, mass: 0.9 }}
    >
      <NoteList
        notes={notes}
        activeId={activeId}
        query={query}
        onQueryChange={setQuery}
        onOpen={(id) => void openNote(id)}
        onDelete={(id) => void deleteNote(id)}
        onCreate={() => void createNote()}
        searchRef={searchRef}
      />

      <main className="main">
        <header className="titlebar">
          <span className="titlebar__title">Note Taker</span>
          <span className="titlebar__status">
            <SaveIndicator state={saveState} />
            <kbd>Esc</kbd>
          </span>
        </header>

        {/*
          `key={activeId}` remounts the editor when the note changes, which is
          how CodeMirror gets a fresh document without us fighting its internal
          state. Waiting for `loading` guarantees the content is present before
          the editor seeds itself from it.
        */}
        {!loading && activeId && (
          <Editor
            key={activeId}
            noteId={activeId}
            initialDoc={content}
            focusSignal={summonCount}
            onChange={changeContent}
          />
        )}
      </main>
    </motion.div>
  )
}
