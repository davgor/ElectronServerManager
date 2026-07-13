# 024 — Themed discrete scrollbar

Replace the default OS scrollbar with a thin, low-contrast scrollbar that matches the Steam-inspired dark blue theme (#1b2838 / #2a3f5f / #00a8ff) across the app (main list, config editor, modals, console output).

## Acceptance criteria

- [x] Global scrollbar styles live in `src/renderer/index.css` so every scrollable surface inherits them
- [x] Scrollbar is thin and low-contrast against the dark theme; thumb becomes slightly more visible on hover
- [x] Unit test asserts the global CSS includes webkit + Firefox scrollbar rules
- [x] `npm test`, `npm run lint`, `npm run format:check`, `npm run type-check`, and `npm run build` pass
