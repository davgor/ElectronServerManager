# Steam Server Manager

A modern Electron application for discovering and managing Steam dedicated servers with a React-based UI.

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Windows, macOS, or Linux

### Installation

Install dependencies:

```bash
npm install
```

### Development

Start the development server:

```bash
npm start
```

This will start both the Vite development server and Electron in development mode.

### Building

Build the application for distribution:

```bash
npm run dist
```

Build for development (faster):

```bash
npm run dist-dev
```

## Project Structure

```
src/
├── main/
│   ├── main.ts              # Electron main process
│   └── steamDetection.ts    # Steam server detection logic
├── renderer/
│   ├── App.tsx              # Main React component
│   ├── App.css              # App styles
│   ├── main.tsx             # React entry point
│   └── index.css            # Global styles
├── preload/
│   └── preload.ts           # IPC bridge
└── types/
    └── electron.d.ts        # Type definitions
```

## Features

### 🎮 Steam Server Detection

- Automatically detects installed Steam dedicated servers on startup
- Scans all Steam library locations
- Supports 15+ popular dedicated servers including:
  - Valheim Server
  - Palworld Dedicated Server
  - Team Fortress 2 Server
  - Left 4 Dead 2 Server
  - Garry's Mod Server
  - And many more...

### 🎯 Server Information Display

- Shows server name and App ID
- Displays installation path
- Indicates running status
- Real-time refresh capability

### 💻 Technical Features

- ⚡ Vite for fast development with HMR
- ⚛️ React 18 with TypeScript
- 🔒 Security best practices (context isolation, IPC)
- 📦 Electron Builder for packaging
- 🎨 Modern CSS with responsive design
- 🛡️ Cross-platform support (Windows, macOS, Linux)

## Supported Steam Dedicated Servers

The application detects the following Steam dedicated servers:

- Arma 3 Server (380870)
- Valheim Server (1391110, 1319690)
- Palworld Dedicated Server (1672970)
- Killing Floor 2 Server (570940)
- Garry's Mod Server (4940)
- Team Fortress 2 Server (258550)
- Left 4 Dead 2 Server (8980)
- Source SDK Base 2013 Dedicated Server (232290)
- SCP: Secret Laboratory Server (214420)
- Half-Life 2 Server (90)
- Unreal Tournament Server (304130)
- S.T.A.L.K.E.R. Call of Pripyat Dedicated Server (211480)
- Mordhau Server (755790)
- Enshrouded Dedicated Server (1304830)
- Project Zomboid Server (552520)

## Available Scripts

- `npm start` - Start development mode (Electron + Vite)
- `npm run dev` - Start Vite development server only
- `npm run electron` - Start Electron app
- `npm run build` - Build React app with Vite
- `npm run electron-build` - Compile TypeScript for main process
- `npm run electron-dev` - Watch mode for main process TypeScript
- `npm run dist` - Build and package application for distribution

## Platform Support

### Windows

- Registry lookup for Steam installation path
- Fallback to common installation directories
- Process detection via tasklist

### macOS

- Checks `~/Library/Application Support/Steam`
- Process detection via pgrep

### Linux

- Checks `~/.steam/steam`
- Process detection via pgrep

## Adding New Servers

To add support for additional Steam dedicated servers:

1. Open `src/main/steamDetection.ts`
2. Add the server App ID and name to the `STEAM_DEDICATED_SERVERS` object:

```typescript
const STEAM_DEDICATED_SERVERS = {
  YOUR_APP_ID: "Your Server Name",
  // ... existing servers
};
```

3. Rebuild the application

## Troubleshooting

### No servers detected

- Make sure Steam is installed on your system
- Verify at least one dedicated server is installed in Steam
- Check that the application has read access to the Steam directory

### Steam path not found

- Check your Steam installation path
- On Windows, ensure the registry key `HKEY_CURRENT_USER\Software\Valve\Steam` exists
- On macOS/Linux, verify the standard Steam directory exists

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
