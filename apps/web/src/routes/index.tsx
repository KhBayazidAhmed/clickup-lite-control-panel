import { useEffect, useState, useCallback, useRef } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useAppStore } from "../store/useAppStore";
import { ControlPanelHeader } from "../components/ControlPanelHeader";
import { TimerCard } from "../components/TimerCard";
import { TaskList } from "../components/TaskList";
import { PomodoroFooter } from "../components/PomodoroFooter";
import { SettingsModal } from "../components/SettingsModal";
import { isTauri, notify } from "../lib/native";
import { ClickUpClient, exchangeOAuthCode } from "../lib/clickup";

export const Route = createFileRoute("/")({
  component: HomeComponent,
});

function HomeComponent() {
  const tick = useAppStore((s) => s.tick);
  const syncAll = useAppStore((s) => s.syncAll);
  const syncCurrentTimer = useAppStore((s) => s.syncCurrentTimer);
  const syncTodayTime = useAppStore((s) => s.syncTodayTime);
  const pollTaskUpdates = useAppStore((s) => s.pollTaskUpdates);
  const token = useAppStore((s) => s.token);
  const setToken = useAppStore((s) => s.setToken);
  const setUser = useAppStore((s) => s.setUser);
  const setTeam = useAppStore((s) => s.setTeam);
  const setAvailableUpdateVersion = useAppStore((s) => s.setAvailableUpdateVersion);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTaskPollRef = useRef<number>(0);
  const lastProcessedCodeRef = useRef<string>("");

  // Global 1-second interval for active timer ticking & Pomodoro
  useEffect(() => {
    const timer = setInterval(() => {
      tick();
    }, 1000);
    return () => clearInterval(timer);
  }, [tick]);

  // Background update check on app startup
  useEffect(() => {
    if (!isTauri()) return;
    const timer = setTimeout(async () => {
      try {
        const { checkAppUpdate } = await import("../lib/updater");
        const res = await checkAppUpdate();
        if (res.updateAvailable && res.updateInfo?.version) {
          setAvailableUpdateVersion(res.updateInfo.version);
        }
      } catch (e) {
        console.warn("Background update check failed:", e);
      }
    }, 4000);
    return () => clearTimeout(timer);
  }, [setAvailableUpdateVersion]);

  // Initial sync on mount and when token changes
  useEffect(() => {
    if (token) {
      syncAll();
      lastTaskPollRef.current = Date.now();
    }
  }, [token, syncAll]);

  // Adaptive background polling:
  // Timer & today's hours: every 15s (visible) / 45s (hidden)
  // Smart Task & Notification polling: every 60s (visible) / 120s (hidden)
  useEffect(() => {
    if (!token) return;

    let timerId: ReturnType<typeof setInterval>;

    const setupPolling = () => {
      clearInterval(timerId);
      const isHidden = typeof document !== "undefined" && document.hidden;
      const intervalMs = isHidden ? 45000 : 15000;

      timerId = setInterval(() => {
        syncCurrentTimer();
        if (!document.hidden) {
          syncTodayTime();
        }

        // Smart polling check for task updates and due-soon notifications
        const now = Date.now();
        const taskPollIntervalMs = document.hidden ? 120000 : 60000;
        if (now - lastTaskPollRef.current >= taskPollIntervalMs) {
          lastTaskPollRef.current = now;
          pollTaskUpdates();
        }
      }, intervalMs);
    };

    setupPolling();

    const onVisibilityChange = () => setupPolling();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      clearInterval(timerId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [token, syncCurrentTimer, syncTodayTime, pollTaskUpdates]);

  // Debounced wakeup: immediately refresh elapsed digits locally, debounce network sync
  const handleWakeup = useCallback(() => {
    tick(); // 0ms perceived lag for clock

    if (!token) return;
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      syncCurrentTimer();
      syncTodayTime();
      if (Date.now() - lastTaskPollRef.current >= 45000) {
        lastTaskPollRef.current = Date.now();
        pollTaskUpdates();
      }
    }, 300);
  }, [tick, token, syncCurrentTimer, syncTodayTime, pollTaskUpdates]);

  // Global listeners for window focus, tray sync, and OAuth code callback
  useEffect(() => {
    const onVisibilityChange = () => {
      if (!document.hidden) {
        handleWakeup();
      }
    };
    const onWindowFocus = () => {
      handleWakeup();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onWindowFocus);

    let unlistenTauriFocus: (() => void) | undefined;
    let unlistenTraySync: (() => void) | undefined;
    let unlistenCheckUpdates: (() => void) | undefined;
    let unlistenOAuthCode: (() => void) | undefined;
    let unlistenOAuthCodeReceived: (() => void) | undefined;

    if (isTauri()) {
      import("@tauri-apps/api/webviewWindow")
        .then(({ getCurrentWebviewWindow }) => {
          getCurrentWebviewWindow()
            .onFocusChanged(({ payload: focused }) => {
              if (focused) {
                handleWakeup();
              }
            })
            .then((unsub) => {
              unlistenTauriFocus = unsub;
            })
            .catch(() => {});
        })
        .catch(() => {});

      import("@tauri-apps/api/event")
        .then(({ listen }) => {
          // Listen for right-click tray sync
          listen("tray-sync-requested", () => {
            syncAll();
          }).then((unsub) => {
            unlistenTraySync = unsub;
          });

          // Listen for right-click tray check updates
          listen("check-updates-requested", () => {
            setIsSettingsOpen(true);
          }).then((unsub) => {
            unlistenCheckUpdates = unsub;
          });

          // Global OAuth handler: captures code even if modal is closed or window blurs
          const handleGlobalOAuth = async (rawPayload: unknown) => {
            let code: string | undefined;
            if (typeof rawPayload === "string") {
              code = rawPayload;
            } else if (rawPayload && typeof rawPayload === "object") {
              code = (rawPayload as { code?: string }).code;
            }

            if (!code || code === lastProcessedCodeRef.current) return;
            lastProcessedCodeRef.current = code;

            const store = useAppStore.getState();
            const clientId =
              store.customClientId || (import.meta.env.VITE_CLICKUP_CLIENT_ID as string) || "";
            const clientSecret =
              store.customClientSecret ||
              (import.meta.env.VITE_CLICKUP_CLIENT_SECRET as string) ||
              "";

            if (!clientId || !clientSecret) {
              console.warn(
                "OAuth authorization code received, but Client ID or Secret is missing.",
              );
              return;
            }

            try {
              const accessToken = await exchangeOAuthCode(clientId, clientSecret, code);
              if (accessToken) {
                const client = new ClickUpClient(accessToken);
                const user = await client.getCurrentUser();
                const teams = await client.getTeams();

                setToken(accessToken);
                setUser(user);
                if (teams?.[0]) {
                  setTeam(teams[0].id, teams[0].name);
                }

                notify("Connected to ClickUp", `Logged in as ${user.username || "User"}`);
                setTimeout(() => {
                  syncAll();
                }, 400);
              }
            } catch (err) {
              console.error("Global OAuth code handling failed:", err);
            }
          };

          listen<unknown>("oauth-code", (event) => {
            handleGlobalOAuth(event.payload);
          }).then((unsub) => {
            unlistenOAuthCode = unsub;
          });

          listen<unknown>("oauth-code-received", (event) => {
            handleGlobalOAuth(event.payload);
          }).then((unsub) => {
            unlistenOAuthCodeReceived = unsub;
          });
        })
        .catch(() => {});
    }

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onWindowFocus);
      if (unlistenTauriFocus) {
        unlistenTauriFocus();
      }
      if (unlistenTraySync) {
        unlistenTraySync();
      }
      if (unlistenCheckUpdates) {
        unlistenCheckUpdates();
      }
      if (unlistenOAuthCode) {
        unlistenOAuthCode();
      }
      if (unlistenOAuthCodeReceived) {
        unlistenOAuthCodeReceived();
      }
    };
  }, [handleWakeup, syncAll, setToken, setUser, setTeam]);

  return (
    <div className="flex h-screen w-full flex-col bg-background font-sans text-foreground select-none overflow-hidden antialiased">
      {/* Dynamic Header */}
      <ControlPanelHeader onOpenSettings={() => setIsSettingsOpen(true)} />

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col gap-2 overflow-hidden p-2.5">
        {/* Active Timer Card */}
        <TimerCard />

        {/* Compact Task List with Tabs & Quick Add */}
        <TaskList />
      </div>

      {/* Pomodoro & Notifications Footer */}
      <PomodoroFooter />

      {/* Settings Modal */}
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </div>
  );
}
