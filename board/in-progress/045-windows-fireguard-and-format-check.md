# 045 — Make fireguard and format:check work on Windows

Two delivery gates break on the developer's Windows 11 checkout. CI only runs
on Linux, so neither shows up there. Found while delivering 044.

- `npm run fireguard` crashes with `Error: spawn npx ENOENT`.
  `fireguard/src/processAdapters.ts` spawns the configured `testCommand`
  (`npx jest --runTestsByPath`) with `shell: false`. On Windows `npx` is
  `npx.cmd`, which Node will not spawn without a shell. The missing `error`
  listener also turns the failure into an unhandled exception instead of a
  gate result.
- `npm run format:check` flags every file. `.prettierrc` sets
  `"endOfLine": "lf"`, but `.gitattributes` is `* text=auto`, so a
  `core.autocrlf=true` checkout is CRLF. `npm run format` then rewrites every
  file, although the content diff is empty.

Fix without opening a shell (test file paths come from `git diff`) and without
relaxing any gate.

## Acceptance criteria

- [ ] On win32, fireguard runs `npx <bin> …` as `node <package bin script> …` with `shell: false` when `<bin>` is installed in the workspace's `node_modules`; other platforms and other commands are unchanged — unit-tested with an injected platform
- [ ] A test command that cannot be spawned produces a failed `RunOnceResult` with the spawn error, not an unhandled `error` event — unit-tested
- [ ] `.gitattributes` checks text files out with LF (`eol=lf`); the index needs no renormalization
- [ ] In a fresh Windows worktree with no source changes, `npm run format:check` passes and `npm run fireguard` runs to a grade without crashing
- [ ] Full `npm test` passes; lint, type-check, deadcode and diff-coverage pass with no rule or threshold relaxed
