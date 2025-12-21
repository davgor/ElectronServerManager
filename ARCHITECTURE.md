# Architecture Diagram - Steam Server Manager

## Application Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         ELECTRON APP                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              MAIN PROCESS (Node.js)                     │   │
│  │          (src/main/main.ts)                             │   │
│  │                                                         │   │
│  │  ┌─────────────────────────────────────────────────┐   │   │
│  │  │ IPC Handler: 'get-steam-servers'                │   │   │
│  │  │                                                 │   │   │
│  │  │ Calls: findInstalledServers()                  │   │   │
│  │  └──────────────────┬──────────────────────────────┘   │   │
│  │                     │                                   │   │
│  │  ┌──────────────────▼──────────────────────────────┐   │   │
│  │  │  src/main/steamDetection.ts                    │   │   │
│  │  │                                                 │   │   │
│  │  │  1. findSteamPath()                             │   │   │
│  │  │     ├─ Windows: Registry lookup                │   │   │
│  │  │     ├─ macOS: ~/Library/Application Support   │   │   │
│  │  │     └─ Linux: ~/.steam/steam                  │   │   │
│  │  │                                                 │   │   │
│  │  │  2. parseLibraryFolders()                       │   │   │
│  │  │     └─ Read libraryfolders.vdf                │   │   │
│  │  │                                                 │   │   │
│  │  │  3. Loop through STEAM_DEDICATED_SERVERS       │   │   │
│  │  │     └─ Check for appmanifest_*.acf files      │   │   │
│  │  │                                                 │   │   │
│  │  │  4. isProcessRunning()                          │   │   │
│  │  │     └─ Check if server process is active      │   │   │
│  │  │                                                 │   │   │
│  │  │  Returns: SteamServer[]                         │   │   │
│  │  └──────────────────┬──────────────────────────────┘   │   │
│  │                     │                                   │   │
│  │  Stores as JSON and returns via IPC                    │   │
│  └─────────────────────┬───────────────────────────────────┘   │
│                        │                                         │
│  ┌─────────────────────▼───────────────────────────────────┐   │
│  │  RENDERER PROCESS (React + TypeScript)                 │   │
│  │  (src/renderer/App.tsx)                                │   │
│  │                                                         │   │
│  │  ┌─────────────────────────────────────────────────┐   │   │
│  │  │ App Component (React Hooks)                     │   │   │
│  │  │                                                 │   │   │
│  │  │ State:                                          │   │   │
│  │  │  - servers: SteamServer[]                       │   │   │
│  │  │  - loading: boolean                             │   │   │
│  │  │  - error: string | null                         │   │   │
│  │  │                                                 │   │   │
│  │  │ useEffect(() => {                              │   │   │
│  │  │   fetchServers()  // Called on mount            │   │   │
│  │  │ })                                              │   │   │
│  │  │                                                 │   │   │
│  │  │ fetchServers():                                 │   │   │
│  │  │   window.electron.ipcRenderer.invoke(           │   │   │
│  │  │     'get-steam-servers'                         │   │   │
│  │  │   )                                             │   │   │
│  │  │                                                 │   │   │
│  │  └─────────────────────────────────────────────────┘   │   │
│  │                                                         │   │
│  │  ┌─────────────────────────────────────────────────┐   │   │
│  │  │ UI Rendering (App.css)                          │   │   │
│  │  │                                                 │   │   │
│  │  │ [Loading State]                                 │   │   │
│  │  │ OR                                              │   │   │
│  │  │ [Server Count Badge]                            │   │   │
│  │  │ ┌───────────┐ ┌───────────┐ ┌──────────┐        │   │   │
│  │  │ │ Server 1  │ │ Server 2  │ │ Server 3 │ ...    │   │   │
│  │  │ │ Running✓  │ │ Stopped✗  │ │Running✓  │        │   │   │
│  │  │ │ App 1391  │ │ App 4940  │ │ App 258  │        │   │   │
│  │  │ └───────────┘ └───────────┘ └──────────┘        │   │   │
│  │  │ [Refresh Button]                                │   │   │
│  │  │                                                 │   │   │
│  │  └─────────────────────────────────────────────────┘   │   │
│  │                                                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

## IPC Communication Bridge

```
┌──────────────────────────────────────────────────────────┐
│  src/preload/preload.ts (Context Bridge)                │
├──────────────────────────────────────────────────────────┤
│                                                           │
│  Exposes window.electron.ipcRenderer to Renderer        │
│                                                           │
│  Methods:                                                │
│  ├─ send(channel, ...args)                              │
│  ├─ on(channel, callback)                               │
│  ├─ once(channel, callback)                             │
│  └─ invoke(channel, ...args) → Promise<unknown>         │
│                                                           │
│  ✅ Secure: Context isolation enabled                   │
│  ✅ Type-safe: Full TypeScript support                  │
│  ✅ Events: Node integration disabled                   │
│                                                           │
└──────────────────────────────────────────────────────────┘
```

## Data Flow Diagram

```
User opens app
    │
    ├─→ Electron creates BrowserWindow
    │
    ├─→ Loads http://localhost:5173 (dev) or static HTML (prod)
    │
    ├─→ React mounts App component
    │
    ├─→ useEffect hook fires
    │
    ├─→ Calls: window.electron.ipcRenderer.invoke('get-steam-servers')
    │
    ├─→ Message sent via IPC to Main process
    │
    ├─→ Main process receives 'get-steam-servers' handler
    │
    ├─→ Executes findInstalledServers()
    │   │
    │   ├─ Find Steam installation path
    │   ├─ Determine current platform (Windows/macOS/Linux)
    │   ├─ Load library folder locations
    │   ├─ Loop through 15 known server app IDs
    │   ├─ Check if appmanifest file exists
    │   ├─ Check if process is running
    │   └─ Build SteamServer[] array
    │
    ├─→ Main process returns: { success, servers, error }
    │
    ├─→ React receives response via Promise
    │
    ├─→ State updates: setServers(result.servers)
    │
    └─→ Component re-renders with server list
```

## File Organization

```
src/
├── main/
│   ├── main.ts
│   │   └─ Electron app lifecycle
│   │   └─ BrowserWindow creation
│   │   └─ IPC handler registration
│   │   └─ Menu setup
│   │
│   └── steamDetection.ts
│       ├─ Steam path finding (OS-specific)
│       ├─ Library folder parsing
│       ├─ Server manifest detection
│       ├─ Process status checking
│       └─ Main export: findInstalledServers()
│
├── renderer/
│   ├── main.tsx
│   │   └─ React app initialization
│   │   └─ ReactDOM.createRoot()
│   │
│   ├── App.tsx
│   │   ├─ useState: servers, loading, error
│   │   ├─ useEffect: fetch servers on mount
│   │   ├─ Conditional rendering:
│   │   │   ├─ Loading state
│   │   │   ├─ Error state with retry
│   │   │   ├─ Empty state
│   │   │   └─ Server grid display
│   │   └─ Refresh button click handler
│   │
│   ├── App.css
│   │   ├─ .app - Main container
│   │   ├─ .container - Content wrapper
│   │   ├─ .loading - Loading spinner style
│   │   ├─ .error - Error message style
│   │   ├─ .no-servers - Empty state style
│   │   ├─ .servers - Grid container
│   │   ├─ .server-card - Individual card
│   │   ├─ .status - Running/Stopped badge
│   │   └─ .refresh-section - Button container
│   │
│   └── index.css
│       └─ Global reset and layout
│
├── preload/
│   └── preload.ts
│       ├─ Import contextBridge from electron
│       ├─ Export ipcRenderer methods
│       ├─ Maintain security (context isolation)
│       └─ Expose window.electron to renderer
│
└── types/
    └── electron.d.ts
        ├─ SteamServer interface
        ├─ ElectronAPI interface
        └─ Global window type declaration
```

## Technology Stack

```
┌─────────────────────────────────────────┐
│        STEAM SERVER MANAGER              │
├─────────────────────────────────────────┤
│                                          │
│  Frontend:                               │
│  ├─ React 18                             │
│  ├─ TypeScript 5.3                       │
│  ├─ Vite 5.0 (fast HMR)                  │
│  └─ CSS Grid + Flexbox                   │
│                                          │
│  Backend:                                │
│  ├─ Electron 27                          │
│  ├─ Node.js APIs                         │
│  ├─ Child Process (process detection)    │
│  └─ File System (manifest parsing)       │
│                                          │
│  IPC:                                    │
│  ├─ Main ↔ Renderer via ipcMain/invoke   │
│  ├─ Preload script for security          │
│  └─ Context isolation enabled            │
│                                          │
│  Build:                                  │
│  ├─ Electron Builder for packaging       │
│  ├─ TypeScript compilation                │
│  └─ Vite bundling for React              │
│                                          │
└─────────────────────────────────────────┘
```

## Key Design Decisions

### 1. IPC Handler Pattern

- Uses `ipcMain.handle()` with Promise
- Returns typed response object
- Error handling at application level
- Prevents renderer from accessing Node APIs directly

### 2. Steam Detection Strategy

- Cross-platform compatible (Windows/macOS/Linux)
- Uses OS-specific methods for finding Steam
- Registry lookup for Windows (fast, reliable)
- File system checks for macOS/Linux
- Graceful fallbacks to common paths

### 3. React State Management

- Simple local state (useState)
- Sufficient for current requirements
- Easy to migrate to Redux/Zustand if needed
- Clear separation: loading → error → success

### 4. UI/UX Approach

- Card-based grid layout
- Color-coded status indicators
- Loading/error/empty states
- Responsive mobile-friendly design
- One-click refresh functionality

## Performance Characteristics

```
Initial Scan:
  ├─ Steam path lookup: ~100ms
  ├─ Library folder parsing: ~50ms
  ├─ Manifest file checks (15 apps): ~500ms
  ├─ Process detection: ~300ms
  └─ Total: ~1-2 seconds (typical)

UI Response:
  ├─ Button click → fetch: <1ms
  ├─ Network latency: 0ms (IPC)
  ├─ React render: <100ms
  └─ Total user-perceived time: ~2-3 seconds

Memory Usage:
  ├─ Detection module: <1MB
  ├─ Typical result set: <10KB
  └─ React UI: ~2-5MB (including deps)
```

## Security Considerations

✅ **Context Isolation**: Renderer process isolated from Node.js  
✅ **Preload Script**: Only approved APIs exposed to renderer  
✅ **No Node Integration**: Disabled in webPreferences  
✅ **IPC Validation**: Handler validates input/output  
✅ **Read-Only Operations**: Steam detection is read-only  
✅ **Error Handling**: No sensitive info in error messages

---

This architecture provides a clean separation of concerns while maintaining
security and type safety across the main-renderer boundary.
