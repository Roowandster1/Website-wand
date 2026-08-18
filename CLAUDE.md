# Website-wand

Elizabeth Wand — Counselling. A public Next.js website plus a private admin
dashboard at `/admin` (clients, diary, session notes, payments, encrypted
backups). One app, one deploy, SQLite in a single file. See `README.md` for the
full tour and `docs/going-live.md` for the launch checklist.

## Working in this repo

- Node >= 20.9, npm (there is a `package-lock.json` — do not switch package managers).
- `npm run dev` / `npm run build` / `npm run lint`. There is no test suite yet.
- All public copy lives in `content/site.ts`. Prefer editing that over hardcoding
  text into components.
- Never commit `.env.local` or anything under `data/` — that is the live database.

## Claude Code toolkit

This repo vendors [everything-claude-code](https://github.com/WorldFlowAI/everything-claude-code)
under `.claude/`. See `.claude/INSTALL.md` for what is installed and how to
update it.

- **Commands**: `/plan`, `/tdd`, `/code-review`, `/build-fix`, `/refactor-clean`,
  `/e2e`, `/verify`, `/checkpoint`, `/learn`, `/eval`, `/test-coverage`,
  `/update-docs`, `/update-codemaps`, `/orchestrate`, `/setup-pm`
- **Agents**: `planner`, `architect`, `tdd-guide`, `code-reviewer`,
  `security-reviewer`, `build-error-resolver`, `e2e-runner`, `refactor-cleaner`,
  `doc-updater`
- **Skills**: `.claude/skills/` — coding standards, backend/frontend patterns,
  TDD workflow, security review, verification loop, continuous learning
- **Rules**: `.claude/rules/` — reference guidelines for security, coding style,
  testing, git workflow, agent delegation and performance. Treat them as the
  house style. Two of them do not match this repo as it stands: the 80% coverage
  requirement in `testing.md` is aspirational (no test framework is set up), and
  `agents.md` describes agents by their `~/.claude/agents/` paths, which here
  live in `.claude/agents/`.
