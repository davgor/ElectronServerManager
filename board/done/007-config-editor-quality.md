# EPIC: Config editor quality

`ConfigEditor.tsx` is ~595 lines with recursive rendering. All leaf values are edited as strings, losing number/boolean types on save. Array item keys use `Date.now()` + `Math.random()` causing unnecessary remounts.

**Code review findings:**
- `updateConfigAtPath` always stores string values from text inputs
- Unstable React keys: `key={\`${pathStr}.${Date.now()}.${Math.random()...}\`}`
- No delete-property support (only add)
- INI parsing logic duplicated between main (`iniConfig` after 002.1) and editor concerns
- `deepClone` via `JSON.parse(JSON.stringify())` drops undefined and breaks some INI round-trips

## Acceptance criteria (epic)

- [x] Config round-trip preserves types for JSON configs
- [x] No remount flicker when editing array items
- [x] Users can remove properties they added
- [x] ConfigEditor has meaningful test coverage

## Sub-tickets

| Id | Title |
|----|-------|
| 007.1 | Fix unstable React keys in array rendering |
| 007.2 | Preserve value types on edit (number, boolean) |
| 007.3 | Add delete-property support |
| 007.4 | Add ConfigEditor unit tests |

### 007.1 — Fix unstable React keys in array rendering

Replace `Date.now()` + `Math.random()` keys with stable index-based keys for primitive array items.

**Origin:** Code review — ConfigEditor.tsx line ~337.

#### Acceptance criteria

- [x] Array primitive items use `key={\`${pathStr}.${idx}\`}`
- [x] Editing an array item does not remount sibling inputs
- [x] `ConfigEditor.test.tsx` verifies stable re-render behavior
- [x] `npm test`, `npm run lint` pass

### 007.2 — Preserve value types on config edit

Detect original value type and render appropriate input (checkbox for boolean, number input for numbers). Coerce on save to match original schema.

**Origin:** Code review — all values edited as strings.

#### Acceptance criteria

- [x] Boolean fields render as checkboxes; numbers as `type="number"`
- [x] Save produces correct JSON types (not stringified numbers/booleans)
- [x] Tests cover boolean and number round-trip for Enshrouded JSON config
- [x] `npm test`, `npm run lint` pass

### 007.3 — Add delete-property support in ConfigEditor

Allow removing properties from objects (with confirmation for top-level keys). Wire to `updateConfigAtPath` delete helper.

**Origin:** Code review — add-only property editing.

#### Acceptance criteria

- [x] Each property row has a delete control (or context action)
- [x] Deleting nested properties updates config state correctly
- [x] Save persists deletion to disk
- [x] Tests cover delete + save flow
- [x] `npm test`, `npm run lint` pass

### 007.4 — Add ConfigEditor unit tests

No tests exist for `ConfigEditor.tsx`. Add coverage for load, edit, save, error states, and open-in-default.

**Origin:** Code review — test coverage gap.

#### Acceptance criteria

- [x] `src/__tests__/renderer/ConfigEditor.test.tsx` exists with ≥5 meaningful tests
- [x] Mocks typed IPC for get/save config
- [x] `npm test`, `npm run lint` pass
