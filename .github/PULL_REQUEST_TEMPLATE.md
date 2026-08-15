## Summary

<!-- What changed and why (1–3 sentences). -->

## Board

- Ticket(s): <!-- e.g. 037.1 -->

## Verification

- [ ] `npm run lint` / `npm run format:check`
- [ ] `npm test`
- [ ] `npm run fireguard` (when unit tests added/modified) — not F
- [ ] `npm run type-check`
- [ ] `npm run deadcode`
- [ ] `npm run test:diff-coverage`
- [ ] `npm run electron-build` (when main/preload changed)
- [ ] `npm run build` (when renderer/build output affected)

## Red team review (required before merge-ready)

- [ ] Ran `.claude/skills/red-team-review/SKILL.md`
- [ ] Posted review on this PR with `<!-- red-team-review -->`
- [ ] All **Blocking** findings fixed and pushed
- [ ] Completion notes include red-team verdict

Skip only for pure docs typo fixes, or when explicitly waived.
