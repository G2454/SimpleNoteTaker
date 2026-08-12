import { useEffect, useRef } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap, placeholder } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { syntaxHighlighting } from '@codemirror/language'
import { editorTheme, markdownHighlightStyle } from '../lib/editor-theme'

interface EditorProps {
  /** Identity of the note being edited. Changing it rebuilds the editor. */
  noteId: string
  /** Content at mount. Deliberately not kept in sync afterwards — see below. */
  initialDoc: string
  /** Bumped by the parent to request focus (e.g. when the overlay is summoned). */
  focusSignal: number
  onChange: (value: string) => void
}

/**
 * React wrapper around CodeMirror 6.
 *
 * The two libraries disagree about who owns the DOM, so the contract here is:
 * React owns the host `<div>` and never re-renders it; CodeMirror owns
 * everything inside.
 *
 * The editor is therefore **uncontrolled**. Feeding every keystroke back in as
 * a prop would fight CodeMirror's own state — losing cursor position, undo
 * history, and text selection on each render. Instead the document is seeded
 * once at mount and changes flow one way, outward, via `onChange`.
 */
export default function Editor({
  noteId,
  initialDoc,
  focusSignal,
  onChange
}: EditorProps): React.JSX.Element {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)

  // Held in a ref so a changing `onChange` identity doesn't tear down and
  // rebuild the editor — that would discard undo history on every parent render.
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    if (!host.current) return undefined

    const instance = new EditorView({
      state: EditorState.create({
        doc: initialDoc,
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          markdown(),
          syntaxHighlighting(markdownHighlightStyle),
          editorTheme,
          // Prose, not code: wrap instead of scrolling sideways.
          EditorView.lineWrapping,
          placeholder('Start writing…'),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChangeRef.current(update.state.doc.toString())
          })
        ]
      }),
      parent: host.current
    })

    view.current = instance
    instance.focus() // typing should work the instant a note opens (BR-4)

    return () => {
      instance.destroy()
      view.current = null
    }
    // `initialDoc` is intentionally excluded: it seeds the document and must not
    // rebuild the editor when it changes. Switching notes changes `noteId`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId])

  // Refocus on summon. The React tree stays mounted while the OS window is
  // hidden, so there's no remount to rely on.
  useEffect(() => {
    view.current?.focus()
  }, [focusSignal])

  return <div className="editor" ref={host} />
}
