# Code Reference Guide

## Quick Reference for Key Components

### 1. Steam Detection Module

**File:** `src/main/steamDetection.ts`

The core module that handles all Steam server detection.

**Main Export Function:**

```typescript
export async function findInstalledServers(): Promise<SteamServer[]>;
```

**Key Functions:**

- `findSteamPath()` - Locates Steam installation
- `parseLibraryFolders(steamPath)` - Gets all library locations
- `isProcessRunning(processName)` - Checks if server is running

**Supported Servers:**

```typescript
const STEAM_DEDICATED_SERVERS = {
  1391110: "Valheim Server",
  1672970: "Palworld Dedicated Server",
  380870: "Arma 3 Server",
  570940: "Killing Floor 2 Server",
  4940: "Garry's Mod Server",
  258550: "Team Fortress 2 Server",
  8980: "Left 4 Dead 2 Server",
  232290: "Source SDK Base 2013 Dedicated Server",
  214420: "SCP: Secret Laboratory Server",
  90: "Half-Life 2 Server",
  304130: "Unreal Tournament Server",
  211480: "S.T.A.L.K.E.R. Call of Pripyat Dedicated Server",
  755790: "Mordhau Server",
  1304830: "Enshrouded Dedicated Server",
  552520: "Project Zomboid Server",
};
```

---

### 2. IPC Handler Setup

**File:** `src/main/main.ts`

Register the IPC handler for getting Steam servers:

```typescript
import { findInstalledServers } from "./steamDetection";

ipcMain.handle("get-steam-servers", async () => {
  try {
    const servers = await findInstalledServers();
    return { success: true, servers };
  } catch (error) {
    console.error("Error finding Steam servers:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
      servers: [],
    };
  }
});
```

---

### 3. React Component

**File:** `src/renderer/App.tsx`

Complete React component for displaying servers:

```typescript
import { useEffect, useState } from "react";
import type { SteamServer } from "../types/electron";
import "./App.css";

function App() {
  const [servers, setServers] = useState<SteamServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchServers();
  }, []);

  const fetchServers = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = (await window.electron.ipcRenderer.invoke(
        "get-steam-servers"
      )) as { success: boolean; servers: SteamServer[]; error?: string };

      if (result.success) {
        setServers(result.servers);
      } else {
        setError(result.error || "Failed to detect Steam servers");
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "An unexpected error occurred"
      );
    } finally {
      setLoading(false);
    }
  };

  // Conditional rendering...
}

export default App;
```

---

### 4. Type Definitions

**File:** `src/types/electron.d.ts`

Type-safe definitions for Steam servers:

```typescript
export interface SteamServer {
  name: string;
  appId: number;
  installPath: string;
  isRunning: boolean;
}

export interface ElectronAPI {
  ipcRenderer: {
    send: (channel: string, ...args: unknown[]) => void;
    on: (channel: string, func: (...args: unknown[]) => void) => void;
    once: (channel: string, func: (...args: unknown[]) => void) => void;
    invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
  };
}

declare global {
  interface Window {
    electron: ElectronAPI;
  }
}
```

---

### 5. Preload Script

**File:** `src/preload/preload.ts`

Security-focused IPC bridge:

```typescript
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electron", {
  ipcRenderer: {
    send: (channel: string, ...args: unknown[]) =>
      ipcRenderer.send(channel, ...args),
    on: (channel: string, func: (...args: unknown[]) => void) =>
      ipcRenderer.on(channel, (_event, ...args) => func(...args)),
    once: (channel: string, func: (...args: unknown[]) => void) =>
      ipcRenderer.once(channel, (_event, ...args) => func(...args)),
    invoke: (channel: string, ...args: unknown[]) =>
      ipcRenderer.invoke(channel, ...args),
  },
});
```

---

### 6. CSS Key Classes

**File:** `src/renderer/App.css`

Important CSS classes for styling:

```css
/* Main container */
.app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

/* Server cards grid */
.servers {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 20px;
}

/* Individual server card */
.server-card {
  background: #f9f9f9;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 20px;
  transition: all 0.3s ease;
}

.server-card:hover {
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.15);
  transform: translateY(-2px);
}

/* Status badges */
.status.running {
  background: #d4edda;
  color: #155724;
}

.status.stopped {
  background: #f8d7da;
  color: #721c24;
}
```

---

### 7. Configuration Files

#### `package.json` - Key Scripts

```json
{
  "scripts": {
    "start": "concurrently \"npm run electron\" \"npm run dev\"",
    "electron": "wait-on http://localhost:5173 && electron .",
    "dev": "vite",
    "build": "vite build",
    "electron-build": "tsc",
    "dist": "npm run build && npm run electron-build && electron-builder"
  }
}
```

#### `tsconfig.json` - TypeScript Config

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src"]
}
```

---

## Usage Examples

### Calling from React

```typescript
// Get servers list
const result = await window.electron.ipcRenderer.invoke("get-steam-servers");

if (result.success) {
  console.log("Found servers:", result.servers);
  setServers(result.servers);
} else {
  console.error("Error:", result.error);
}
```

### Creating a New IPC Handler

To add a new IPC handler in `src/main/main.ts`:

```typescript
ipcMain.handle("your-channel-name", async (event, arg1, arg2) => {
  try {
    // Your logic here
    const result = await someAsyncOperation(arg1, arg2);
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
```

Then call from React:

```typescript
const result = await window.electron.ipcRenderer.invoke(
  "your-channel-name",
  value1,
  value2
);
```

### Adding a New Server

To add support for a new Steam dedicated server:

```typescript
// In src/main/steamDetection.ts
const STEAM_DEDICATED_SERVERS = {
  // ... existing servers
  9999999: "New Server Name", // Add this line
};
```

Then rebuild:

```bash
npm run electron-build
```

---

## Debugging Tips

### View Console Output

The main process logs appear in the Electron DevTools console (auto-opens in dev mode).

```typescript
// In main.ts
console.log("Steam servers found:", servers);
console.error("Error:", error);
```

### React DevTools

DevTools are automatically opened in development mode via:

```typescript
if (isDev) {
  mainWindow.webContents.openDevTools();
}
```

### Common Issues

1. **"Cannot find module" errors**

   - Run `npm install` to ensure all dependencies are installed
   - Check that import paths are correct

2. **Steam path not found**

   - Check your Steam installation exists
   - On Windows, verify registry key exists
   - Check file permissions

3. **No servers detected**
   - Ensure at least one server is installed in Steam
   - Try the Refresh button
   - Check browser console for error messages

---

## Useful Commands

```bash
# Install dependencies
npm install

# Start development (Electron + Vite)
npm start

# Build React app only
npm run build

# Compile TypeScript (main process)
npm run electron-build

# Watch TypeScript (main process)
npm run electron-dev

# Build complete application for distribution
npm run dist

# Build application (faster, dev version)
npm run dist-dev
```

---

## File Size Reference

| File                 | Size   |
| -------------------- | ------ |
| steamDetection.ts    | ~8KB   |
| main.ts              | ~3KB   |
| App.tsx              | ~4KB   |
| App.css              | ~6KB   |
| preload.ts           | ~1KB   |
| Total source         | ~22KB  |
| Compiled (with deps) | ~150MB |

---

## Next Development Steps

1. **Test the setup**

   ```bash
   npm install
   npm start
   ```

2. **Verify detection works**

   - Look for servers in the grid
   - Check status indicators

3. **Add custom features**

   - Start/stop server buttons
   - Configuration editor
   - Console viewer

4. **Build for distribution**
   ```bash
   npm run dist
   ```

---

For more detailed information, see:

- `README.md` - Project overview
- `STEAM_DETECTION.md` - Detection logic details
- `ARCHITECTURE.md` - System architecture
- `QUICKSTART.md` - Quick start guide
