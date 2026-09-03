import { Timer, Bell, BellOff } from "lucide-react";
import { useAppStore } from "../store/useAppStore";

function formatMinutes(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function PomodoroFooter() {
  const {
    isPomodoroActive,
    pomodoroSecondsRemaining,
    togglePomodoro,
    notificationsEnabled,
    setNotificationsEnabled,
  } = useAppStore();

  return (
    <div className="flex h-9 items-center justify-between border-t border-border/70 px-3 text-[11px] bg-muted/20 select-none">
      {/* Pomodoro Focus Toggle */}
      <button
        type="button"
        onClick={togglePomodoro}
        className={`flex items-center gap-1.5 rounded-md px-2 py-1 transition-all cursor-pointer ${
          isPomodoroActive
            ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 font-semibold"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        }`}
        title="Toggle 25-minute Pomodoro Focus session"
      >
        <Timer className={`h-3 w-3 ${isPomodoroActive ? "animate-spin text-amber-500" : ""}`} />
        <span>
          {isPomodoroActive
            ? `Focus: ${formatMinutes(pomodoroSecondsRemaining)}`
            : "Pomodoro Focus (25m)"}
        </span>
      </button>

      {/* Notification Toggle */}
      <button
        type="button"
        onClick={() => setNotificationsEnabled(!notificationsEnabled)}
        className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors cursor-pointer px-1 py-0.5"
        title={notificationsEnabled ? "Notifications enabled" : "Notifications muted"}
      >
        {notificationsEnabled ? (
          <Bell className="h-3 w-3 text-emerald-500" />
        ) : (
          <BellOff className="h-3 w-3 opacity-50" />
        )}
      </button>
    </div>
  );
}
