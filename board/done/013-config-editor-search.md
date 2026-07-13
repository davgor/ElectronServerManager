# 013 — Config editor search

Add a search box in the Config Editor modal so users can quickly find a setting by name or value. Filters the in-memory property tree (no new IPC); auto-expands ancestors of matches while a query is active.

## Acceptance criteria

- [x] Search input is visible in the Config Editor properties header (`aria-label="Search settings"`)
- [x] Typing a query filters the tree to matching keys and values (case-insensitive substring)
- [x] Ancestors of matches auto-expand while a query is active
- [x] Clearing search restores the full tree without collapsing prior expand state
- [x] Empty query results show a “No settings match …” message
- [x] `configSearch` unit tests cover empty query, key match, value match, nested ancestors, case-insensitivity, no-match, and array elements
- [x] `ConfigEditor` component tests cover filter, value match, clear, and empty state
- [x] `npm run lint`, `npm run format:check`, `npm test`, `npm run type-check`, `npm run build` pass
