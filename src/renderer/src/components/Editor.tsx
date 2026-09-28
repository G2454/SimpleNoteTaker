import { useEffect, useImperativeHandle, useRef } from 'react'
import { EditorState, Prec } from '@codemirror/state'
import { EditorView, keymap, placeholder } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { syntaxHighlighting } from '@codemirror/language'
import { editorTheme, markdownHighlightStyle } from '../lib/editor-theme'
import { markdownEdit, type MarkdownAction } from '../lib/markdown-actions'

/** What the toolbar can ask the editor to do. */
export interface EditorHandle {
  run: (action: MarkdownAction) => void
  focus: () => void
}

interface EditorProps {
  /** Identity of the note being edited. Changing it rebuilds the editor. */
  noteId: string
  /** Content at mount. Deliberately not kept in sync afterwards — see below. */
  initialDoc: string
  /** Bumped by the parent to request focus (e.g. when the overlay is summoned). */
  focusSignal: number
  /** True while the preview has the workspace to itself. */
  hidden: boolean
  onChange: (value: string) => void
  ref?: React.Ref<EditorHandle>
}

/**
 * Turns a toolbar action into a CodeMirror transaction.
 *
 * All the markdown thinking happens in `markdownEdit`, which is a pure
 * function over strings; this is only the translation. The selection is given
 * in post-edit coordinates, which is how CodeMirror interprets a `selection`
 * that arrives in the same transaction as its `changes`.
 */
function applyAction(view: EditorView, action: MarkdownAction): void {
  const { from, to } = view.state.selection.main
  const edit = markdownEdit(action, view.state.doc.toString(), from, to)

  view.dispatch({
    changes: { from: edit.from, to: edit.to, insert: edit.insert },
    selection: { anchor: edit.anchor, head: edit.head },
    scrollIntoView: true
  })
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
  hidden,
  onChange,
  ref
}: EditorProps): React.JSX.Element {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)

  // Held in a ref so a changing `onChange` identity doesn't tear down and
  // rebuild the editor — that would discard undo history on every parent render.
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useImperativeHandle(
    ref,
    () => ({
      run(action) {
        if (!view.current) return
        applyAction(view.current, action)
        // A toolbar click should leave you typing where you left off, not
        // staring at an editor that no longer has focus.
        view.current.focus()
      },
      focus() {
        view.current?.focus()
      }
    }),
    []
  )

  useEffect(() => {
    if (!host.current) return undefined

    const instance = new EditorView({
      state: EditorState.create({
        doc: initialDoc,
        extensions: [
          /*
           * Highest precedence, so these win against CodeMirror's own bindings.
           * Only the three shortcuts that are muscle memory everywhere are
           * bound; the rest of the toolbar stays discoverable by looking at it,
           * rather than by memorising a table. `Ctrl+K` deliberately stays with
           * the note search it has always opened.
           */
          Prec.highest(
            keymap.of([
              {
                key: 'Mod-b',
                run: (target) => {
                  applyAction(target, 'bold')
                  return true
                }
              },
              {
                key: 'Mod-i',
                run: (target) => {
                  applyAction(target, 'italic')
                  return true
                }
              },
              /*
               * Swallowed, not handled. Ctrl/Cmd+E cycles the view mode, which
               * is the parent's business — but on macOS CodeMirror binds it to
               * "move to end of line", and both would otherwise happen at once.
               * Returning true suppresses that without stopping the event from
               * reaching the window listener in App.
               */
              { key: 'Mod-e', run: () => true }
            ])
          ),
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
    if (!hidden) view.current?.focus()
  }, [focusSignal, hidden])

  /*
   * Coming back from preview-only, the editor has been `display: none` and
   * every measurement CodeMirror cached for it is stale — line heights, the
   * viewport, where the cursor should be drawn. Hiding with CSS rather than
   * unmounting is what preserves undo history across a mode switch; this is
   * the one-line price of that.
   */
  useEffect(() => {
    if (!hidden) view.current?.requestMeasure()
  }, [hidden])

  return <div className={`editor ${hidden ? 'editor--hidden' : ''}`} ref={host} />
}
