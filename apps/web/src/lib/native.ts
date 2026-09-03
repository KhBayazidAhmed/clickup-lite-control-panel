import {
  isPermissionGranted,
  requestPermission,
  sendNotification as tauriSendNotification,
} from "@tauri-apps/plugin-notification";

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function openExternalUrl(url: string): Promise<void> {
  if (isTauri()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("open_external_url", { url });
      return;
    } catch (err) {
      console.error("Failed to open external url via native invoke:", err);
    }
  }
  window.open(url, "_blank");
}

let cachedTrayTitle: string | null = null;

export async function setTrayTitle(title: string): Promise<void> {
  if (!isTauri()) return;
  if (cachedTrayTitle === title) return; // Deduplicate IPC call
  cachedTrayTitle = title;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("update_tray_title", { title });
  } catch (err) {
    console.error("Failed to update tray title:", err);
  }
}

export async function clearTrayTitle(): Promise<void> {
  if (!isTauri()) return;
  if (cachedTrayTitle === null) return; // Deduplicate IPC call
  cachedTrayTitle = null;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("clear_tray_title");
  } catch (err) {
    console.error("Failed to clear tray title:", err);
  }
}

export async function hideWindow(): Promise<void> {
  if (!isTauri()) return;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("hide_window");
  } catch (err) {
    console.error("Failed to hide window:", err);
  }
}

export async function checkNotificationPermission(): Promise<boolean> {
  if (!isTauri()) {
    return (
      typeof window !== "undefined" &&
      "Notification" in window &&
      Notification.permission === "granted"
    );
  }
  try {
    return await isPermissionGranted();
  } catch {
    return false;
  }
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!isTauri()) {
    if (typeof window !== "undefined" && "Notification" in window) {
      const p = await Notification.requestPermission();
      return p === "granted";
    }
    return false;
  }
  try {
    const p = await requestPermission();
    return p === "granted";
  } catch (err) {
    console.error("Failed to request notification permission:", err);
    return false;
  }
}

export async function notify(
  title: string,
  body: string,
  sound: string = "Ping",
): Promise<boolean> {
  if (!isTauri()) {
    if (typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "granted") {
        new Notification(title, { body });
        return true;
      }
      if (Notification.permission !== "denied") {
        const p = await Notification.requestPermission();
        if (p === "granted") {
          new Notification(title, { body });
          return true;
        }
      }
    }
    return false;
  }

  try {
    let hasPermission = await isPermissionGranted();
    if (!hasPermission) {
      const permission = await requestPermission();
      hasPermission = permission === "granted";
    }
    if (hasPermission) {
      tauriSendNotification({ title, body, sound });
      return true;
    }
    console.warn("Notification permission was not granted by OS/user.");
    return false;
  } catch (err) {
    console.error("Failed to trigger native notification:", err);
    return false;
  }
}

export async function executeNativeClickUpRequest(
  method: string,
  url: string,
  headers: Record<string, string>,
  body?: string,
): Promise<string> {
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<string>("clickup_request", {
      method,
      url,
      headers,
      body: body ?? null,
    });
  }

  // Web mode fallback: Route through Vite's local dev proxy to eliminate CORS
  const proxiedUrl = url.replace("https://api.clickup.com", "/clickup-api");
  const res = await fetch(proxiedUrl, {
    method,
    headers,
    body,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`ClickUp API Error (${res.status}): ${errText}`);
  }

  return res.text();
}
