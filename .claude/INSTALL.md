# everything-claude-code — install notes

Source: <https://github.com/WorldFlowAI/everything-claude-code>
Vendored at commit `432485ba6b92c14fb357276a98957f348bcff9ee` (2026-01-23).

Installed **into the repo** rather than into `~/.claude/`, so the setup travels
with the project and survives ephemeral/cloud sessions. Everything below is
committed, so any Claude Code session opened on this repo picks it up.

## What is here

| Path | What it does |
| --- | --- |
| `agents/` | 9 subagents (planner, architect, tdd-guide, code-reviewer, security-reviewer, build-error-resolver, e2e-runner, refactor-cleaner, doc-updater) |
| `commands/` | 15 slash commands (`/plan`, `/tdd`, `/code-review`, …) |
| `skills/` | 11 skills — workflow definitions and domain knowledge |
| `rules/` | 8 always-follow guideline documents, referenced from the root `CLAUDE.md` |
| `contexts/` | dev / review / research system-prompt contexts |
| `hooks/` | Upstream `hooks.json` (reference) + `optional-strict-hooks.json` (held back, see below) |
| `scripts/` | Cross-platform Node hook implementations and the package-manager setup script |
| `tests/` | Upstream test suite — `node .claude/tests/run-all.js` (62 tests, all passing here) |
| `mcp-configs/` | Example MCP server definitions — **not** wired up; API keys are placeholders |
| `examples/` | Upstream example configs and sample session files |
| `settings.json` | The active hook configuration |
| `package-manager.json` | Pinned to `npm` for this repo |
| `UPSTREAM-README.md`, `UPSTREAM-WORLDFLOWAI.md` | Upstream docs, kept for reference |

## Local fixes on top of upstream

- `skills/eval-harness`, `skills/verification-loop` and
  `skills/project-guidelines-example` shipped without YAML frontmatter, so Claude
  Code would not have discovered them. A `name`/`description` block was added to
  each; the body is untouched. Re-apply this after any upstream update.
- `settings.json` paths point at `${CLAUDE_PROJECT_DIR}/.claude` (see below).
- `package-manager.json` is pinned to `npm`; upstream ships `bun`.

## Hooks

`settings.json` is generated from the upstream `hooks/hooks.json`, with
`${CLAUDE_PLUGIN_ROOT}` rewritten to `${CLAUDE_PROJECT_DIR}/.claude` because the
scripts live in the repo instead of a plugin directory.

Active:

- `SessionStart` → load prior session context, detect package manager
- `PreCompact` / `SessionEnd` → persist session state to `~/.claude/sessions/`
- `SessionEnd` → evaluate the session for extractable patterns
- `PreToolUse` on Edit/Write → suggest manual compaction at intervals
- `PreToolUse` on long-running Bash → tmux reminder (stderr only)
- `PreToolUse` on `git push` → review reminder (stderr only)
- `PostToolUse` on Bash → log the PR URL after `gh pr create`
- `PostToolUse` on `.ts`/`.tsx` edits → `tsc --noEmit`, filtered to the edited file
- `PostToolUse` on JS/TS edits + `Stop` → warn about `console.log`

Held back in `hooks/optional-strict-hooks.json`, because each one fights this repo:

1. **Block dev servers outside tmux** — hard-fails `npm run dev`; tmux is not
   available in every environment this repo is worked on.
2. **Block creation of `.md` files** other than README/CLAUDE/AGENTS/CONTRIBUTING —
   this repo keeps real documentation in `docs/`, which the hook would refuse to write.
3. **Auto-format with Prettier after edits** — Prettier is not a dependency here,
   so every edit would trigger an `npx` download.

To enable any of them, move the entry from `hooks/optional-strict-hooks.json`
into the matching event array in `settings.json`.

## MCP servers

`mcp-configs/mcp-servers.json` is a catalogue, not an active config. To use one,
copy the entry into `~/.claude.json` (or a `.mcp.json`) and replace the
`YOUR_*_HERE` placeholders. Do not commit real keys.

## Updating

```bash
git clone --depth 1 https://github.com/WorldFlowAI/everything-claude-code /tmp/ecc
for d in agents commands skills rules contexts hooks scripts mcp-configs tests examples; do
  rm -rf ".claude/$d" && cp -r "/tmp/ecc/$d" ".claude/$d"
done
```

Then re-apply the two local adjustments: rewrite `${CLAUDE_PLUGIN_ROOT}` to
`${CLAUDE_PROJECT_DIR}/.claude` in `settings.json`, and re-check the held-back
hooks above.

## Alternative: install as a plugin instead

If you would rather track upstream live than vendor it, drop `.claude/` and add
this to your `~/.claude/settings.json`:

```json
{
  "extraKnownMarketplaces": {
    "everything-claude-code": {
      "source": { "source": "github", "repo": "WorldFlowAI/everything-claude-code" }
    }
  },
  "enabledPlugins": { "everything-claude-code@everything-claude-code": true }
}
```

That auto-updates, but it is per-machine and does not survive a fresh cloud
session — which is why the vendored copy is the default here.
