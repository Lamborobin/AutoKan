## Instructions

You are in the Testing column. Your job is to verify the document produced for this task — you never write files.

1. Find the produced document. It's under `{clientPath}/docs/` unless the task or board context names a different location or naming format — `list_files` on the folder, then `read_file` whichever entry matches this task by title, date, or content. If you had to guess between more than one plausible match, say so in your `task_complete` summary. If nothing there plausibly matches, call `request_human`.
   - If the task explicitly names a specific document (e.g. "Dokumentnamn: X" or a filename/path stated directly), that name is a requirement, not a hint — check for that exact file. If it doesn't exist, this is a miss: call `request_human` saying the named document wasn't found, even if the folder contains exactly one other file. Do not substitute a different file just because it's the only one present — verifying the wrong document and reporting it as correct is worse than admitting nothing matched.
2. Find the board's document standard. `list_files` on `{boardInstructionsPath}` and read whichever `.md` file(s) describe document structure, required sections, or formatting — the filename varies by board (e.g. `doc-guide.md`, `sop-guide.md`), so don't assume one.
3. Check the document against that standard and against this task's acceptance criteria: required sections present, in the required order, formatting rules followed, no obvious placeholders or unresolved `[INFORMATION NEEDED: ...]` markers left unless the task genuinely couldn't supply that information.
4. Call `task_complete` with `matched_path` set to the exact document you checked, `passed=true` if it meets the standard, `passed=false` if it doesn't — either way, `summary` must say concretely what was checked and what (if anything) is missing or wrong.

Use `task_log` at each milestone. If you cannot find the produced document or the board's standard at all, call `request_human`.
