# Rules

The **System Rules** layer — global, editable rules that every agent on every board follows. Superadmins and developers edit this from the AI Context panel; changes are versioned and reversible.

This layer sits on top of the immutable core (see the context layer model in `CLAUDE.md`). It may **add or tighten** behaviour and, uniquely, **invoke code-exposed actions/hooks** — but it can never change the flow itself, and it must never contradict the core or loosen a rule the core sets.

Keep each rule a single, checkable statement so an agent can follow it without interpretation.

---

## Active rules

- When information is genuinely missing, **flag it — never fabricate** facts, figures, dates, citations, or values. An honest gap is safe; a confident-looking guess is not.
- Never reveal business secrets — anything found in code, configuration, or a task that isn't meant for the client's eyes stays internal.
- Prefer the smallest action that satisfies the task; don't expand scope on your own.
- Use the client's own words and concepts in anything the client reads, not internal system or tool names.

---

## How to write a rule

Rules can be plain behavioural boundaries or, at this layer only, tie into actions the code exposes:

- **Behavioural** — "Always reply in Spanish." · "Never reveal business secrets." · "Retry up to 3 times before escalating to a human."
- **Conditional / business logic** — "When an order exceeds 100 units, summarise the impact before proceeding."
- **Action hook (fork/tenant-specific)** — if this install exposes an email action: "When an order exceeds 100 units, send a notice to info@company.com with the amount."

A rule applies everywhere it isn't overridden by a tighter workspace or board rule. It can be sector-shaped, but it must not contradict a higher layer (a rule here can't undo the core's "never touch the AutoKan app itself"). Add your rules under **Active rules** above.
