# ClickUp Lite Control Panel

A sleek, lightweight macOS menu bar companion and control panel for ClickUp. Features instant task synchronization, priority tagging, integrated pomodoro timer, and seamless background operation.

## Features

- **macOS Menu Bar Native App** - Fast, unobtrusive access right from your Mac's top bar
- **High-Resolution Custom Icon Suite** - Native Apple squircle icon, crisp menu bar template tray icon, and multi-format bundles
- **Standard Tauri Release Bundles** - Native `.app` bundle and drag-and-drop `.dmg` installer
- **TypeScript & React** - Full type safety with TanStack Router
- **TailwindCSS & shadcn/ui** - Modern, responsive UI with dark/light mode support
- **Tauri v2** - Native macOS bundle with low memory footprint and autostart support

## Quick Start

### 1. Install Dependencies

```bash
bun install
```

### 2. Development Mode

Start the web preview in your browser:

```bash
bun run dev
```

Or launch the desktop menu bar app with live reload:

```bash
bun run dev:desktop
```

## Building the Desktop App (macOS `.app` & `.dmg`)

To build the release application and native macOS disk image installer (`.dmg`):

```bash
bun run desktop:build
```

The compiled release outputs will be located at:

- **macOS App Bundle**: `apps/web/src-tauri/target/release/bundle/macos/ClickUp Lite.app`
- **macOS DMG Installer**: `apps/web/src-tauri/target/release/bundle/dmg/ClickUp Lite_0.1.0_aarch64.dmg`

Simply open the `.dmg` file and drag **ClickUp Lite** to **Applications** as with any standard macOS app.

## Icon Generation Suite

All app icons across macOS, Windows, web, and menu bar tray can be regenerated at any time:

```bash
bun run icons:generate
```

This generates:

- **Master App Icon** (`apps/web/src-tauri/app-icon.png`): 1024x1024 Apple HIG squircle.
- **macOS ICNS** (`apps/web/src-tauri/icons/icon.icns`): Multi-resolution icon for Finder, Dock, and Launchpad.
- **Windows ICO** (`apps/web/src-tauri/icons/icon.ico`) and Store tiles.
- **macOS Menu Bar Tray Icon** (`apps/web/src-tauri/icons/tray-icon.png`, `tray-icon@2x.png`): Crisp template silhouette adapting dynamically to Dark & Light modes.
- **Web Favicons** (`apps/web/public/`): `favicon.ico`, `favicon.png`, and `apple-touch-icon.png`.

## Project Structure

```
clickup-lite-control-panel/
├── apps/
│   └── web/                # Frontend application (React + TanStack Router + Tauri)
│       ├── public/         # Web icons and favicons
│       └── src-tauri/      # Rust native backend, menu bar tray & bundle configs
├── packages/
│   └── ui/                 # Shared shadcn/ui components and styles
└── scripts/
    └── generate-icons.py   # Multi-platform icon generator
```

## Available Scripts

- `bun run dev:desktop`: Start Tauri desktop app with hot reload
- `bun run desktop:build`: Compile production `.app` and `.dmg` installer
- `bun run icons:generate`: Recreate all app, tray, and web icon assets
- `bun run check`: Run Oxlint and Oxfmt code checks
- `bun run check-types`: Run TypeScript compiler checks across all workspaces
