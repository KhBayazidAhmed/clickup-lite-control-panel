import { isTauri } from "./native";

export interface UpdateInfo {
  available: boolean;
  currentVersion: string;
  version?: string;
  date?: string;
  body?: string;
}

export type UpdateProgressCallback = (downloadedBytes: number, totalBytes: number) => void;

let cachedUpdate: any = null;

export async function getAppVersion(): Promise<string> {
  if (isTauri()) {
    try {
      const { getVersion } = await import("@tauri-apps/api/app");
      return await getVersion();
    } catch (err) {
      console.warn("Failed to get native app version:", err);
    }
  }
  return "0.1.1";
}

export async function checkAppUpdate(): Promise<{
  updateAvailable: boolean;
  currentVersion: string;
  updateInfo: UpdateInfo | null;
  error: string | null;
}> {
  const currentVersion = await getAppVersion();

  if (!isTauri()) {
    return {
      updateAvailable: false,
      currentVersion,
      updateInfo: null,
      error: "Updates are only available in desktop app mode.",
    };
  }

  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check();

    if (update) {
      cachedUpdate = update;
      return {
        updateAvailable: true,
        currentVersion,
        updateInfo: {
          available: true,
          currentVersion,
          version: update.version,
          date: update.date,
          body: update.body || undefined,
        },
        error: null,
      };
    }

    cachedUpdate = null;
    return {
      updateAvailable: false,
      currentVersion,
      updateInfo: {
        available: false,
        currentVersion,
      },
      error: null,
    };
  } catch (err: any) {
    const rawMsg = err?.message || String(err);
    console.warn("Update check returned:", rawMsg);

    // If GitHub latest.json asset returns 404 / not found (e.g. current release has no updater manifest yet),
    // it means there is no newer release available to update to.
    if (
      rawMsg.includes("Could not fetch a valid release JSON") ||
      rawMsg.includes("404") ||
      rawMsg.includes("release JSON")
    ) {
      cachedUpdate = null;
      return {
        updateAvailable: false,
        currentVersion,
        updateInfo: {
          available: false,
          currentVersion,
        },
        error: null,
      };
    }

    return {
      updateAvailable: false,
      currentVersion,
      updateInfo: null,
      error: rawMsg,
    };
  }
}

export async function downloadAndInstallAppUpdate(
  onProgress?: UpdateProgressCallback,
): Promise<void> {
  if (!cachedUpdate) {
    const res = await checkAppUpdate();
    if (!res.updateAvailable || !cachedUpdate) {
      throw new Error("No update available to install.");
    }
  }

  let totalBytes = 0;
  let downloadedBytes = 0;

  await cachedUpdate.downloadAndInstall((event: any) => {
    switch (event.event) {
      case "Started":
        totalBytes = event.data.contentLength ?? 0;
        if (onProgress) onProgress(0, totalBytes);
        break;
      case "Progress":
        downloadedBytes += event.data.chunkLength ?? 0;
        if (onProgress) onProgress(downloadedBytes, totalBytes);
        break;
      case "Finished":
        if (onProgress) onProgress(totalBytes, totalBytes);
        break;
    }
  });
}

export async function relaunchApp(): Promise<void> {
  if (isTauri()) {
    try {
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
      return;
    } catch (err) {
      console.error("Failed to relaunch application:", err);
      throw err;
    }
  }
  window.location.reload();
}
