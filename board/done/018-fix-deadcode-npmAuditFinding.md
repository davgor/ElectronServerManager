# 018 — Fix deadcode: unexport NpmAuditFinding

`ts-prune` / CI deadcode gate fails on `src/security/npmAuditFindings.ts` exporting `NpmAuditFinding`, which is only used inside that module.

## Acceptance criteria

- [x] `NpmAuditFinding` is not an unused export
- [x] `npm run deadcode` / CI deadcode filter reports no findings
- [x] `npm test` still passes for audit finding tests
