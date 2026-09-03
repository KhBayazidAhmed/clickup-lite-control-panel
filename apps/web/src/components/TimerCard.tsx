import { Play, Pause, Square, Flame } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { Button } from "@clickup-lite-control-panel/ui/components/button";

function formatDigital(totalSeconds: number): string {
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

function formatHoursMinutes(totalSeconds: number): string {
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  if (hrs > 0) return `${hrs}h ${mins}m`;
  return `${mins}m`;
}

export function TimerCard() {
  const {
    activeTimer,
    elapsedSeconds,
    todayLoggedSeconds,
    dailyGoalHours,
    pauseTimer,
    resumeTimer,
    stopTimer,
    startTimer,
    tasks,
  } = useAppStore();

  const isRunning = activeTimer?.isRunning ?? false;
  const totalToday = todayLoggedSeconds + (isRunning ? elapsedSeconds : 0);
  const goalSeconds = dailyGoalHours * 3600;
  const progressPercent = Math.min(100, Math.round((totalToday / goalSeconds) * 100));

  const handleStartDefault = () => {
    const firstTask = tasks[0];
    if (firstTask) {
      startTimer(firstTask.id, firstTask.name);
    } else {
      startTimer("general", "General Focus Session");
    }
  };

  return (
    <div className="relative overflow-hidden rounded-xl border border-border/80 bg-card/70 backdrop-blur-md p-4 shadow-sm transition-all">
      {/* Background Subtle Gradient Glow when active */}
      {isRunning && (
        <div className="pointer-events-none absolute -right-6 -top-6 h-28 w-28 rounded-full bg-primary/10 blur-2xl" />
      )}

      <div className="flex items-center justify-between pb-1">
        <div className="flex items-center gap-2">
          <span
            className={`h-2.5 w-2.5 rounded-full ${
              isRunning
                ? "bg-emerald-500 animate-pulse ring-4 ring-emerald-500/20"
                : activeTimer
                  ? "bg-amber-500"
                  : "bg-muted-foreground/40"
            }`}
          />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {isRunning ? "Tracking Time" : activeTimer ? "Timer Paused" : "Idle"}
          </span>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Flame className="h-3.5 w-3.5 text-amber-500" />
          <span>
            Today:{" "}
            <strong className="font-semibold text-foreground">
              {formatHoursMinutes(totalToday)}
            </strong>{" "}
            / {dailyGoalHours}h
          </span>
        </div>
      </div>

      {/* Task Name */}
      <div className="mt-2 min-h-6">
        <p
          className="text-sm font-medium leading-snug line-clamp-1 text-foreground"
          title={activeTimer?.taskName}
        >
          {activeTimer?.taskName || "Select a task or press play to start"}
        </p>
      </div>

      {/* Timer Display & Controls */}
      <div className="mt-3 flex items-center justify-between">
        <div className="font-mono text-3xl font-bold tracking-tight text-foreground select-none">
          {formatDigital(activeTimer ? elapsedSeconds : 0)}
        </div>

        <div className="flex items-center gap-1.5">
          {activeTimer ? (
            <>
              {isRunning ? (
                <Button
                  size="icon-sm"
                  variant="secondary"
                  className="rounded-lg hover:bg-muted cursor-pointer"
                  onClick={pauseTimer}
                  title="Pause Timer"
                >
                  <Pause className="h-4 w-4 fill-foreground" />
                </Button>
              ) : (
                <Button
                  size="icon-sm"
                  variant="default"
                  className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                  onClick={resumeTimer}
                  title="Resume Timer"
                >
                  <Play className="h-4 w-4 fill-white" />
                </Button>
              )}
              <Button
                size="icon-sm"
                variant="destructive"
                className="rounded-lg cursor-pointer"
                onClick={stopTimer}
                title="Stop Timer & Log Time"
              >
                <Square className="h-3.5 w-3.5 fill-current" />
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="default"
              className="gap-1.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground cursor-pointer px-3"
              onClick={handleStartDefault}
            >
              <Play className="h-3.5 w-3.5 fill-primary-foreground" />
              <span>Start</span>
            </Button>
          )}
        </div>
      </div>

      {/* Today's Goal Progress Bar */}
      <div className="mt-3.5">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/60">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>
    </div>
  );
}
