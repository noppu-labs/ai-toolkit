# Investigate toolkit

Investigation skills, installed as the `investigate` plugin of this marketplace
(`/plugin install investigate@ai-toolkit`, or `npx skills add noppu-labs/ai-toolkit/investigate`
for other harnesses).

| Skill | Purpose |
| --- | --- |
| `investigate:brief` | Computes a structural brief for a path before anyone reads code: callers, wiring, blast radius, installed third-party versions, and version-checked doc sources. No LLM is involved. |
| `investigate:deep` | The full investigation of a service, module, or feature. It builds the brief, runs two independent passes from it, and trusts their intersection. |
| `investigate:spec` | Reviews a spec, ticket, or plan claim by claim against the codebase, using the same brief and two passes. |

## Claude Code

```text
/plugin marketplace add noppu-labs/ai-toolkit
/plugin install investigate@ai-toolkit
```

Skills are namespaced after install, for example `investigate:brief`.

## OpenCode

The same skills ship as the OpenCode plugin `@noppu-labs/opencode-investigate`. It targets OpenCode V2.

Install it with the plugin command, or list it under `plugins` in your OpenCode config:

```bash
opencode plugin add @noppu-labs/opencode-investigate
```

```json
{
  "plugins": ["@noppu-labs/opencode-investigate"]
}
```

Update with `opencode plugin update`.

Invoke a skill with `@investigate-<skill>`, for example `@investigate-deep`, or pick one from
`/skills`. The ids are `investigate-brief`, `investigate-deep`, and `investigate-spec`.

By default the brief sends the names of up to 12 imported, non-dev packages to context7.com,
anonymously unless `CONTEXT7_API_KEY` is set; pass `--no-docs` to skip that call.

The brief script needs Node 20 or later and git on `PATH`. Documentation lookups use whatever
context7 tool the harness provides and fall back to the installed source when there is none.

`npx skills add` also reaches OpenCode, but it leaves `${CLAUDE_PLUGIN_ROOT}` unresolved, so the
npm plugin is the supported route there.
