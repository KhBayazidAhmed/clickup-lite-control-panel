<p align="center">
  <img src="./apps/web/public/apple-touch-icon.png" width="96" height="96" alt="ClickUp Lite Logo" />
</p>

<h1 align="center">ClickUp Lite Control Panel</h1>

<p align="center">
  <strong>A modern, lightweight macOS menu bar companion for ClickUp.</strong><br />
  Track time, switch tasks in one click, run Pomodoro intervals, and view daily progress right from your status bar.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/macOS-11.0%2B-blue?logo=apple&style=flat-square" alt="macOS" />
  <img src="https://img.shields.io/badge/Tauri-v2-24C8D8?logo=tauri&style=flat-square" alt="Tauri" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&style=flat-square" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&style=flat-square" alt="TypeScript" />
  <img src="https://img.shields.io/badge/TailwindCSS-v4-38B2AC?logo=tailwindcss&style=flat-square" alt="Tailwind CSS" />
  <img src="https://img.shields.io/badge/License-MIT-green.svg?style=flat-square" alt="License" />
</p>

---

## Overview

**ClickUp Lite** is designed for productivity without distraction. Instead of keeping a resource-heavy browser tab or full desktop app open all day just to log time, ClickUp Lite lives quietly in your macOS menu bar.

Click the status bar icon to reveal an anchored control panel with live timer synchronization, one-click task switching, an integrated Pomodoro timer, and full offline resilience.

---

## Key Features

- ⏱️ **Live Menu Bar Ticker**: Elapsed time displays directly in your macOS menu bar (`▶ 00:24:15`) so you can stay aware of your focus time at a glance.
- ⚡ **1-Click Time Tracking**: Start, pause, stop, and switch between active ClickUp tasks instantly.
- 📋 **Compact Task Management**:
  - Filter and search assigned tasks without loading the entire ClickUp workspace.
  - Quick-add new tasks directly into chosen lists with custom priority tags.
  - Direct deep-links to open any task in ClickUp with one click.
- 🍅 **Built-in Pomodoro Timer**:
  - Configurable focus intervals (`15m`, `20m`, `25m`, `30m`, `45m`).
  - Automatic work/break cycle transitions.
  - Native macOS audio alerts and notification center warnings when focus intervals finish.
- 📌 **Pin Window & Auto-Hide**:
  - **Auto-Hide** (default): Dismisses cleanly whenever you click away into another app.
  - **Pinned**: Stays anchored and floating on top across macOS spaces while you work.
- 📴 **Offline-First Storage**:
  - Internet drops? Timer sessions are safely queued locally in device storage.
  - Automatically syncs back to ClickUp the moment your connection restores.
- 🚀 **Launch at Login**: One-toggle option to automatically launch ClickUp Lite at system startup.
- 🔒 **Privacy & Security**:
  - Zero external tracking, analytics, or telemetry.
  - Tokens are stored locally on your device in sandboxed storage and only communicate directly with the official ClickUp API (`api.clickup.com`).

---

## Installation & Setup

### Pre-requisites

- **Operating System**:
  - **macOS** 11.0 (Big Sur) or newer (Apple Silicon & Intel supported)
  - **Windows** 10 1809 or newer (x64). The installer bundles the WebView2 runtime, so no separate download is needed.
- **Node/Bun**: [Bun](https://bun.sh) (recommended) or Node.js 20+
- **Rust**: Latest stable Rust toolchain (required only if compiling from source)
- **Windows build tools** (only when compiling from source on Windows): [Visual Studio C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with the "Desktop development with C++" workload, plus the `x86_64-pc-windows-msvc` Rust target.

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/KhBayazidAhmed/clickup-lite-control-panel.git
cd clickup-lite-control-panel
bun install
```

### 2. Connect Your ClickUp Account

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```
2. Open ClickUp Lite and click the **Settings (⚙️)** icon:
   - **Personal API Token (Recommended)**: Go to **ClickUp Settings ➔ Apps ➔ API Token (`pk_...`)** and paste your token. Validates in seconds with no OAuth setup required.
   - **OAuth 2.0**: Enter your ClickUp Client ID & Secret in your `.env` file to authorize via browser flow.

---

## Running in Development

Run the frontend in your browser:

```bash
bun run dev
```

Or launch the live native desktop companion with hot reloading:

```bash
bun run dev:desktop
```

---

## Building the Desktop App

To produce a production-ready, highly optimized standalone application and drag-and-drop installer:

```bash
bun run desktop:build
```

The output artifacts are generated at:

- **macOS App Bundle**: `apps/web/src-tauri/target/release/bundle/macos/ClickUp Lite.app`
- **macOS DMG Installer**: `apps/web/src-tauri/target/release/bundle/dmg/ClickUp Lite_0.1.0_aarch64.dmg`

To install, simply open the `.dmg` file and drag **ClickUp Lite** into your **Applications** folder.

> [!NOTE]
> **macOS Gatekeeper First-Launch Note**: Because open-source builds are not signed with a paid Apple Developer certificate, macOS Gatekeeper may show _"ClickUp Lite is damaged and can't be opened"_. To allow it to run, execute this one-line command in Terminal after dragging it to Applications:
>
> ```bash
> xattr -cr "/Applications/ClickUp Lite.app"
> ```

### Windows (`.exe` installer)

Running `bun run desktop:build` on a Windows machine produces:

- **NSIS Installer**: `apps/web/src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/ClickUp Lite_0.1.0_x64-setup.exe`

Windows installers cannot be cross-compiled from macOS. The executable resource
step needs `llvm-rc` and the MSI bundler needs WiX, both of which require the
MSVC toolchain. Use CI instead, which runs on a native Windows runner:

```bash
git tag v0.1.0
git push origin v0.1.0
```

The **Release** workflow (`.github/workflows/release.yml`) builds the Windows
NSIS installer and the macOS Apple Silicon DMG, then attaches both to a GitHub
Release. You can also start it from the **Actions** tab with **Run workflow**,
which accepts an optional tag and a "keep as draft" toggle.

> [!NOTE]
> **Windows SmartScreen Note**: the installer is not code-signed, so Windows shows a blue _"Windows protected your PC"_ dialog. Click **More info** then **Run anyway**. Suppressing it requires an Authenticode certificate configured via `bundle.windows.certificateThumbprint` in `tauri.conf.json`.

---

## Icon Suite Generation

ClickUp Lite includes an automated icon generation pipeline that converts vector assets into standard Apple HIG and multi-platform icon sets:

```bash
bun run icons:generate
```

This generates:

- **Master App Icon** (`apps/web/src-tauri/app-icon.png`): 1024×1024 Apple HIG squircle with ambient drop shadow.
- **macOS ICNS** (`apps/web/src-tauri/icons/icon.icns`): Multi-resolution icon for Finder, Dock, and Launchpad (16×16 to 1024×1024 @2x Retina).
- **Menu Bar Tray Icons** (`tray-icon.png`, `tray-icon@2x.png`): Dynamic template silhouette adapting smoothly to Dark and Light menu bars.
- **Web Favicons** (`apps/web/public/`): `favicon.ico`, `favicon.png`, and `apple-touch-icon.png`.

---

## Project Structure

```
clickup-lite-control-panel/
├── apps/
│   └── web/                   # Main desktop webview companion app
│       ├── public/            # Web icons & favicons
│       ├── src/
│       │   ├── components/    # Timer, task list, header, & settings modals
│       │   ├── lib/           # ClickUp API client & native desktop IPC helpers
│       │   ├── routes/        # TanStack Router route definitions
│       │   └── store/         # Zustand global application & offline state
│       └── src-tauri/         # Rust desktop backend, menu bar tray & IPC handlers
├── packages/
│   ├── env/                   # Type-safe environment variable schemas (@t3-oss/env-core)
│   └── ui/                    # Reusable shadcn/ui components & Tailwind styling
└── scripts/
    └── generate-icons.py      # Automated vector-to-ICNS/ICO/tray icon generator
```

---

## Available Scripts

| Command                  | Description                                                                  |
| :----------------------- | :--------------------------------------------------------------------------- |
| `bun run dev:desktop`    | Launches the native macOS menu bar app with hot module reloading.            |
| `bun run dev`            | Runs the web view in your default browser.                                   |
| `bun run desktop:build`  | Compiles optimized release `.app` and `.dmg` bundles via Tauri v2.           |
| `bun run icons:generate` | Regenerates all multi-resolution app icons, tray templates, and favicons.    |
| `bun run check`          | Runs fast code quality and formatting checks via Oxlint and Oxfmt.           |
| `bun run check-types`    | Validates TypeScript across all monorepo workspaces without emitting output. |

---

## License

This project is licensed under the [MIT License](LICENSE).
