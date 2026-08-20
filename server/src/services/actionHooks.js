// ── Action Hooks Registry ────────────────────────────────────────────────────
// Small, developer-curated map of action name -> handler. This is the actual
// safety boundary: nothing is invokable unless it has an entry here, added by a
// code change — not a runtime permission check. Any capability can call any
// registered action via the invoke_action_hook tool (see agentRunner.js);
// per-capability/per-install permission gating is deliberately not built yet.
//
// Referenced in System Behavior (or any capability behavior file) by wrapping the
// bare name in underscores, e.g. `_notify_all_` — a plain-text convention so an
// agent reading free-form rules text can visually tell "this word names a
// callable action" apart from ordinary prose. The model passes the BARE name
// (no underscores) as the `action` argument when it actually calls the tool.
//
// ── `effect` ─────────────────────────────────────────────────────────────────
// Every entry declares what kind of effect it produces, so effects.js can decide
// whether an invocation is really performed or only recorded (see that file for
// the run-mode policy). An entry that omits `effect` is treated as EXTERNAL —
// undeclared fails closed rather than leaking.
//
// Rule of thumb: ORCHESTRATION is reserved for AutoKan's OWN pipeline notices,
// emitted by the server at column transitions ("PR ready for review"). Anything
// an AGENT chooses to invoke is an effect of the behaviour under test, so it is
// EXTERNAL — including notifications, which is why notify_all is EXTERNAL below
// despite also being "just" an in-app message.
const { notifyAllUsers } = require('./notificationsService');
const { EXTERNAL } = require('./effects');

const ACTION_HOOKS = {
  notify_all: {
    description: 'Send an in-app notification to every user in the app.',
    // Both optional. An agent told only "notify everyone" has no way to know what
    // wording to invent, and failing the call over a missing title turned a
    // working instruction into a silent no-op. The task supplies the fallback,
    // which is the sensible default anyway — the notification links to that task.
    params_schema: '{ title?: string, body?: string } — both optional; the task title is used when title is omitted',
    effect: EXTERNAL,
    async run(params, { taskId, task }) {
      const { title, body } = params || {};
      const resolved = (title && String(title).trim())
        || (task && task.title)
        || 'Task update';
      notifyAllUsers(resolved, body || null, taskId ? `?task=${taskId}` : null);
      return `Notified all users: "${resolved}"`;
    },
  },
};

module.exports = { ACTION_HOOKS };
