---
name: dev-roadmap
description: Use during planning and execution to record architecture decisions and track roadmap state in the local devlog SQLite store. Invoke when finishing a plan, completing implementation work, making a critical architecture decision, or when you need current project state/drift.
---

# Dev-State Log (devlog)

A local SQLite store that records **critical architecture decisions** and tracks a
**roadmap** of features/plans/steps with planned-vs-actual scope, so the team (and future
agents) can see what happened and where execution drifted from the plan.

- Store: `.claude/dev-state/devlog.db` in the current project (gitignore this)
- Committed snapshot: `docs/dev-state/{decisions.md,roadmap.md,state.json,dashboard.html}`
  (auto-regenerated on every write)
- Dashboard: open `docs/dev-state/dashboard.html` directly in a browser (no server
  needed) for a Kanban view of the roadmap and a searchable decision log.
- CLI: `node ${CLAUDE_PLUGIN_ROOT}/scripts/devlog.ts <command>` (source: `scripts/devlog.ts`)

The SessionStart hook injects current open roadmap + recent decisions into context
automatically, so you usually start a session already aware of state. Run
`node ${CLAUDE_PLUGIN_ROOT}/scripts/devlog.ts status` any time you need the full picture.

## When to write (the contract)

### Plan agents — after a plan is approved
1. Add one roadmap item per major feature or implementation step:
   ```
   node ${CLAUDE_PLUGIN_ROOT}/scripts/devlog.ts roadmap add --title "<step>" --category step \
     --plan-ref "<plan-filename>" --planned-scope "<what this step should deliver>"
   ```
   Use `--category feature` for the umbrella item and `--parent <id>` to nest steps under it.
2. Log any critical architecture decision the plan commits to:
   ```
   node ${CLAUDE_PLUGIN_ROOT}/scripts/devlog.ts decision add --title "<decision>" --decision "<what>" \
     --rationale "<why>" --consequences "<tradeoffs>" --plan-ref "<plan-filename>" \
     --author plan-agent
   ```

### Execute agents — while/after implementing
1. Move items as you work:
   ```
   node ${CLAUDE_PLUGIN_ROOT}/scripts/devlog.ts roadmap update <id> --status in_progress --note "started"
   node ${CLAUDE_PLUGIN_ROOT}/scripts/devlog.ts roadmap update <id> --status blocked --blocked-reason "<why>"
   ```
2. On completion, record what actually shipped and any drift:
   ```
   node ${CLAUDE_PLUGIN_ROOT}/scripts/devlog.ts roadmap done <id> \
     --actual-scope "<what was actually delivered>" \
     --variance "<lagging items / what differed from the plan, or 'none'>"
   ```
3. Log decisions made during implementation (`--author execute-agent`).

Each status change writes a `roadmap_history` row — that history is the drift trail, and it
renders as a transition timeline on each card's expanded view in `dashboard.html`.

## Reading state
```
node ${CLAUDE_PLUGIN_ROOT}/scripts/devlog.ts status            # dashboard: in-progress, blocked, drift
node ${CLAUDE_PLUGIN_ROOT}/scripts/devlog.ts roadmap list --tree
node ${CLAUDE_PLUGIN_ROOT}/scripts/devlog.ts roadmap show <id> # full item + transition history
node ${CLAUDE_PLUGIN_ROOT}/scripts/devlog.ts decision list
```
Or open `docs/dev-state/dashboard.html` in a browser for a visual Kanban board plus a
searchable decision log.

## Guidance
- Keep it **critical decisions only** — schema choices, library/runtime picks, security
  boundaries, irreversible tradeoffs. Not routine edits.
- Always set `--plan-ref` to the plan filename so roadmap items link back to their plan.
- Always fill `--variance` on completion (use `none` if there was no drift) — an empty
  variance reads as "not yet reviewed."
- Add `--json` to any read command for machine-readable output.
- The host project should gitignore `.claude/dev-state/devlog.db` and commit `docs/dev-state/`.
