---
description: Copy this plugin's path-scoped rules into the current project's .claude/rules/
---

Install this plugin's path-scoped rules into the current project:

1. List the files in `${CLAUDE_PLUGIN_ROOT}/rules/`.
2. Ensure `.claude/rules/` exists at the project root (create it if missing).
3. For each rule file:
   - If `.claude/rules/<name>` does not exist, copy the file there verbatim.
   - If it exists with identical content, skip it.
   - If it exists with different content, do NOT overwrite it — record it as a conflict.
4. Report exactly what was copied, skipped, and conflicted. For conflicts, show a diff and let
   the user decide; never overwrite silently.
5. Some rules embed project-specific commands (formatter invocation such as
   `docker compose exec cli vendor/bin/duster fix --dirty`, npm script names such as
   `npm run agent-checks`). After copying, list those commands and ask the user whether they
   match this project's setup; offer to adjust the copied rules if not.
