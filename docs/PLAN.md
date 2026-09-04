# ClickUp Lite Control Panel: Specification & Roadmap

## 1. Vision & Architecture Overview

**ClickUp Lite Control Panel** is a lightweight, high-performance macOS menu bar companion app built with **Tauri v2 + React 19 + TanStack Router + Tailwind CSS**.

The app lives entirely in the macOS menu bar (system tray) with zero clutter:

- **Menu Bar Popup**: Opens directly anchored beneath the menu bar icon when clicked (or via global hotkey).
- **Core Triad**:
  1. **Time Tracking**: Live active timer in the menu bar and popup, 1-click start/stop/switch, daily totals.
  2. **Task Management**: Focused "My Active / Due Today" tasks, rapid status changes, quick-add task.
  3. **Smart Notifications**: Desktop notifications for Pomodoro intervals, overtime warnings, and idle reminders.
- **Authentication**: Official **ClickUp OAuth 2.0 flow** via local redirect listener (`localhost`) or custom deep-link scheme.

---

## 2. Window & Native Integration (Menubar Popup Model)

```
+-----------------------------------------------------------+
| [Menu Bar]  ... (WiFi) (Battery) [ ⏱️ 01:24:10 | ▶ ]       |
+-----------------------------------------------------------+
                                    |
                                    v (pops open directly underneath)
             +---------------------------------------------+
             | ⚙️ ClickUp Lite                [Close] [⚙️]  |
             +---------------------------------------------+
             | ⏱️ ACTIVE TIMER                             |
             | Refactor Auth & Token Refresh               |
             | 01:24:10                      [ Pause ] [■] |
             | Today: 4h 12m                               |
             +---------------------------------------------+
             | 📋 TASKS (My Active - 4)          [ + New ] |
             | [▶] Fix navigation glitch       [In Progress] |
             | [▶] Review PR #42               [To Do]       |
             | [▶] Prepare release notes       [To Do]       |
             +---------------------------------------------+
             | 🔔 Pomodoro: 16m left until 5m break        |
             +---------------------------------------------+
```

### Tauri Native Capabilities Required

1. **Menu Bar Tray (`tauri::tray::TrayIconBuilder`)**:
   - Displays dynamic title with running elapsed time (e.g. `▶ 00:32:15`).
   - Clicking toggles the popup window right at the tray position.
2. **Window Positioning & Behavior**:
   - `decorations: false`, `transparent: true`, `skipTaskbar: true`.
   - `tauri-plugin-positioner` for pixel-perfect positioning anchored to the tray icon.
   - Auto-hide on blur (optional toggle to pin open if desired).
3. **OAuth Redirect Server**:
   - Tauri local HTTP listener / deep-link handler (`clickup-lite://oauth-callback` or `http://127.0.0.1:3456/callback`) to securely capture the OAuth exchange code.
4. **Native Notifications**:
   - `@tauri-apps/plugin-notification` for break and idle alerts.

---

## 3. Core Feature Breakdown

### A. Time Tracking

- **Live Menu Bar Ticker**: Elapsed time visible directly in the macOS menu bar without opening the window.
- **Active Timer Card**:
  - Task name, space/list tag.
  - Large start / pause / stop action.
  - Optional billable toggle and time entry description.
- **1-Click Switch**: Clicking "Play" next to any task in the task list automatically stops the running timer and starts a new timer for the clicked task.
- **Today's Summary**: Quick breakdown of total tracked hours today against user's daily goal.

### B. Task Management

- **Filtered Task View**:
  - Filters: "Assigned to Me", status != "Closed", sorted by priority & due date.
- **Rapid Status Toggle**:
  - One-click dropdown to change status (_To Do_ ➔ _In Progress_ ➔ _Complete_).
- **Fast Quick-Add**:
  - Clean inline input to quickly create a task in your default list without leaving the menu bar.

### C. Smart Notifications

- **Pomodoro & Focus Intervals**: Alerts every 25/50 minutes of focused work.
- **Idle / Forgotten Timer Alert**: Alerts if no timer is running during scheduled work hours.
- **Long Session Warning**: Alerts if a single timer has run over 2 hours without interruption.

---

## 4. ClickUp OAuth 2.0 Flow

1. User clicks **"Connect ClickUp"** in the popup.
2. App generates PKCE / state and opens system browser to:
   `https://app.clickup.com/api?client_id={CLIENT_ID}&redirect_uri={REDIRECT_URI}`.
3. User approves access in ClickUp.
4. Browser redirects to the local callback (`http://localhost:3456/callback`).
5. Tauri Rust backend or local server captures the `code`, exchanges it via `POST https://api.clickup.com/api/v2/oauth/token` for the `access_token`.
6. Token is stored securely in desktop local storage, and the popup automatically refreshes to the dashboard.

---

## 5. Phased Implementation Roadmap

### Phase 1: Menu Bar Popup & Native Window Shell

- [ ] Configure `apps/web/src-tauri/tauri.conf.json` for a frameless popup window (`width: 380`, `height: 560`, `decorations: false`, `transparent: true`).
- [ ] Implement Rust tray icon with `TrayIconBuilder` and `tauri-plugin-positioner` to position the popup window directly below the tray icon.
- [ ] Add root script `"dev:desktop": "bun --filter web desktop:dev"`.

### Phase 2: ClickUp OAuth 2.0 Integration

- [ ] Create ClickUp OAuth service with local callback listener.
- [ ] Build Login / Connect screen in React for first-time onboarding.
- [ ] Save authenticated state with auto-reconnection and workspace selection (`team_id`).

### Phase 3: Time Tracking Engine & Menu Bar Sync

- [ ] ClickUp Time Tracking API client (`/time_entries/current`, `/time_entries/start`, `/time_entries/stop`).
- [ ] Live counter hook with millisecond precision calculation.
- [ ] Update macOS menu bar tray title dynamically with elapsed time.

### Phase 4: Compact Task Management

- [ ] Query assigned tasks with optimistic status updates.
- [ ] Task list UI with 1-click play button and status dropdown.
- [ ] Quick-add task bar.

### Phase 5: Notifications & Preferences

- [ ] Configure `@tauri-apps/plugin-notification`.
- [ ] Implement Pomodoro timers & idle reminder background checks.
- [ ] Settings tab for daily target, break durations, and notification preferences.
