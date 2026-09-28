import type { NoteMeta } from '../../../shared/types'

interface NoteListProps {
  notes: NoteMeta[]
  activeId: string | null
  query: string
  onQueryChange: (value: string) => void
  onOpen: (id: string) => void
  onDelete: (id: string) => void
  onCreate: () => void
  onOpenSettings: () => void
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
  onOpenSettings,
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
            {/*
              The id *is* the name — it's the filename on disk. Showing it here
              rather than a title derived from the content means the list and
              the user's file manager agree about what each note is called.
            */}
            <span className="note-item__title">{note.id}</span>
            <span className="note-item__meta">{relativeTime(note.updatedAt)}</span>

            {/*
              A <span> rather than a nested <button>: buttons cannot legally
              nest, and React would warn about invalid DOM nesting.
            */}
            <span
              className="note-item__delete"
              role="button"
              tabIndex={-1}
              aria-label={`Delete ${note.id}`}
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
        <button
          type="button"
          className="icon-button"
          aria-label="Options"
          title="Options"
          onClick={onOpenSettings}
        >
          {/* Inline SVG rather than an icon font or an emoji: it inherits
              currentColor, stays crisp at any scale, and adds no dependency. */}
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path
              fill="currentColor"
              d="M8 10.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5Zm0-1.2a1.3 1.3 0 1 0 0-2.6 1.3 1.3 0 0 0 0 2.6Z"
            />
            <path
              fill="currentColor"
              d="M6.9 1.5h2.2l.3 1.5.9.5 1.4-.6 1.5 2.6-1.1 1v1l1.1 1-1.5 2.6-1.4-.6-.9.5-.3 1.5H6.9l-.3-1.5-.9-.5-1.4.6L2.8 8.5l1.1-1v-1l-1.1-1 1.5-2.6 1.4.6.9-.5.3-1.5Z"
              opacity="0.9"
              fillRule="evenodd"
            />
          </svg>
        </button>
      </div>
    </aside>
  )
}
