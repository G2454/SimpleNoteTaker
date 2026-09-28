import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import Editor, { type EditorHandle } from './components/Editor'
import NoteList from './components/NoteList'
import Preview from './components/Preview'
import Settings from './components/Settings'
import Toolbar from './components/Toolbar'
import { useNotes, type SaveState } from './lib/useNotes'
import { useSettings } from './lib/useSettings'
import { nextViewMode, showsEditor, showsPreview, type ViewMode } from './lib/view-mode'

type View = 'editor' | 'settings'

function SaveIndicator({ state }: { state: SaveState }): React.JSX.Element | null {
  // 'pending' is deliberately silent. A spinner on every keystroke would nag,
  // and the user has no decision to make while it saves.
  if (state !== 'saved') return null
  return <span className="save-indicator">Saved</span>
}

/**
 * The note's name, editable in place.
 *
 * The name is the filename, so committing this renames a file on disk. It is
 * therefore only applied on Enter or blur, never per keystroke — otherwise
 * typing "Report" would rename the file six times and leave "R.md", "Re.md"
 * and friends behind.
 */
function NoteNameField({
  id,
  onRename,
  inputRef
}: {
  id: string
  onRename: (id: string, name: string) => Promise<unknown>
  inputRef: React.RefObject<HTMLInputElement | null>
}): React.JSX.Element {
  const [draft, setDraft] = useState(id)

  // Re-seed when the note changes, or when a rename resolved to a different
  // name than requested (a numeric suffix because the name was taken).
  useEffect(() => setDraft(id), [id])

  const commit = useCallback((): void => {
    const next = draft.trim()
    if (!next || next === id) {
      setDraft(id) // reject empty, and normalise whitespace-only edits
      return
    }
    void onRename(id, next)
  }, [draft, id, onRename])

  return (
    <input
      ref={inputRef}
      className="note-name"
      value={draft}
      spellCheck={false}
      aria-label="Note name"
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        // Both keys are handled globally too; stop them here so renaming can't
        // also dismiss the overlay or clear the search.
        if (event.key === 'Enter') {
          event.stopPropagation()
          event.currentTarget.blur()
        } else if (event.key === 'Escape') {
          event.stopPropagation()
          setDraft(id)
          event.currentTarget.blur()
        }
      }}
    />
  )
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
    renameNote,
    flush
  } = useNotes()

  const { settings, error, update, chooseFolder } = useSettings()

  const [view, setView] = useState<View>('editor')

  /**
   * Editor, preview, or both.
   *
   * Session state rather than a saved setting, on purpose: the window is never
   * destroyed while the app runs (BR-1), so this already survives every
   * dismiss and summon. Writing it to disk would only change what happens
   * after a reboot, and "opens ready to type" is the right answer there.
   */
  const [mode, setMode] = useState<ViewMode>('edit')
  const editorRef = useRef<EditorHandle>(null)

  /**
   * Incremented whenever the overlay is summoned.
   *
   * The React tree is never unmounted — the main process only hides the OS
   * window — so there is no natural mount event. Used as a `key` it replays the
   * entrance animation, and passed to the editor it restores focus.
   */
  const [summonCount, setSummonCount] = useState(0)
  const searchRef = useRef<HTMLInputElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    return window.api.onShown(() => setSummonCount((n) => n + 1))
  }, [])

  useEffect(() => {
    return window.api.onOpenSettings(() => setView('settings'))
  }, [])

  /** Always persist before the overlay goes away (BR-6). */
  const dismiss = useCallback(async () => {
    await flush()
    window.api.hide()
  }, [flush])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const mod = event.ctrlKey || event.metaKey

      if (mod && event.key === ',') {
        event.preventDefault()
        setView((current) => (current === 'settings' ? 'editor' : 'settings'))
        return
      }

      if (mod && event.key === 'n') {
        event.preventDefault()
        setView('editor')
        void createNote()
        return
      }

      if (mod && event.key === 'k') {
        event.preventDefault()
        setView('editor')
        searchRef.current?.select()
        return
      }

      if (mod && event.key === 'e') {
        event.preventDefault()
        setView('editor')
        setMode(nextViewMode)
        return
      }

      if (event.key === 'F2') {
        event.preventDefault()
        setView('editor')
        // Select rather than focus: renaming usually means replacing the name,
        // not appending to it.
        nameRef.current?.select()
        return
      }

      if (event.key === 'Escape') {
        event.preventDefault()
        // Escape unwinds one layer at a time, and only dismisses when there is
        // nothing left to back out of. Otherwise the options screen or a
        // filtered list would be waiting the next time you opened the app.
        if (view === 'settings') {
          setView('editor')
          return
        }
        if (query) {
          setQuery('')
          return
        }
        void dismiss()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [createNote, dismiss, query, setQuery, view])

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
        onOpen={(id) => {
          setView('editor')
          void openNote(id)
        }}
        onDelete={(id) => void deleteNote(id)}
        onCreate={() => {
          setView('editor')
          void createNote()
        }}
        onOpenSettings={() => setView('settings')}
        searchRef={searchRef}
      />

      {view === 'settings' ? (
        <Settings
          settings={settings}
          error={error}
          onUpdate={update}
          onChooseFolder={chooseFolder}
          onClose={() => setView('editor')}
        />
      ) : (
        <main className="main">
          <header className="titlebar">
            {activeId ? (
              <NoteNameField id={activeId} onRename={renameNote} inputRef={nameRef} />
            ) : (
              <span className="titlebar__title">Note Taker</span>
            )}
            <span className="titlebar__status">
              <SaveIndicator state={saveState} />
              <kbd>Esc</kbd>
            </span>
          </header>

          <Toolbar
            mode={mode}
            onModeChange={setMode}
            onAction={(action) => editorRef.current?.run(action)}
          />

          {/*
            `key={activeId}` remounts the editor when the note changes, which is
            how CodeMirror gets a fresh document without us fighting its internal
            state. Waiting for `loading` guarantees the content is present before
            the editor seeds itself from it.

            A rename also changes `activeId`, so it remounts too — the text is
            preserved (it lives in `content`) but undo history resets. Acceptable
            for an action the user takes deliberately and rarely.
          */}
          <div className={`workspace workspace--${mode}`}>
            {!loading && activeId && (
              <Editor
                key={activeId}
                ref={editorRef}
                noteId={activeId}
                initialDoc={content}
                focusSignal={summonCount}
                /*
                  Hidden with CSS rather than unmounted. Taking the editor out
                  of the tree to read a note would throw away its undo history
                  and scroll position, so switching to preview and back would
                  quietly cost you your last few edits' worth of undo.
                */
                hidden={!showsEditor(mode)}
                onChange={changeContent}
              />
            )}

            {/*
              The preview, in contrast, *is* unmounted when it is not shown: it
              holds nothing worth preserving, and not rendering it means notes
              you never preview cost nothing at all — including never loading
              mermaid.
            */}
            {showsPreview(mode) && !loading && activeId && (
              <Preview key={activeId} source={content} />
            )}
          </div>
        </main>
      )}
    </motion.div>
  )
}
