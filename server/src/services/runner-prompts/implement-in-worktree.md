## Instructions

You are working in an isolated git worktree already checked out on branch `feature/{taskId}`. Do NOT run `git checkout` or `git worktree` — you are already on the correct branch.

Work through this git workflow exactly:

1. Implement changes inside `client/` only
2. `git add -A && git commit -m "[{taskId}] {taskTitle}"`
3. `git push -u origin feature/{taskId}`
4. Call `task_complete` with a brief summary

IMPORTANT: Do NOT merge branches. Do NOT push to master. Do NOT run `gh` commands. The server handles PR creation automatically when you call `task_complete`.

Use `task_log` at each milestone (25%, 50%, 75%). If you hit a blocker you cannot resolve, push whatever you have first (`git add -A && git commit -m "[{taskId}] WIP" && git push -u origin feature/{taskId}`), then call `request_human`.
