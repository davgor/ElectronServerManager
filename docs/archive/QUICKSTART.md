# Quick Start Guide

## Initial Setup

1. **Install dependencies:**

   ```bash
   npm install
   ```

2. **Start development:**

   ```bash
   npm start
   ```

   This command will:

   - Start the Vite dev server on `http://localhost:5173`
   - Launch the Electron app once the dev server is ready
   - Open DevTools automatically

## Project Overview

Your Electron application is structured as follows:

### Main Process (`src/main/main.ts`)

- Creates the main application window
- Handles app lifecycle events
- Manages IPC communication
- Sets up the application menu

### Renderer Process (`src/renderer/`)

- React-based UI built with TypeScript
- Uses Vite for fast HMR (Hot Module Replacement)
- `App.tsx` - Main application component
- `App.css` - Component styles

### Preload Script (`src/preload/preload.ts`)

- Bridges the main and renderer processes securely
- Exposes safe IPC methods via `window.electron`

## Key Features

✅ **Type Safety** - Full TypeScript support  
✅ **Security** - Context isolation and preload script  
✅ **Performance** - Vite for fast development  
✅ **Styling** - CSS with Flexbox ready  
✅ **Packaging** - Electron Builder configured

## Next Steps

1. **Modify the UI** - Edit `src/renderer/App.tsx`
2. **Add IPC handlers** - Add to `src/main/main.ts` with `ipcMain.handle()`
3. **Call IPC from React** - Use `window.electron.ipcRenderer.invoke()`
4. **Build for production** - Run `npm run dist`

## Troubleshooting

### App won't start

- Make sure port 5173 is available
- Check that all dependencies are installed: `npm install`

### DevTools not opening

- In `src/main/main.ts`, the DevTools are opened only in development mode

### Build issues

- Clean install: `rm -r node_modules package-lock.json && npm install`
- Rebuild native modules: `npm run electron-build`

## Resources

- [Electron Documentation](https://www.electronjs.org/docs)
- [Vite Documentation](https://vitejs.dev/)
- [React Documentation](https://react.dev/)
- [IPC Communication](https://www.electronjs.org/docs/latest/api/ipc-main)
