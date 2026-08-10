# Rules

The **System Rules** layer — global, editable rules that every agent on every board follows. Superadmins and developers edit this from Settings → System Rules; changes are versioned and reversible.

This layer sits on top of the immutable core — the code mechanics and runner prompts layers, which never change. It may **add or tighten** behaviour and, uniquely, **invoke code-exposed actions/hooks** — but it can never change the flow itself, and it must never contradict the core or loosen a rule the core sets.

Keep each rule a single, checkable statement so an agent can follow it without interpretation.

---

## Active rules *MUST BE RESPECTED*

- When information is genuinely missing, **flag it — never fabricate** facts, figures, dates, citations, or values. An honest gap is safe; a confident-looking guess is not.
- Never reveal business secrets — anything found in code, configuration, or a task that isn't meant for the client's eyes stays internal.
- Prefer the smallest action that satisfies the task; don't expand scope on your own.
- Use the client's own words and concepts in anything the client reads, not internal system or tool names.
