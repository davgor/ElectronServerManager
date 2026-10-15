# 044 — Close the mod-manager DB so Windows tests can clean up

On Windows, all 6 tests in `src/__tests__/main/mods/modManagerIpc.test.ts`
fail in `afterEach` with `EPERM, Permission denied` when
`fs.rmSync(userData, { recursive: true, force: true })` deletes the temp
`mod-userdata-*` folder. `initModManager` opens `mod-manager.sqlite` with
better-sqlite3 and keeps the handle in a module singleton, and there is no way
to close it. Windows refuses to delete an open file; Linux CI does not, so this
never showed up in CI. Pre-existing on `main` (found while verifying epic 042).

Add a production-safe `closeModManager()` that closes the DB handle and clears
the singletons, and call it from the test before deleting the folder. Do not
swallow the `rmSync` error in the test.

## Acceptance criteria

- [ ] `closeModManager()` closes the SQLite handle opened by `initModManager` (a repository obtained before closing throws on use afterwards) — unit-tested
- [ ] After `closeModManager()`, `getModRepository()` and `getModManagerPaths()` throw "not been initialized" — unit-tested
- [ ] `closeModManager()` is a no-op when the mod manager is not initialized, and `initModManager` works again after it — unit-tested
- [ ] `modManagerIpc.test.ts` calls `closeModManager()` before removing the temp folder; `npx jest src/__tests__/main/mods/modManagerIpc.test.ts` passes on Windows
- [ ] `.eslintrc.json` sets `"root": true` so a worktree nested under `.claude/worktrees/` with its own `node_modules` does not also load the parent checkout's config (ESLint "couldn't determine the plugin \"react\" uniquely", which blocked `npm run lint` and the pre-commit hook); no rule changed
- [ ] Full `npm test` has no new failures; lint, format, type-check, deadcode, diff-coverage and fireguard gates pass with no lint rule relaxed
