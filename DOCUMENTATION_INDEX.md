# 📚 Documentation Index

Welcome to the Steam Server Manager documentation! This index will help you navigate all available resources.

## 🚀 Getting Started

**Start here if you're new to the project:**

1. **[GETTING_STARTED.md](./GETTING_STARTED.md)** ⭐ START HERE

   - Complete project overview
   - Quick start instructions
   - File structure explanation
   - Troubleshooting guide

2. **[QUICKSTART.md](./QUICKSTART.md)**
   - Fast setup for developers
   - Key features overview
   - Available npm scripts
   - What's in the project

## 📖 Understanding the Project

**Learn how the system works:**

3. **[README.md](./README.md)**

   - Project description
   - Supported Steam servers list
   - Platform-specific details
   - Feature overview

4. **[ARCHITECTURE.md](./ARCHITECTURE.md)**

   - System architecture diagrams
   - Application flow visualization
   - Data flow explanation
   - Technology stack details
   - Performance characteristics
   - Security considerations

5. **[STEAM_DETECTION.md](./STEAM_DETECTION.md)**
   - Steam detection implementation details
   - How the detection module works
   - File locations being scanned
   - Adding new servers
   - Error handling approach

## 💻 For Developers

**Code-level information:**

6. **[CODE_REFERENCE.md](./CODE_REFERENCE.md)**

   - Code snippets for all components
   - Type definitions
   - IPC handler examples
   - CSS class reference
   - Configuration samples
   - Debugging tips

7. **[IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md)**
   - What was implemented
   - Changes made to each file
   - Files created
   - How detection flow works
   - Next steps for enhancement

## 📁 File Organization

### Source Files

```
src/
├── main/
│   ├── main.ts                 # Electron main process
│   └── steamDetection.ts       # Steam detection logic
├── renderer/
│   ├── App.tsx                 # React component
│   ├── App.css                 # Styles
│   └── main.tsx               # React entry point
├── preload/
│   └── preload.ts             # IPC bridge
└── types/
    └── electron.d.ts          # Type definitions
```

### Configuration Files

```
├── package.json               # Dependencies & scripts
├── tsconfig.json             # TypeScript config
├── vite.config.ts            # Vite config
├── electron-builder.json     # Build config
└── .env.example              # Environment template
```

## 🎯 Quick Navigation by Task

### "I want to..."

#### ...get the app running

→ Read [GETTING_STARTED.md](./GETTING_STARTED.md) → [QUICKSTART.md](./QUICKSTART.md)

#### ...understand how Steam detection works

→ Read [STEAM_DETECTION.md](./STEAM_DETECTION.md) → [ARCHITECTURE.md](./ARCHITECTURE.md)

#### ...add a new Steam server to the app

→ Read [CODE_REFERENCE.md](./CODE_REFERENCE.md) → [STEAM_DETECTION.md](./STEAM_DETECTION.md)

#### ...add a new feature

→ Read [ARCHITECTURE.md](./ARCHITECTURE.md) → [CODE_REFERENCE.md](./CODE_REFERENCE.md)

#### ...debug an issue

→ Read [CODE_REFERENCE.md](./CODE_REFERENCE.md#debugging-tips) → [GETTING_STARTED.md](./GETTING_STARTED.md#%EF%B8%8F-troubleshooting)

#### ...build the app for distribution

→ Read [GETTING_STARTED.md](./GETTING_STARTED.md#-available-commands) → [README.md](./README.md)

#### ...understand the project structure

→ Read [GETTING_STARTED.md](./GETTING_STARTED.md#-project-structure) → [ARCHITECTURE.md](./ARCHITECTURE.md)

## 📊 Documentation by Type

### Beginner Friendly

- [GETTING_STARTED.md](./GETTING_STARTED.md) - Comprehensive overview
- [QUICKSTART.md](./QUICKSTART.md) - Quick setup
- [README.md](./README.md) - Project description

### Technical Details

- [STEAM_DETECTION.md](./STEAM_DETECTION.md) - Detection system
- [ARCHITECTURE.md](./ARCHITECTURE.md) - System design
- [CODE_REFERENCE.md](./CODE_REFERENCE.md) - Code examples

### Reference

- [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md) - What was built

## 🔑 Key Concepts

### Steam Detection

- **What:** Automatic scanning for installed Steam dedicated servers
- **Where:** `src/main/steamDetection.ts`
- **How:** Finds Steam path → Parses libraries → Checks manifests → Detects status
- **Learn more:** [STEAM_DETECTION.md](./STEAM_DETECTION.md)

### IPC Communication

- **What:** Secure message passing between main and renderer processes
- **Where:** `src/main/main.ts` and `src/renderer/App.tsx`
- **How:** Handler returns promise, renderer calls invoke
- **Learn more:** [ARCHITECTURE.md](./ARCHITECTURE.md#ipc-communication-bridge)

### React Component

- **What:** UI for displaying detected servers
- **Where:** `src/renderer/App.tsx` and `src/renderer/App.css`
- **How:** useState hooks, useEffect for data fetching, conditional rendering
- **Learn more:** [CODE_REFERENCE.md](./CODE_REFERENCE.md#3-react-component)

### Type Safety

- **What:** TypeScript interfaces for type checking
- **Where:** `src/types/electron.d.ts`
- **How:** Exported interfaces used throughout codebase
- **Learn more:** [CODE_REFERENCE.md](./CODE_REFERENCE.md#4-type-definitions)

## 🚀 Common Commands

```bash
# Install and run
npm install
npm start

# Development
npm run dev                # Just Vite
npm run electron-dev      # Just main process in watch mode

# Building
npm run build             # React app
npm run electron-build    # Main process TypeScript
npm run dist             # Complete build

# Reference
npm run                   # Show all available scripts
```

## 🎓 Learning Path

### Beginner

1. Read [GETTING_STARTED.md](./GETTING_STARTED.md)
2. Run `npm install && npm start`
3. Try using the app
4. Read [QUICKSTART.md](./QUICKSTART.md)

### Intermediate

1. Read [ARCHITECTURE.md](./ARCHITECTURE.md)
2. Read [STEAM_DETECTION.md](./STEAM_DETECTION.md)
3. Explore the source code
4. Try modifying `App.tsx`

### Advanced

1. Read [CODE_REFERENCE.md](./CODE_REFERENCE.md)
2. Study `steamDetection.ts` implementation
3. Build custom features
4. Package for distribution

## 📞 Quick Help

### Can't find something?

1. Check the [Table of Contents](#-documentation-index) above
2. Use the "Quick Navigation by Task" section
3. Search the documentation files

### Need code examples?

→ See [CODE_REFERENCE.md](./CODE_REFERENCE.md)

### Having problems?

→ See [GETTING_STARTED.md#-troubleshooting](./GETTING_STARTED.md#-troubleshooting)

### Want to understand the system?

→ See [ARCHITECTURE.md](./ARCHITECTURE.md)

### Need to extend the app?

→ See [CODE_REFERENCE.md](./CODE_REFERENCE.md#creating-a-new-ipc-handler)

## 📋 File Manifest

### Documentation Files

| File                                                     | Purpose                   | Read Time |
| -------------------------------------------------------- | ------------------------- | --------- |
| [GETTING_STARTED.md](./GETTING_STARTED.md)               | Complete overview & guide | 15 min    |
| [README.md](./README.md)                                 | Project description       | 10 min    |
| [QUICKSTART.md](./QUICKSTART.md)                         | Quick setup               | 5 min     |
| [ARCHITECTURE.md](./ARCHITECTURE.md)                     | System design             | 20 min    |
| [STEAM_DETECTION.md](./STEAM_DETECTION.md)               | Detection details         | 15 min    |
| [CODE_REFERENCE.md](./CODE_REFERENCE.md)                 | Code examples             | 20 min    |
| [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md) | What was built            | 10 min    |

### Source Files

| File                         | Purpose                |
| ---------------------------- | ---------------------- |
| `src/main/main.ts`           | Electron entry point   |
| `src/main/steamDetection.ts` | Server detection logic |
| `src/renderer/App.tsx`       | React UI component     |
| `src/renderer/App.css`       | Component styles       |
| `src/preload/preload.ts`     | IPC security bridge    |
| `src/types/electron.d.ts`    | Type definitions       |

### Configuration Files

| File                    | Purpose                         |
| ----------------------- | ------------------------------- |
| `package.json`          | Project metadata & dependencies |
| `tsconfig.json`         | TypeScript configuration        |
| `vite.config.ts`        | Vite bundler configuration      |
| `electron-builder.json` | Electron build configuration    |
| `.env.example`          | Environment variables template  |

## ✅ Status

- ✅ Project setup complete
- ✅ Steam detection implemented
- ✅ UI created and styled
- ✅ Type safety added
- ✅ Security configured
- ✅ Documentation complete
- ✅ Ready for development

## 🎉 Next Steps

1. Read [GETTING_STARTED.md](./GETTING_STARTED.md)
2. Run `npm install && npm start`
3. Test the Steam server detection
4. Explore the code in `src/`
5. Start building new features!

---

**Happy coding!** 🚀

_Last updated: December 21, 2025_
