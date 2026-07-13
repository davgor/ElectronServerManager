# Documentation index

Maintained docs for Steam Server Manager. Prefer these over anything under
`docs/archive/`.

## Start here

| Doc | Purpose |
|-----|---------|
| [README.md](README.md) | Features, setup, scripts, board overview |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Process model, IPC channels, file layout, stack versions |
| [docs/ADDING_SERVERS.md](docs/ADDING_SERVERS.md) | Extend the Steam dedicated-server catalog |

## Project process

| Doc | Purpose |
|-----|---------|
| [`.ai-instructions.md`](.ai-instructions.md) | Mandatory lint/format workflow after code changes |
| [`board/`](board/) | Ticket board (`backlog` → `in-progress` → `done`) |
| [`.claude/skills/delivery-standards/SKILL.md`](.claude/skills/delivery-standards/SKILL.md) | TDD + verification gate |
| [`.claude/skills/complete-ticket/SKILL.md`](.claude/skills/complete-ticket/SKILL.md) | How agents complete board tickets |

## Archive

Historical snapshots (often wrong vs current code) live in
[docs/archive/](docs/archive/). Do not treat them as authoritative.

| Archived file | Why archived |
|---------------|--------------|
| [`docs/archive/GETTING_STARTED.md`](docs/archive/GETTING_STARTED.md) | Overlaps README; stale structure / emoji tour |
| [`docs/archive/QUICKSTART.md`](docs/archive/QUICKSTART.md) | Overlaps README scripts section |
| [`docs/archive/IMPLEMENTATION_SUMMARY.md`](docs/archive/IMPLEMENTATION_SUMMARY.md) | One-off “what we built” note; wrong server count |
| [`docs/archive/CODE_REFERENCE.md`](docs/archive/CODE_REFERENCE.md) | Stale snippets and obsolete catalog IDs |
| [`docs/archive/STEAM_DETECTION.md`](docs/archive/STEAM_DETECTION.md) | Superseded by ARCHITECTURE + ADDING_SERVERS |

## Versioning note

Stack versions and catalog size must match `package.json` and
`src/main/steamDetection.ts`. When those change, update README and ARCHITECTURE
in the same change set.
