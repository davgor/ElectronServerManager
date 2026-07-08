# EPIC: Config editor quality

`ConfigEditor.tsx` is ~595 lines with recursive rendering. All leaf values are edited as strings, losing number/boolean types on save. Array item keys use `Date.now()` + `Math.random()` causing unnecessary remounts.

**Code review findings:**
- `updateConfigAtPath` always stores string values from text inputs
- Unstable React keys: `key={\`${pathStr}.${Date.now()}.${Math.random()...}\`}`
- No delete-property support (only add)
- INI parsing logic duplicated between main (`iniConfig` after 002.1) and editor concerns
- `deepClone` via `JSON.parse(JSON.stringify())` drops undefined and breaks some INI round-trips

## Sub-tickets

| Id | Title |
|----|-------|
| 007.1 | Fix unstable React keys in array rendering |
| 007.2 | Preserve value types on edit (number, boolean) |
| 007.3 | Add delete-property support |
| 007.4 | Add ConfigEditor unit tests |

## Acceptance criteria (epic)

- [ ] Config round-trip preserves types for JSON configs
- [ ] No remount flicker when editing array items
- [ ] Users can remove properties they added
- [ ] ConfigEditor has meaningful test coverage
