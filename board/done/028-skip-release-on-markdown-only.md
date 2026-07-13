# 028 — Skip release when only markdown files change

Docs, board tickets, and other `.md`-only pushes to `main` should not cut a new app version or publish release artifacts.

## Acceptance criteria

- [x] Release workflow does not run for pushes that change only `*.md` files (`paths-ignore`)
- [x] `shouldRunRelease` treats a non-empty markdown-only `changedFiles` list as skip (except `workflow_dispatch`)
- [x] Unit tests cover markdown-only vs mixed/empty changed files
- [x] `npm run lint`, `npm run format:check`, `npm test`, `npm run type-check` pass
