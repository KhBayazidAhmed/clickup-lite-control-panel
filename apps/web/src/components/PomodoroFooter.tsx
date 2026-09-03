import React from "react";
import { Timer, Bell, BellOff } from "lucide-react";
import { useAppStore } from "../store/useAppStore";

function formatMinutes(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export const PomodoroFooter = React.memo(function PomodoroFooter() {
  const isPomodoroActive = useAppStore((s) => s.isPomodoroActive);
  const pomodoroSecondsRemaining = useAppStore((s) => s.pomodoroSecondsRemaining);
  const pomodoroDurationMinutes = useAppStore((s) => s.pomodoroDurationMinutes);
  const togglePomodoro = useAppStore((s) => s.togglePomodoro);
  const notificationsEnabled = useAppStore((s) => s.notificationsEnabled);
  const setNotificationsEnabled = useAppStore((s) => s.setNotificationsEnabled);

  return (
    <div className="flex h-8 shrink-0 items-center justify-between border-t border-border/80 px-2.5 text-[11px] bg-card/60 backdrop-blur-md select-none">
      {/* Pomodoro Focus Toggle */}
      <button
        type="button"
        onClick={togglePomodoro}
        className={`flex items-center gap-1.5 rounded px-2 py-0.5 transition-all cursor-pointer ${
          isPomodoroActive
            ? "bg-amber-500/20 text-amber-400 border border-amber-500/30 font-semibold shadow-xs"
            : "text-muted-foreground hover:bg-secondary hover:text-foreground border border-transparent"
        }`}
        title={`Toggle ${pomodoroDurationMinutes}-minute Pomodoro session`}
      >
        <Timer className={`h-3 w-3 ${isPomodoroActive ? "animate-spin text-amber-400" : ""}`} />
        <span>
          {isPomodoroActive
            ? `Pomodoro: ${formatMinutes(pomodoroSecondsRemaining)}`
            : `Pomodoro Focus (${pomodoroDurationMinutes}m)`}
        </span>
      </button>

      {/* Notification Toggle */}
      <button
        type="button"
        onClick={() => setNotificationsEnabled(!notificationsEnabled)}
        className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors cursor-pointer px-1.5 py-0.5 rounded hover:bg-secondary"
        title={notificationsEnabled ? "Desktop notifications enabled" : "Notifications muted"}
      >
        {notificationsEnabled ? (
          <>
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            <Bell className="h-3 w-3 text-emerald-400" />
          </>
        ) : (
          <BellOff className="h-3 w-3 opacity-40" />
        )}
      </button>
    </div>
  );
});
