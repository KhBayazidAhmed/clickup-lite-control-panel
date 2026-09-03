import { useEffect, useState, useCallback, useRef } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useAppStore } from "../store/useAppStore";
import { ControlPanelHeader } from "../components/ControlPanelHeader";
import { TimerCard } from "../components/TimerCard";
import { TaskList } from "../components/TaskList";
import { PomodoroFooter } from "../components/PomodoroFooter";
import { SettingsModal } from "../components/SettingsModal";
import { isTauri } from "../lib/native";

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

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTaskPollRef = useRef<number>(0);

  // Global 1-second interval for active timer ticking & Pomodoro
  useEffect(() => {
    const timer = setInterval(() => {
      tick();
    }, 1000);
    return () => clearInterval(timer);
  }, [tick]);

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
    }

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onWindowFocus);
      if (unlistenTauriFocus) {
        unlistenTauriFocus();
      }
    };
  }, [handleWakeup]);

  return (
    <div className="flex h-screen w-full flex-col bg-background font-sans text-foreground select-none overflow-hidden antialiased">
      {/* Dynamic Header */}
      <ControlPanelHeader onOpenSettings={() => setIsSettingsOpen(true)} />

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col gap-2.5 overflow-hidden p-3">
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
