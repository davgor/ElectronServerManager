# Steam Server Detection Implementation

## Overview

Your Electron application now automatically detects Steam dedicated servers installed on the system when the app starts.

## Changes Made

### 1. **New Files Created**

#### `src/main/steamDetection.ts`

- **Purpose**: Handles all Steam server detection logic
- **Key Functions**:
  - `findSteamPath()`: Locates Steam installation directory (Windows/macOS/Linux)
  - `parseLibraryFolders()`: Parses Steam library configuration to find all library locations
  - `isProcessRunning()`: Checks if a server process is currently running
  - `findInstalledServers()`: Main function that scans for all installed dedicated servers
- **Features**:
  - Cross-platform support (Windows via Registry, macOS/Linux via file paths)
  - Handles multiple Steam library locations
  - Detects every server in the `STEAM_DEDICATED_SERVERS` catalog (currently 2 entries)
  - Checks if each server is currently running

### 2. **Modified Files**

#### `src/main/main.ts`

- Added import for `findInstalledServers` from steamDetection module
- Added new IPC handler: `get-steam-servers`
  - Invoked by React component on app startup
  - Returns array of detected SteamServer objects with error handling

#### `src/renderer/App.tsx`

- **Complete rewrite** to implement server detection UI
- **New Features**:
  - `useEffect` hook to fetch servers on component mount
  - Loading state while scanning for servers
  - Error handling with retry button
  - Grid display of discovered servers
  - Server cards showing:
    - Server name
    - Running/Stopped status
    - App ID
    - Installation path
  - Refresh button to manually rescan

#### `src/renderer/App.css`

- **Complete redesign** for server list display
- **New Styles**:
  - Loading spinner styling
  - Error message styling
  - Server grid layout (responsive)
  - Server card hover effects
  - Status badges (Running/Stopped)
  - Refresh button styling
  - Responsive container with max-width

#### `src/types/electron.d.ts`

- Added `SteamServer` interface definition
- Exported for use in React components
- Maintains type safety across IPC boundary

### 3. **Updated Documentation**

#### `README.md`

- Updated project description to focus on Steam server detection
- Added list of supported Steam dedicated servers
- Included platform-specific implementation details
- Added troubleshooting section
- Instructions for adding new servers

## How It Works

### Detection Flow

1. **App Startup**: User launches the application
2. **Component Mount**: React App component mounts and useEffect runs
3. **IPC Invocation**: Calls `window.electron.ipcRenderer.invoke('get-steam-servers')`
4. **Main Process**:
   - Finds Steam installation path (OS-specific)
   - Parses library folder configuration
   - Scans for manifest files for known server app IDs
   - Checks if each server process is running
5. **Response**: Returns array of SteamServer objects
6. **UI Update**: React component displays discovered servers in a grid

### File Locations Being Scanned

**Windows:**

- Registry lookup: `HKEY_CURRENT_USER\Software\Valve\Steam`
- Manifest files: `steamapps/appmanifest_*.acf`
- Fallback paths: `C:\Program Files (x86)\Steam`, `C:\Program Files\Steam`

**macOS:**

- `~/Library/Application Support/Steam/steamapps/`
- `appmanifest_*.acf` files

**Linux:**

- `~/.steam/steam/steamapps/`
- `appmanifest_*.acf` files

## Supported Steam Servers

The app detects the dedicated servers defined in the `STEAM_DEDICATED_SERVERS`
catalog in `src/main/steamDetection.ts` (currently 2 entries):

| Server                      | App ID  |
| --------------------------- | ------- |
| Enshrouded Dedicated Server | 2278520 |
| Palworld Dedicated Server   | 1623730 |

## Adding New Servers

See [docs/ADDING_SERVERS.md](docs/ADDING_SERVERS.md) for the catalog schema
(including per-platform executable and config path overrides), a step-by-step
guide, and an example entry template.

## Error Handling

The application includes comprehensive error handling:

- **No Steam Installation**: Displays "No Steam dedicated servers found"
- **Permission Errors**: Shows error message with retry button
- **Registry Access (Windows)**: Falls back to common installation paths
- **Missing Library Folders**: Continues with available libraries

## UI Features

### Loading State

- Shows scanning message while detecting servers
- Disables refresh button to prevent multiple simultaneous scans

### Error State

- Displays error message clearly
- Provides retry button for user
- Maintains previous state

### Empty State

- User-friendly message when no servers found
- Suggests installing a Steam dedicated server

### Server Cards

- Responsive grid layout (3 columns on desktop, adjusts for mobile)
- Hover effects for interactivity
- Color-coded status badges:
  - Green for "Running"
  - Red for "Stopped"
- Shows all relevant server information

## Next Steps

To extend the functionality, you can:

1. **Add Server Management**: Add buttons to start/stop/update servers
2. **Persist Favorites**: Save favorite servers for quick access
3. **Server Statistics**: Display player count, uptime, etc.
4. **Configuration Management**: Allow editing server config files
5. **Launch Commands**: Add quick-launch buttons for each server
6. **Notifications**: Alert user when server status changes

## Performance Notes

- Initial scan on app startup (1-2 seconds typically)
- Subsequent refreshes reuse Steam path cache
- Process detection is quick on all platforms
- No blocking operations on main thread
