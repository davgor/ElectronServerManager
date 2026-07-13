# 021 — Config search hides non-matching siblings

Searching the Config Editor for a key substring (e.g. `diff` → `Difficulty`) currently keeps every sibling property under the same nested object for “context”. Large sections like Palworld `OptionSettings` therefore still show unrelated keys (`RandomizerType`, `RandomizerSeed`, …). Search should keep only matching leaves (and ancestors needed to reach them).

## Acceptance criteria

- [x] Nested leaf key/value matches do not retain non-matching sibling properties in `filterConfigTree`
- [x] Ancestors of matches still appear and auto-expand while a query is active
- [x] Unit tests cover a Palworld-like nested object where only the matching key remains (e.g. `Difficulty` for query `diff`)
- [x] Existing `configSearch` / `ConfigEditor` tests updated for strict sibling filtering
- [x] `npm run lint`, `npm run format:check`, `npm test`, `npm run type-check`, `npm run build` pass
