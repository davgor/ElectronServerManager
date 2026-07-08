# EPIC: Engineering delivery standards (agent skills)

Codify standing engineering process so every agent-led implementation in this repo follows the same bar: **TDD-first**, **lint + unit tests + build verified before done**, and **board traceability** (create or update a ticket/epic).

Mirrors the skills workflow from [AI-DND-Matrix](https://github.com/davgor/AI-DND-Matrix). Relates to `.ai-instructions.md`, `ARCHITECTURE.md`, and the existing [complete-ticket](.claude/skills/complete-ticket/SKILL.md) skill (ticket-scoped work). This epic adds a **default delivery skill** for ad-hoc requests, bug fixes, and follow-ups that are not explicitly framed as "complete ticket NNN.M".

## Acceptance criteria

- [x] `delivery-standards` skill exists under `.cursor/skills/delivery-standards/SKILL.md` and `.claude/skills/delivery-standards/SKILL.md`
- [x] `complete-ticket` skill exists under `.cursor/skills/complete-ticket/SKILL.md` and `.claude/skills/complete-ticket/SKILL.md`
- [x] `collapse-epic` skill exists under `.cursor/skills/collapse-epic/SKILL.md` and `.claude/skills/collapse-epic/SKILL.md`
- [x] Skills state TDD-first, `npm test` + `npm run lint` + `npm run format:check` + `npm run type-check` + build gate, and board ticket/epic update requirements
- [x] Skills reference ESLint (not oxlint), Jest (not Vitest), and this repo's `src/main/` / `src/renderer/` / IPC boundaries
- [x] `.cursor/rules/delivery-standards.mdc` exists with `alwaysApply: true` pointing at the skill
- [x] `/board` directory structure exists (`backlog/`, `in-progress/`, `done/`)
- [x] This epic file documents the policy on `/board`
