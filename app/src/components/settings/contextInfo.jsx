// Info-modal content + hierarchy diagram for the three settings sections.
// Title, body, and the layer the diagram highlights live here as data so they're
// easy to edit without touching the modal/sidebar components.

import { FolderTree, BookOpen, FileText, Layers, ShieldCheck, Sparkles, Wrench } from 'lucide-react';

// ── The seven-layer authority stack ──────────────────────────────────────────
// Most general (immutable, system-owned) at the top → most specific (per-agent
// personality) at the bottom. Layers below ADD to the layers above; nothing
// below can override what's above it. Mirrors the "Layer Stack" table in
// dev/agents.md — keep the two in sync if either changes.
const LAYERS = [
  {
    key: 'code',
    label: 'Code mechanics',
    sub: 'How the system actually works - the app, set by developers (not user-editable).',
    Icon: ShieldCheck,
  },
  {
    key: 'runner',
    label: 'Runner prompts',
    sub: 'Built-in instructions for agents work - system owned (not user-editable).',
    Icon: Layers,
  },
  {
    key: 'ai_context',
    label: 'System Behavior',
    sub: 'Global rules with technical depth — can invoke code-exposed actions, not just state rules. Shares that ability with Capability Behavior now, not exclusive to it. Edited by superadmins.',
    Icon: BookOpen,
  },
  {
    key: 'capability',
    label: 'Capability personality',
    sub: 'Methodology and tone for any agent of this capability — how it approaches its work. Operator-edited; real behavioural weight, not just cosmetic.',
    Icon: Wrench,
  },
  {
    key: 'workspace',
    label: 'Workspace Context',
    sub: 'Declarative boundaries - shared by every board in this workspace such as rules, boundaries etc.',
    Icon: FolderTree,
  },
  {
    key: 'board',
    label: 'Board Context',
    sub: 'Declarative boundaries for this board only — its domain and rules, bondaries etc.',
    Icon: FileText,
  },
  {
    key: 'agent',
    label: 'Agent personality',
    sub: 'Cosmetic personality — tone, sign-off, phrasing.',
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
            <div className={`w-4 text-xs ${isHighlight ? 'text-accent' : 'text-gray-600'}`}>
              {i + 1}
            </div>
            <Icon size={12} className={isHighlight ? 'text-accent' : 'text-gray-600'} />
            <div className="flex-1 min-w-0">
              <p className={`text-xs font-medium ${isHighlight ? 'text-accent' : 'text-gray-400'}`}>
                {layer.label}
              </p>
              <p className="text-xs text-gray-500">{layer.sub}</p>
            </div>
            {isHighlight && (
              <span className="text-xs font-semibold uppercase tracking-wider text-accent/80 px-1.5 py-0.5 rounded-md bg-accent/10">
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
    intro: "Domain knowledge and rules that apply to this board only, i.e. rules or constraints.",
    highlight: 'board',
    body: (
      <>
        <p>
          Notes that apply to <span className="text-gray-300 font-medium">this board only</span> — its domain,
          the client's priorities, and any preferences for how work here should be done. Agents read these
          when planning and working on tasks on this board.
        </p>
        <p className="text-gray-500 italic">
          Examples: "Every document must follow the seven-section structure and cite the relevant standard." ·
          "Never guess a clinical figure or dose — flag it as missing." ·
          "On the website, ask a human before changing any payment logic."
        </p>
      </>
    ),
  },

  capability: {
    title: 'Capability Behavior',
    intro: "How a capability (Planner, Coder, Tester, …) does its job — methodology, tone, and when it fires its own actions.",
    highlight: 'capability',
    body: (
      <>
        <p>
          One file per capability, shared by <span className="text-gray-300 font-medium">every agent of that
          capability</span> in this workspace — not a specific board. This is where you shape *how* that kind of
          agent works: what it prioritises, how it talks, and — unlike Workspace Context — when it should use one
          of its own tools (for example, sending a notification at a specific point in its process).
        </p>
        <p className="text-gray-500 italic">
          Examples: "Always summarise what you understand before asking questions." ·
          "Lead with the plain-language outcome, not the technical detail." ·
          "When you approve a task for the first time, notify the team."
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
    title: 'System Behavior',
    intro: 'Global, editable rules every agent follows across every board and capability.',
    highlight: 'ai_context',
    body: (
      <>
        <p>
          The top <span className="text-gray-300 font-medium">editable</span> layer — global rules for the entire app cross any workspace and board.  <br />
          Can only be edited by superadmins and developers. <br />
          It sits above
          Workspace and Board rules and any personality, but below the immutable core: it can add and tighten
          behaviour, never change the flow or contradict the core.
        </p>
        <p>This layer isn't limited to plain rules — it can hold guardrails, information, hard constraints, or actions, shaped as:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><span className="text-gray-300 font-medium">Behavioural</span> — "Always reply in Spanish." · "Never reveal business secrets." · "Retry up to 3 times before escalating to a human."</li>
          <li><span className="text-gray-300 font-medium">Conditional / business logic</span> — "When a board contains sensitive information, apply the appropriate security measures and email the result to security@company.com."</li>
          <li><span className="text-gray-300 font-medium">Informational</span> — plain context the agent should know, not a directive: "Support tickets route through Zendesk, not email."</li>
          <li><span className="text-gray-300 font-medium">Action hook</span> — if this install exposes an action (e.g. a notification), reference it here to make it fire for every capability at once; a specific capability's own behavior file can invoke the same action too, just scoped to that capability.</li>
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
