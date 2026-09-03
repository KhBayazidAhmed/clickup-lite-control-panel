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
  const token = useAppStore((s) => s.token);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    }
  }, [token, syncAll]);

  // Adaptive background polling:
  // When visible: poll current timer & today's time every 15s
  // When hidden: poll only active timer at relaxed 45s interval to save battery and API quota
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
      }, intervalMs);
    };

    setupPolling();

    const onVisibilityChange = () => setupPolling();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      clearInterval(timerId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [token, syncCurrentTimer, syncTodayTime]);

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
    }, 300);
  }, [tick, token, syncCurrentTimer, syncTodayTime]);

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
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      if (unlistenTauriFocus) {
        unlistenTauriFocus();
      }
    };
  }, [handleWakeup]);

  return (
    <div className="flex h-full w-full flex-col bg-background/95 backdrop-blur-xl border border-border/80 rounded-xl overflow-hidden shadow-2xl">
      {/* Native Control Panel Header */}
      <ControlPanelHeader onOpenSettings={() => setIsSettingsOpen(true)} />

      {/* Main Panel Content Area */}
      <div className="flex flex-1 flex-col gap-3 p-3 overflow-hidden">
        {/* Time Tracking Widget */}
        <TimerCard />

        {/* Task Management Widget */}
        <TaskList />
      </div>

      {/* Pomodoro & Notifications Footer */}
      <PomodoroFooter />

      {/* ClickUp OAuth / Settings Modal */}
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </div>
  );
}
