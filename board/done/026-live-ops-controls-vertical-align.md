# 026 — Live ops controls vertical alignment

The Palworld "Live ops panel" checkbox and "Poll every" interval control sit on the same row but are vertically misaligned. The checkbox reuses `.auto-restart-checkbox`, which carries a standalone `margin-top` meant for ServerCard settings rows, not a flex control strip.

## Acceptance criteria

- [x] "Live ops panel" checkbox and "Poll every" select share the same vertical center in `.palworld-ops-controls`
- [x] Checkbox retains its existing look/spacing when used elsewhere (ServerCard auto-restart rows)
- [x] Unit test asserts ops-controls override clears the checkbox top margin
- [x] `npm run lint`, `npm run format:check`, `npm test`, `npm run type-check`, and `npm run build` pass
