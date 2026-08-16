# EPIC: Palworld dedicated-server mod manager

Add an in-app **Mod Manager** for Palworld dedicated servers: pick a downloaded
`.zip`, detect the correct install destination from the archive layout (and
official `Info.json` workshop packages), extract files, record every change,
auto-enable the mod, support soft disable, and hard-remove with restore of any
overwritten originals stored as SQLite BLOBs.

**Official Palworld research (Pocketpair / docs.palworldgame.com, 1.0.x):**

- Server-side mods are officially supported on **Windows** dedicated servers only.
- Preferred flow: stage packages under `Mods/Workshop/<folder>/` with root
  `Info.json`, then activate `PackageName` via `Mods/PalModSettings.ini`
  (`bGlobalEnableMod=true`, one `ActiveModList=<PackageName>` per mod). Restart
  deploys per `InstallRule` (`IsServer: true` required for server packages).
- Official rule types deploy to:
  - UE4SS → `Mods/NativeMods/UE4SS`
  - Lua → `Mods/NativeMods/UE4SS/Mods/{PackageName}`
  - PalSchema → `Mods/NativeMods/UE4SS/Mods/PalSchema/mods/{PackageName}`
  - LogicMods → `Pal/Content/Paks/LogicMods`
  - Paks → `Pal/Content/Paks/~WorkshopMods/{PackageName}`
- Soft disable (official): remove `ActiveModList` entry (optionally keep Workshop
  staging). Hard remove: delete Workshop folder + settings entry after disable.
- Legacy community zips may already contain destination paths (`Pal/...`,
  `Mods/...`, UE4SS under `Pal/Binaries/Win64/...`). The manager must also
  resolve those layouts by inspecting zip entry paths.

**App design:**

- UI: Palworld server card **Mod Manager** button → modal with **Add zip file**,
  per-mod Enable/Disable, and trash (permanent revert).
- Main process owns zip I/O, path resolution, extraction, settings edits, and
  change recording. Renderer uses typed IPC only.
- Persistence: separate `mod-manager.sqlite` under Electron `userData` (user
  runtime data — not the static catalog DB). Overwritten file bytes stored as
  BLOBs; newly created files are recorded by path and soft-disabled via an
  on-disk stash under `userData` so Enable can restore them.
- Zip-slip protected extraction; Palworld-only for v1 (Enshrouded shows no button).

## Acceptance criteria (epic)

- [x] Palworld card exposes **Mod Manager**; modal can import a `.zip`, list mods, enable/disable, and trash
- [x] Import resolves destination from zip layout and/or official `Info.json` workshop package; records file changes; auto-enables
- [x] Overwrites store prior file contents as SQLite BLOBs; trash restores them and removes created files / workshop staging / settings entries
- [x] Disable soft-removes the mod from the game; Enable re-applies it
- [x] Unit tests cover resolver, DB, import/disable/remove; IPC/preload typed; docs updated; verification gate + red-team pass

## Sub-tickets

| Id | Title |
|----|-------|
| 040.1 | Zip destination resolver (path + Info.json workshop) |
| 040.2 | Mod-manager SQLite schema + repository (incl. BLOB backups) |
| 040.3 | Import / enable / disable / remove services |
| 040.4 | IPC + preload + typed ElectronAPI |
| 040.5 | Mod Manager modal UI on Palworld ServerCard |
| 040.6 | Docs (README, ARCHITECTURE, DOCUMENTATION_INDEX) |
| 040.7 | Path-deploy multi-mod file collision handling (follow-up) |

## Sub-tickets

### 040.1 — Zip destination resolver

Pure logic: given zip entry paths (+ optional `Info.json` bytes), decide install
kind (`workshop` | `path_deploy`), strip wrapper folders, compute target-relative
paths under the server install root, and extract `PackageName` / display name
when present. Reject empty zips and path-traversal entries.

#### Acceptance criteria

- [x] Unit tests cover workshop `Info.json`, path-rooted `Pal/`/`Mods/` zips, wrapper-folder strip, and zip-slip rejection
- [x] No Electron imports in the resolver module

### 040.2 — Mod-manager SQLite schema + repository

Open/migrate `mod-manager.sqlite` with tables for mods, file changes, and BLOB
backups. Repository CRUD used by import/enable/disable/remove.

#### Acceptance criteria

- [x] Migrations create schema; tests use `:memory:` / temp DB
- [x] Can insert mod + changes + backup blobs and read them back
- [x] Cascade delete cleans changes/backups when a mod row is deleted

### 040.3 — Import / enable / disable / remove services

Orchestrate dialog/zip read → resolve → extract/stage → record → auto-enable;
disable soft-removes; enable re-applies; remove permanently reverts using the
change log + BLOBs.

#### Acceptance criteria

- [x] Import of fixture zips into a temp install tree records changes and enables
- [x] Overwrite path stores original bytes in SQLite and trash restores them
- [x] Workshop import stages under `Mods/Workshop/...` and updates `PalModSettings.ini`
- [x] Disable removes from game; Enable restores; trash leaves no mod files/settings entries

### 040.4 — IPC + preload + typed ElectronAPI

Channels: list mods, pick+import zip, set enabled, remove mod. Allowlisted and
mirrored in `IpcInvokeMap` / preload / tests.

#### Acceptance criteria

- [x] Channels registered and allowlisted; ipc/preload tests updated
- [x] Handlers gate to Palworld app id (or clear error for others)

### 040.5 — Mod Manager modal UI

**Mod Manager** button on Palworld cards opens a modal: list, Add zip file,
enable/disable toggle, trash control, status/errors.

#### Acceptance criteria

- [x] Button visible only for Palworld; modal matches existing admin modal patterns
- [x] Renderer tests cover open/list/import/disable/remove wiring with mocked IPC

### 040.6 — Docs

Document the feature, IPC, and mod-manager DB in README / ARCHITECTURE /
DOCUMENTATION_INDEX as needed.

#### Acceptance criteria

- [x] Docs mention Mod Manager + Windows-server caveat for official loader
- [x] ARCHITECTURE IPC table and file layout updated
