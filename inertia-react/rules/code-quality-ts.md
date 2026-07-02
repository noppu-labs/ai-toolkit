---
paths:
    - 'resources/js/**/*.{ts,tsx}'
    - '.storybook/**/*.{ts,tsx}'
    - '*.config.ts'
description:
    Ensure TypeScript files adhere to strict linting rules and maintain code quality.
---

## Finishing a task

- When done with a task or before committing, run `npm run format` followed by `npm run agent-checks` to fix most code
  style issues and identify code quality/smell issues.
- Any code quality issues reported must be fixed.
