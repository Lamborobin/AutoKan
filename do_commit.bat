@echo off
cd /d C:\Users\roblar\source\repos\AutoKan

REM Remove stale lock file
if exist .git\index.lock del /f .git\index.lock

REM Unstage internal tooling folders
git restore --staged .claude\worktrees\ .claude\settings.local.json

REM Stage everything else
git add -A

REM Unstage again just in case
git restore --staged .claude\worktrees\ .claude\settings.local.json 2>nul

REM Commit
git commit -m "feat: GitHub PR integration, auto_complete support, MarkdownText component, agent/server refinements

- Add native GitHub PR creation and merge via GitHub API (no gh CLI required)
- Add approve_pr endpoint to move tasks from Human Action to Testing
- Add auto_complete field to tasks for automatic task completion tracking
- Add MarkdownText.jsx component for rich text rendering
- Refine agent configs and prompts (pm.md, developer.md, tester.md)
- Update server routes (tasks, other) and agentRunner service
- Update frontend components: Sidebar, TaskCard, TaskDetail, TemplatesModal,
  SettingsModal, NewTaskModal, AgentForm, EditAgentModal, NewAgentModal
- Add new instruction template (my_new_template.md)
- Update README, CLAUDE.md, and agents/context.md documentation
- Update package dependencies across app, server, and root"

REM Push to master
git push origin master

REM Clean up this script
del /f do_commit.bat

echo.
echo Done! Press any key to close.
pause
