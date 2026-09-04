bun run dev:desktop

````

---

## Building the Desktop App (macOS `.app` & `.dmg`)

To produce a production-ready, highly optimized standalone application and drag-and-drop installer:

```bash
bun run desktop:build
````

The output artifacts are generated at:

- **macOS App Bundle**: `apps/web/src-tauri/target/release/bundle/macos/ClickUp Lite.app`
- **macOS DMG Installer**: `apps/web/src-tauri/target/release/bundle/dmg/ClickUp Lite_0.1.0_aarch64.dmg`

To install, simply open the `.dmg` file and drag **ClickUp Lite** into your **Applications** folder.

> [!NOTE]
> **macOS Gatekeeper Warning**: Because open-source builds are not signed with a paid Apple Developer certificate, macOS may show _"ClickUp Lite is damaged and can't be opened"_. To allow it to run, execute this in Terminal:
>
> ```bash
> xattr -cr "/Applications/ClickUp Lite.app"
> ```

---
