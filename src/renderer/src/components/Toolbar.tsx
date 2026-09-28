import type { MarkdownAction } from '../lib/markdown-actions'
import {
  showsEditor,
  VIEW_MODES,
  VIEW_MODE_LABELS,
  type ViewMode
} from '../lib/view-mode'

interface ToolbarProps {
  mode: ViewMode
  onModeChange: (mode: ViewMode) => void
  onAction: (action: MarkdownAction) => void
}

/*
 * Icons are inline SVG on a 16×16 grid, for the same reasons as the options
 * icon in NoteList: they inherit `currentColor`, stay sharp at any scale, and
 * add no dependency. `strokeWidth` 1.4 matches the hairlines elsewhere in the
 * panel — thicker reads as clip-art, thinner disappears on a dark background.
 *
 * B, I, S and H are drawn as letters instead. Every editor in existence labels
 * those four that way, and a glyph someone already recognises beats a picture
 * they have to learn.
 */

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.4,
  strokeLinecap: 'round',
  strokeLinejoin: 'round'
} as const

function Icon({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" {...stroke}>
      {children}
    </svg>
  )
}

/** Three bullets with a line beside each. */
const BulletListIcon = (
  <Icon>
    <circle cx="3" cy="4" r="1" fill="currentColor" stroke="none" />
    <circle cx="3" cy="8" r="1" fill="currentColor" stroke="none" />
    <circle cx="3" cy="12" r="1" fill="currentColor" stroke="none" />
    <path d="M6.5 4h7M6.5 8h7M6.5 12h7" />
  </Icon>
)

const NumberedListIcon = (
  <Icon>
    <text x="1" y="5.6" fontSize="5" fill="currentColor" stroke="none" fontFamily="inherit">
      1
    </text>
    <text x="1" y="10" fontSize="5" fill="currentColor" stroke="none" fontFamily="inherit">
      2
    </text>
    <text x="1" y="14.4" fontSize="5" fill="currentColor" stroke="none" fontFamily="inherit">
      3
    </text>
    <path d="M6.5 4h7M6.5 8.4h7M6.5 12.8h7" />
  </Icon>
)

const TaskListIcon = (
  <Icon>
    <rect x="1.5" y="2.5" width="5" height="5" rx="1.2" />
    <path d="M2.8 5l1.2 1.2 2-2.4" />
    <rect x="1.5" y="9" width="5" height="5" rx="1.2" />
    <path d="M9 5h5.5M9 11.5h5.5" />
  </Icon>
)

const QuoteIcon = (
  <Icon>
    <path d="M2.5 3v10" strokeWidth="2" />
    <path d="M6 5h8M6 8h8M6 11h5" />
  </Icon>
)

const LinkIcon = (
  <Icon>
    <path d="M6.8 9.2a2.6 2.6 0 0 0 3.7 0l2.2-2.2a2.6 2.6 0 0 0-3.7-3.7l-1 1" />
    <path d="M9.2 6.8a2.6 2.6 0 0 0-3.7 0L3.3 9a2.6 2.6 0 0 0 3.7 3.7l1-1" />
  </Icon>
)

/** A code window: a frame with two short lines of "code" inside. */
const CodeBlockIcon = (
  <Icon>
    <rect x="1.5" y="3" width="13" height="10" rx="1.6" />
    <path d="M4.2 7.2h3.4M4.2 10h5.6" />
  </Icon>
)

const TableIcon = (
  <Icon>
    <rect x="1.5" y="3" width="13" height="10" rx="1.4" />
    <path d="M1.5 6.6h13M6 6.6V13M10 6.6V13" />
  </Icon>
)

const RuleIcon = (
  <Icon>
    <path d="M2 8h12" />
  </Icon>
)

/** Two nodes and an arrow: the smallest thing that reads as a diagram. */
const DiagramIcon = (
  <Icon>
    <rect x="1.5" y="1.8" width="6" height="4.4" rx="1.2" />
    <rect x="8.5" y="9.8" width="6" height="4.4" rx="1.2" />
    <path d="M4.5 6.2v3.2a1.4 1.4 0 0 0 1.4 1.4h2.6" />
  </Icon>
)

const EditModeIcon = (
  <Icon>
    <path d="M11.2 2.4l2.4 2.4-8 8-3.1.7.7-3.1z" />
  </Icon>
)

const SplitModeIcon = (
  <Icon>
    <rect x="1.5" y="2.5" width="13" height="11" rx="1.6" />
    <path d="M8 2.5v11" />
  </Icon>
)

const PreviewModeIcon = (
  <Icon>
    <path d="M1.5 8s2.4-4.2 6.5-4.2S14.5 8 14.5 8s-2.4 4.2-6.5 4.2S1.5 8 1.5 8z" />
    <circle cx="8" cy="8" r="1.7" />
  </Icon>
)

interface ToolButton {
  action: MarkdownAction
  label: string
  hint?: string
  /** A letter, for the four everyone already knows by their letter. */
  glyph?: string
  glyphClass?: string
  icon?: React.JSX.Element
}

/**
 * The buttons, in three groups: character-level formatting, line-level
 * structure, then whole blocks. Roughly the order you reach for them, and the
 * order they appear in every other editor.
 */
const GROUPS: ToolButton[][] = [
  [
    { action: 'heading', label: 'Heading', hint: 'cycles H1 → H2 → H3 → plain', glyph: 'H' },
    { action: 'bold', label: 'Bold', hint: 'Ctrl B', glyph: 'B', glyphClass: 'is-bold' },
    { action: 'italic', label: 'Italic', hint: 'Ctrl I', glyph: 'I', glyphClass: 'is-italic' },
    { action: 'strikethrough', label: 'Strikethrough', glyph: 'S', glyphClass: 'is-struck' },
    { action: 'code', label: 'Inline code', glyph: '<>', glyphClass: 'is-mono' }
  ],
  [
    { action: 'bulletList', label: 'Bullet list', icon: BulletListIcon },
    { action: 'numberedList', label: 'Numbered list', icon: NumberedListIcon },
    { action: 'taskList', label: 'Task list', icon: TaskListIcon },
    { action: 'quote', label: 'Quote', icon: QuoteIcon }
  ],
  [
    { action: 'link', label: 'Link', icon: LinkIcon },
    { action: 'codeBlock', label: 'Code block', icon: CodeBlockIcon },
    { action: 'table', label: 'Table', icon: TableIcon },
    { action: 'horizontalRule', label: 'Horizontal rule', icon: RuleIcon },
    { action: 'mermaid', label: 'Diagram', hint: 'mermaid', icon: DiagramIcon }
  ]
]

const MODE_ICONS: Record<ViewMode, React.JSX.Element> = {
  edit: EditModeIcon,
  split: SplitModeIcon,
  preview: PreviewModeIcon
}

/**
 * The formatting bar.
 *
 * Its reason for existing is that markdown's syntax is the part people do not
 * remember. `**` for bold is easy; the pipes and dashes of a table, and the
 * exact spelling of a mermaid fence, are not — and looking them up means
 * leaving the note you were writing.
 *
 * Every button is a toggle over the text itself, not a rich-text command: the
 * file on disk stays plain markdown you could have typed by hand (BR-7).
 */
export default function Toolbar({ mode, onModeChange, onAction }: ToolbarProps): React.JSX.Element {
  return (
    <div className="toolbar">
      {showsEditor(mode) &&
        GROUPS.map((group) => (
          // Keyed by the group's first action: stable, and unique because no
          // action appears twice.
          <div className="toolbar__group" key={group[0].action}>
            {group.map((button) => (
              <button
                key={button.action}
                type="button"
                className="toolbar__button"
                aria-label={button.label}
                title={button.hint ? `${button.label} — ${button.hint}` : button.label}
                /*
                 * Without this the click would blur the editor first, and the
                 * selection the button is about to format would be gone by the
                 * time it ran.
                 */
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onAction(button.action)}
              >
                {button.glyph ? (
                  <span className={`toolbar__glyph ${button.glyphClass ?? ''}`}>{button.glyph}</span>
                ) : (
                  button.icon
                )}
              </button>
            ))}
          </div>
        ))}

      {/* Pushes the view switcher to the right, and keeps it there when the
          formatting buttons are hidden in preview mode — so the control the
          user needs to get back does not move. */}
      <div className="toolbar__spacer" />

      <div className="segmented" role="group" aria-label="View">
        {VIEW_MODES.map((option) => (
          <button
            key={option}
            type="button"
            className={`segmented__option segmented__option--icon ${
              mode === option ? 'segmented__option--active' : ''
            }`}
            aria-label={VIEW_MODE_LABELS[option]}
            aria-pressed={mode === option}
            title={`${VIEW_MODE_LABELS[option]} — Ctrl E`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onModeChange(option)}
          >
            {MODE_ICONS[option]}
          </button>
        ))}
      </div>
    </div>
  )
}
