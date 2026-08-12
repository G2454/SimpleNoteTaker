import type { NoteMeta } from '../../../shared/types'

interface NoteListProps {
  notes: NoteMeta[]
  activeId: string | null
  query: string
  onQueryChange: (value: string) => void
  onOpen: (id: string) => void
  onDelete: (id: string) => void
  onCreate: () => void
  searchRef: React.RefObject<HTMLInputElement | null>
}

/** Relative time, in the few buckets that actually matter for recent notes. */
function relativeTime(timestamp: number): string {
  const seconds = Math.max(0, (Date.now() - timestamp) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export default function NoteList({
  notes,
  activeId,
  query,
  onQueryChange,
  onOpen,
  onDelete,
  onCreate,
  searchRef
}: NoteListProps): React.JSX.Element {
  return (
    <aside className="sidebar">
      <div className="sidebar__search">
        <input
          ref={searchRef}
          className="search-input"
          type="text"
          value={query}
          placeholder="Search"
          spellCheck={false}
          onChange={(event) => onQueryChange(event.target.value)}
        />
      </div>

      <div className="sidebar__list">
        {notes.length === 0 && (
          <p className="sidebar__empty">{query ? 'No matches' : 'No notes yet'}</p>
        )}

        {notes.map((note) => (
          <button
            key={note.id}
            type="button"
            className={`note-item ${note.id === activeId ? 'note-item--active' : ''}`}
            onClick={() => onOpen(note.id)}
          >
            <span className="note-item__title">{note.title}</span>
            <span className="note-item__meta">{relativeTime(note.updatedAt)}</span>

            {/*
              A <span> rather than a nested <button>: buttons cannot legally
              nest, and React would warn about invalid DOM nesting.
            */}
            <span
              className="note-item__delete"
              role="button"
              tabIndex={-1}
              aria-label={`Delete ${note.title}`}
              onClick={(event) => {
                event.stopPropagation() // don't also open the note we're deleting
                onDelete(note.id)
              }}
            >
              ×
            </span>
          </button>
        ))}
      </div>

      <div className="sidebar__footer">
        <button type="button" className="new-note" onClick={onCreate}>
          <span>New note</span>
          <kbd>Ctrl N</kbd>
        </button>
      </div>
    </aside>
  )
}
