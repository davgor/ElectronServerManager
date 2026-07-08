# EPIC: Test coverage expansion

73 tests pass but coverage gaps exist: no ConfigEditor tests, IPC handlers untested beyond compile checks, React `act()` warnings in App tests, no integration test for auto-restart/auto-update flows.

**Code review findings:**
- `main.test.ts` only checks compiled JS shape — not handler behavior
- `App.test.tsx` emits `act()` warnings on state updates
- No tests for INI round-trip (until 002.1)
- No tests for window control IPC
- Renderer mocks generic `invoke` — won't catch typed API regressions (after 003.x)

## Sub-tickets

| Id | Title |
|----|-------|
| 011.1 | Add IPC handler unit tests (mock Electron) |
| 011.2 | Fix React `act()` warnings in App tests |
| 011.3 | Add integration-style tests for auto-restart detection |

## Acceptance criteria (epic)

- [ ] Every IPC handler has at least one behavioral unit test
- [ ] App tests run without `act()` warnings
- [ ] Coverage report (`npm run test:coverage`) shows main IPC modules >70%
