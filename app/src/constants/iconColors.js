// Rule: every icon of the same lucide-react component — or the same shared icon
// reused for the same purpose — uses ONE color everywhere in the app. Never give
// the same icon a different shade/hue by file; copy the value below instead of
// guessing a local gray-4xx/5xx/6xx. Color is preferred over neutral gray whenever
// the icon carries real meaning (destructive, warning, success, restore) — plain
// gray is reserved for icons with no semantic charge (Clock, Search, Tag, Activity…).
//
// Base hues, one meaning each (see the wider design system):
//   red    = destructive / error / failed
//   amber  = needs attention / locked / notification
//   green  = success / confirmed
//   blue   = informational
//   accent = primary action / current selection ONLY — never decorative on a
//            section/modal header icon that isn't clickable or a selection state
//   gray-400 = neutral, interactive contrast floor (never gray-500/600 on a
//            clickable icon — those read as disabled on these surfaces)
//
// When a choice exists between a colored and a grayscale rendering of the SAME
// icon, color wins — always, even if grayscale is the more common instance in
// the codebase today. Resolve toward the value below by frequency of the color,
// not the shade. (This table was corrected once already for exactly that
// mistake: Trash2 and Archive were first normalized toward their more-common
// gray-at-rest instances, which was backwards — the colored-at-rest instances
// were the ones that should have spread everywhere.)
//
// When the icon shares a button with its own text label (e.g. an "Edit" link,
// a "Rename" menu row) and recoloring the whole button would also recolor
// unrelated label text or a chevron/count badge riding along in the same
// className, give the icon its own explicit className instead of recoloring
// the shared wrapper — see Pencil in TaskDetail.jsx's "Edit" buttons, or
// Archive in the Sidebar/App.jsx "Archived tasks (N)" nav links.
//
// Three deliberate exceptions — same icon component, distinct meaning, kept
// OUT of this table on purpose:
//  - `Check` as a *selection* marker (Sidebar board/theme/language picker,
//    SettingsPage workspace/board picker) stays `text-accent`, distinct from
//    `Check` as a *success* marker (`text-green-400`, below).
//  - The active-sort-column chevron in SettingsTable stays `text-accent`,
//    distinct from a plain expand/collapse chevron (`text-gray-400`, below).
//  - `Pencil` on a protected/system column (Column.jsx) stays the column's own
//    `#d6c3a1` protected-state color, distinct from the ordinary edit accent.
//
// `X` used as a pass/fail glyph (not "close a panel") is not in this table —
// use `XCircle` (text-red-400) for a hard error/failure instead, paired with
// `CheckCircle2` (text-green-400) for success, so the plain close icon never
// has to carry a second meaning. `AlertCircle` joins `AlertTriangle` as amber —
// both read as "needs attention" in this app; a genuine failure uses `XCircle`.
export const ICON_COLOR = {
  Plus: 'text-accent',
  Trash2: 'text-red-400 hover:text-red-300',
  Archive: 'text-amber-400 hover:text-amber-300',
  RotateCcw: 'text-accent hover:text-accent/80',
  Check: 'text-green-400',
  AlertTriangle: 'text-amber-400',
  AlertCircle: 'text-amber-400',
  Lock: 'text-amber-400',
  Unlock: 'text-amber-400',
  Bell: 'text-amber-400',
  GripVertical: 'text-gray-400 hover:text-gray-200',
  Pencil: 'text-accent hover:text-accent/80',
  ChevronDown: 'text-gray-400',
  ChevronRight: 'text-gray-400',
  ChevronUp: 'text-gray-400',
  XCircle: 'text-red-400',
  CheckCircle2: 'text-green-400',
};
