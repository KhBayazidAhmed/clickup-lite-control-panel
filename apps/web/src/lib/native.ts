import { invoke } from "@tauri-apps/api/core";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification as tauriSendNotification,
} from "@tauri-apps/plugin-notification";

export const isTauri = (): boolean => {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
};

export async function setTrayTitle(title: string): Promise<void> {
  if (!isTauri()) return;
  try {
    await invoke("update_tray_title", { title });
  } catch (err) {
    console.error("Failed to update tray title:", err);
  }
}

export async function clearTrayTitle(): Promise<void> {
  if (!isTauri()) return;
  try {
    await invoke("clear_tray_title");
  } catch (err) {
    console.error("Failed to clear tray title:", err);
  }
}

export async function hideWindow(): Promise<void> {
  if (!isTauri()) return;
  try {
    await invoke("hide_window");
  } catch (err) {
    console.error("Failed to hide window:", err);
  }
}

export async function notify(title: string, body: string): Promise<void> {
  if (!isTauri()) {
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(title, { body });
    }
    return;
  }

  try {
    let hasPermission = await isPermissionGranted();
    if (!hasPermission) {
      const permission = await requestPermission();
      hasPermission = permission === "granted";
    }
    if (hasPermission) {
      tauriSendNotification({ title, body });
    }
  } catch (err) {
    console.error("Failed to trigger native notification:", err);
  }
}
