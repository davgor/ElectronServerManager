# EPIC: Admin button refreshes REST status after config save

When a user enables `RESTAPIEnabled` (or disables it) in Edit Config and saves, the Palworld Admin button should update immediately without requiring an app restart. Today the card only checks REST status on mount.

## Acceptance criteria

- [x] After saving Palworld config, ServerCard re-fetches REST status via `getPalworldRestStatus`
- [x] Enabling REST API in config enables the Admin button without app reboot
- [x] Disabling REST API in config disables the Admin button without app reboot
- [x] Unit test covers re-fetch / button enable after config revision bump
- [x] `npm run lint`, `npm run format:check`, `npm test`, `npm run type-check` pass
