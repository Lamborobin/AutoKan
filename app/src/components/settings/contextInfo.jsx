// Info-modal content + hierarchy diagram for the three settings sections.
// Title, body, and the layer the diagram highlights live here as data so they're
// easy to edit without touching the modal/sidebar components.

import { FolderTree, BookOpen, FileText, Layers, ShieldCheck, Sparkles } from 'lucide-react';

// ── The six-layer authority stack ────────────────────────────────────────────
// Most general (immutable, system-owned) at the top → most specific (per-agent
// personality) at the bottom. Layers below ADD to the layers above; nothing
// below can override what's above it.
const LAYERS = [
  {
    key: 'code',
    label: 'Code mechanics',
    sub: 'How the system actually works — fixed, set by developers. Not editable here.',
    Icon: ShieldCheck,
    tone: 'immutable',
  },
  {
    key: 'runner',
    label: 'Runner prompts',
    sub: 'Built-in instructions for how agents carry out their work. System-owned, not user-editable.',
    Icon: Layers,
    tone: 'system',
  },
  {
    key: 'ai_context',
    label: 'AI Context',
    sub: 'System-wide rules the AI follows on every board. Edited by admins.',
    Icon: BookOpen,
    tone: 'system',
  },
  {
    key: 'workspace',
    label: 'Workspace Context',
    sub: 'Shared by every board in this workspace — who the client is, how your team likes to work.',
    Icon: FolderTree,
    tone: 'personality/rules/domain-specific',
  },
  {
    key: 'board',
    label: 'Board Context',
    sub: 'For this board only — its domain, priorities, and board-specific preferences.',
    Icon: FileText,
    tone: 'personality/rules/domain-specific',
  },
  {
    key: 'agent',
    label: 'Template + Agent personality',
    sub: 'An individual agent\'s personality and area of focus.',
    Icon: Sparkles,
    tone: 'personality/specialization',
  },
];

// ── Hierarchy diagram ────────────────────────────────────────────────────────
// Highlights the layer(s) the current modal is about. Layers above the highlight
// are dimmed but visible (system foundations the user can't break). Layers
// below are dimmed too (more specific layers that further customise on top).

export function HierarchyDiagram({ highlight }) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] uppercase tracking-widest text-gray-600 mb-2">Authority order — top is absolute, bottom is additive</p>
      {LAYERS.map((layer, i) => {
        const isHighlight = layer.key === highlight;
        const { Icon } = layer;
        return (
          <div
            key={layer.key}
            className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg border transition-colors ${
              isHighlight
                ? 'bg-accent/15 border-accent/40 text-accent'
                : 'bg-surface-0/50 border-border text-gray-500'
            }`}
          >
            <div className={`w-4 text-[9px] font-mono ${isHighlight ? 'text-accent' : 'text-gray-700'}`}>
              {i + 1}
            </div>
            <Icon size={12} className={isHighlight ? 'text-accent' : 'text-gray-600'} />
            <div className="flex-1 min-w-0">
              <p className={`text-[11px] font-medium truncate ${isHighlight ? 'text-accent' : 'text-gray-400'}`}>
                {layer.label}
              </p>
              <p className="text-[9px] text-gray-600 truncate font-mono">{layer.sub}</p>
            </div>
            {isHighlight && (
              <span className="text-[8px] font-semibold uppercase tracking-wider text-accent/80 px-1.5 py-0.5 rounded bg-accent/10">
                you're here
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Modal copy per section ───────────────────────────────────────────────────

export const CONTEXT_INFO = {
  board: {
    title: 'Board Context',
    intro: "Files that add personality and domain context for this board only.",
    highlight: 'board',
    body: (
      <>
        <p>
          Notes that apply to <span className="text-gray-300 font-medium">this board only</span> — its domain,
          the client's priorities, and any preferences for how work here should be done. Agents read these
          when planning and working on tasks on this board.
        </p>
        <p className="text-gray-500 italic">
          Examples: "When working on the cart, always ask a human before changing payment logic." ·
          "The client prefers concise commit messages." · "Always test in Safari."
        </p>
      </>
    ),
  },

  workspace: {
    title: 'Workspace Context',
    intro: 'Files that add personality and context for every board in this workspace.',
    highlight: 'workspace',
    body: (
      <>
        <p>
          Notes shared by <span className="text-gray-300 font-medium">every board in this workspace</span> —
          things like who the client is and how your team likes to work. Useful when the same guidance should
          apply everywhere instead of repeating it on each board.
        </p>
        <p className="text-gray-500 italic">
          Examples: "We use Clean Architecture — don't bypass the service layer." ·
          "Always ask before modifying database schemas." · "Prefer TypeScript for new files."
        </p>
      </>
    ),
  },

  ai_context: {
    title: 'AI Context',
    intro: 'System-wide rules and guidelines AI agents follow across every board and capability.',
    highlight: 'ai_context',
    body: (
      <>
        <p>
          Sits at the top of the personality hierarchy — above Workspace Context, above Board
          Context, above any individual agent persona. More technical around agents, thought process and 
          patterns without interfering with code specific flows, nor are these personality files.
        </p>
        <p>
          The rules here are affecting the agents output, partially patterns and business rules. A rule could be something like "always retry once more before
          requesting for human assistance", "Never share the production environment variables", "Always start the planning phase with "Hello [name]"
        </p>
        <p>
          <span className="text-gray-300 font-medium">Storage:</span>{' '}
           <code className="text-[11px] bg-surface-0 px-1.5 py-0.5 rounded font-mono">
            /docs
           </code>
            the platform's docs folder. Edits are versioned and can be rolled back.
        </p>
      </>
    ),
  },
};
