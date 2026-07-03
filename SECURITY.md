# Security Policy

## Reporting a vulnerability

Report suspected vulnerabilities privately via
[GitHub private vulnerability reporting](https://github.com/noppu-labs/ai-toolkit/security/advisories/new);
please don't open a public issue. Include enough detail to reproduce: the affected plugin,
skill, or workflow, and the impact. You can expect an initial response within a week.

## Scope

This repository ships plugin content (skills, rules, agents) and the CI that releases it. In
scope:

- Malicious or unsafe guidance in skill/rule content (e.g. instructions that would lead an
  agent to exfiltrate data or run destructive commands).
- The release pipeline: tagging, tarball builds, and provenance attestations.
- The skill sync tooling in `scripts/`.

Skills vendored from upstream repos carry their provenance in each plugin's
`skills-lock.json`; issues that originate upstream are worth reporting there as well.

## Verifying releases

Release tarballs carry GitHub build provenance attestations; see
[Verifying releases](README.md#verifying-releases).
