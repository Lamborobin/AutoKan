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
  },
  {
    key: 'runner',
    label: 'Runner prompts',
    sub: 'Built-in instructions for how agents carry out their work. System-owned, not user-editable.',
    Icon: Layers,
  },
  {
    key: 'ai_context',
    label: 'System Rules',
    sub: 'Global rules with technical depth — the only layer that can invoke code-exposed actions, not just state rules. Edited by superadmins/devs.',
    Icon: BookOpen,
  },
  {
    key: 'workspace',
    label: 'Workspace Context',
    sub: 'Declarative boundaries shared by every board in this workspace — rules only, no new actions.',
    Icon: FolderTree,
  },
  {
    key: 'board',
    label: 'Board Context',
    sub: 'Declarative boundaries for this board only — its domain and rules, no new actions.',
    Icon: FileText,
  },
  {
    key: 'agent',
    label: 'Template + Agent personality',
    sub: 'Cosmetic personality — tone, sign-off, phrasing. No effect on the flow.',
    Icon: Sparkles,
  },
];

// ── Hierarchy diagram ────────────────────────────────────────────────────────
// Highlights the layer(s) the current modal is about. Layers above the highlight
// are dimmed but visible (system foundations the user can't break). Layers
// below are dimmed too (more specific layers that further customise on top).

export function HierarchyDiagram({ highlight }) {
  return (
    <div className="space-y-1">
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
            <div className={`w-4 text-[9px] ${isHighlight ? 'text-accent' : 'text-gray-700'}`}>
              {i + 1}
            </div>
            <Icon size={12} className={isHighlight ? 'text-accent' : 'text-gray-600'} />
            <div className="flex-1 min-w-0">
              <p className={`text-[11px] font-medium truncate ${isHighlight ? 'text-accent' : 'text-gray-400'}`}>
                {layer.label}
              </p>
              <p className="text-[9px] text-gray-600 truncate">{layer.sub}</p>
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
    intro: "Domain knowledge and rules that apply to this board only — constraints, not new actions.",
    highlight: 'board',
    body: (
      <>
        <p>
          Notes that apply to <span className="text-gray-300 font-medium">this board only</span> — its domain,
          the client's priorities, and any preferences for how work here should be done. Agents read these
          when planning and working on tasks on this board, whatever the board's sector.
        </p>
        <p className="text-gray-500 italic">
          Examples: "Every document must follow the seven-section structure and cite the relevant standard." ·
          "Never guess a clinical figure or dose — flag it as missing." ·
          "On the website, ask a human before changing payment logic."
        </p>
      </>
    ),
  },

  workspace: {
    title: 'Workspace Context',
    intro: 'Rules and context shared by every board in this workspace — constraints, not new actions.',
    highlight: 'workspace',
    body: (
      <>
        <p>
          Notes shared by <span className="text-gray-300 font-medium">every board in this workspace</span> —
          things like who the organisation is and how your team likes to work. Useful when the same guidance
          should apply everywhere instead of repeating it on each board.
        </p>
        <p className="text-gray-500 italic">
          Examples: "We're ISO 9001 certified — every procedure must reference the relevant standard." ·
          "Nothing goes to the client without a second person reviewing it first." ·
          "Keep anything customer- or patient-facing in plain language."
        </p>
      </>
    ),
  },

  ai_context: {
    title: 'System Rules',
    intro: 'Global, editable rules every agent follows across every board and capability.',
    highlight: 'ai_context',
    body: (
      <>
        <p>
          The top <span className="text-gray-300 font-medium">editable</span> layer — global rules every agent
          follows on every board, whatever its sector. Edited by superadmins and developers. It sits above
          Workspace and Board rules and any personality, but below the immutable core: it can add and tighten
          behaviour, never change the flow or contradict the core.
        </p>
        <p>This layer isn't limited to plain rules — it can hold guardrails, information, hard constraints, or actions, shaped as:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><span className="text-gray-300 font-medium">Behavioural</span> — "Always reply in Spanish." · "Never reveal business secrets." · "Retry up to 3 times before escalating to a human."</li>
          <li><span className="text-gray-300 font-medium">Conditional / business logic</span> — "When an order exceeds 100 units, summarise the impact before proceeding."</li>
          <li><span className="text-gray-300 font-medium">Informational</span> — plain context the agent should know, not a directive: "Support tickets route through Zendesk, not email."</li>
          <li><span className="text-gray-300 font-medium">Action hook</span> — unique to this layer: if this install exposes an email action, "When an order exceeds 100 units, send a notice to the configured email with the amount."</li>
        </ul>
        <p>
          Keep each entry a single, checkable statement so an agent can follow it without interpretation. It
          applies everywhere it isn't overridden by a tighter Workspace or Board constraint.
        </p>
      </>
    ),
  },

  agent: {
    title: 'Agent Personality',
    intro: 'How this agent comes across — its tone and voice.',
    highlight: 'agent',
    body: (
      <>
        <p>
          This is where you give the agent its <span className="text-gray-300 font-medium">character</span> —
          how it talks, not what it does. Like telling a new team member how to come across: warm or direct,
          formal or casual, how it greets people and how it signs off.
        </p>
        <p>
          It only changes the <span className="text-gray-300 font-medium">way</span> the agent communicates.
          It can't change what the agent is allowed to do, the steps it follows, or the rules it must obey —
          those are decided elsewhere, and personality can't override them. So you can make an agent sound
          however you like with no risk of it going off-task.
        </p>
        <p className="text-gray-500 italic">
          Examples: "Always be warm and encouraging." · "Get straight to the point — no small talk." ·
          "Sign off every message with the team name."
        </p>
      </>
    ),
  },
};
