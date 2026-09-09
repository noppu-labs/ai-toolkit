# Comment audit: <PR title or number>

Config: base `<base>`, head `<head>`, dirs `<dirs>`, readme `<readme>`, ticket `<ticket or none>`, siblings `<name:path or none>`.
Excluded from scope: `<generated and vendor paths dropped in step 0>`.

Added comment lines: N. Estimated after applying this audit: M.

## Summary

- DELETE n, TRIM n, MOVE n, KEEP n, UNSURE n, WRONG n
- The three or four findings that matter most, one line each.

## Proposed README sections

For each: title, new or addition to an existing section, the sites it replaces (`path:line`), and the full proposed text. A mermaid diagram where it replaces paragraphs (flows, hierarchies, pipelines).

## Findings by file

### path/to/File.php

- **L123, DELETE**: "<comment, one line>". Reason.
- **L140, TRIM**: "<comment>". Reason. Proposed:
  > proposed text
- **L160, MOVE** to README "<section>". Pointer: `See README.md, "<section>".`
- **L170, KEEP**: "<comment>".
- **L180, UNSURE**: "<comment>". What needs checking, and where.
- **L190, WRONG**: "<comment>". What the code actually does.

## Schema descriptions changed

Every `"""` description with a verdict, listed separately because they show up in introspection.
