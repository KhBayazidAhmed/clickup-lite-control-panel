import React from "react";
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

// Micro-component isolated to elapsed time ticks (prevents parent card re-render)
const DigitalClock = React.memo(function DigitalClock() {
  const elapsedSeconds = useAppStore((s) => s.elapsedSeconds);
  const hasActive = useAppStore((s) => s.activeTimer !== null);

  return (
    <div className="font-mono text-2xl font-bold tracking-tight text-foreground tabular-nums select-none leading-none">
      {formatDigital(hasActive ? elapsedSeconds : 0)}
    </div>
  );
});

// Micro-component for today's summary
const TodaySummary = React.memo(function TodaySummary() {
  const todayLoggedSeconds = useAppStore((s) => s.todayLoggedSeconds);
  const elapsedSeconds = useAppStore((s) => s.elapsedSeconds);
  const isRunning = useAppStore((s) => s.activeTimer?.isRunning ?? false);
  const dailyGoalHours = useAppStore((s) => s.dailyGoalHours);

  const totalToday = todayLoggedSeconds + (isRunning ? elapsedSeconds : 0);
  const goalSeconds = dailyGoalHours * 3600;
  const progressPercent = Math.min(100, Math.round((totalToday / goalSeconds) * 100));

  return (
    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
      <Flame className="h-3 w-3 text-amber-500 shrink-0" />
      <span>
        Today:{" "}
        <strong className="font-semibold text-foreground">{formatHoursMinutes(totalToday)}</strong>
        <span className="opacity-60"> / {dailyGoalHours}h</span>
      </span>
      <span className="font-mono text-[10px] text-muted-foreground/80 font-medium">
        ({progressPercent}%)
      </span>
    </div>
  );
});

const ProgressBar = React.memo(function ProgressBar() {
  const todayLoggedSeconds = useAppStore((s) => s.todayLoggedSeconds);
  const elapsedSeconds = useAppStore((s) => s.elapsedSeconds);
  const isRunning = useAppStore((s) => s.activeTimer?.isRunning ?? false);
  const dailyGoalHours = useAppStore((s) => s.dailyGoalHours);

  const totalToday = todayLoggedSeconds + (isRunning ? elapsedSeconds : 0);
  const goalSeconds = dailyGoalHours * 3600;
  const progressPercent = Math.min(100, Math.round((totalToday / goalSeconds) * 100));

  return (
    <div className="mt-2.5">
      <div className="h-1 w-full overflow-hidden rounded-full bg-secondary/80">
        <div
          className={`h-full transition-all duration-500 rounded-full ${
            progressPercent >= 100
              ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"
              : isRunning
                ? "bg-foreground shadow-[0_0_8px_rgba(255,255,255,0.4)]"
                : "bg-muted-foreground/60"
          }`}
          style={{ width: `${progressPercent}%` }}
        />
      </div>
    </div>
  );
});

export function TimerCard() {
  const activeTimer = useAppStore((s) => s.activeTimer);
  const pauseTimer = useAppStore((s) => s.pauseTimer);
  const resumeTimer = useAppStore((s) => s.resumeTimer);
  const stopTimer = useAppStore((s) => s.stopTimer);

  const isRunning = activeTimer?.isRunning ?? false;

  return (
    <div
      className={`relative overflow-hidden rounded-lg border p-3 transition-all ${
        isRunning
          ? "border-emerald-500/40 bg-card shadow-[0_0_20px_-8px_rgba(16,185,129,0.25)]"
          : activeTimer
            ? "border-amber-500/30 bg-card"
            : "border-border/80 bg-card"
      }`}
    >
      {/* Top Status & Summary Line */}
      <div className="flex items-center justify-between pb-1.5 border-b border-border/40">
        <div className="flex items-center gap-1.5">
          <span
            className={`h-2 w-2 rounded-full shrink-0 ${
              isRunning
                ? "bg-emerald-500 shadow-[0_0_6px_#10b981] animate-pulse"
                : activeTimer
                  ? "bg-amber-500"
                  : "bg-muted-foreground/40"
            }`}
          />
          <span
            className={`text-[10px] font-bold uppercase tracking-wider ${
              isRunning
                ? "text-emerald-400"
                : activeTimer
                  ? "text-amber-400"
                  : "text-muted-foreground"
            }`}
          >
            {isRunning ? "Tracking" : activeTimer ? "Paused" : "Idle"}
          </span>
          {activeTimer?.entryId && (
            <span className="rounded border border-border/60 bg-secondary/80 px-1 py-0.2 text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">
              ClickUp
            </span>
          )}
        </div>

        <TodaySummary />
      </div>

      {/* Active Task Name */}
      <div className="mt-2 min-h-5 flex items-center justify-between gap-2">
        <p
          className={`text-xs font-semibold leading-tight line-clamp-1 truncate ${
            activeTimer ? "text-foreground" : "text-muted-foreground/70 italic font-normal"
          }`}
          title={activeTimer?.taskName}
        >
          {activeTimer?.taskName || "Click ▶ on any task below to start tracking"}
        </p>
      </div>

      {/* Clock Display & Controls */}
      <div className="mt-2.5 flex items-center justify-between">
        <DigitalClock />

        <div className="flex items-center gap-1.5">
          {activeTimer ? (
            <>
              {isRunning ? (
                <Button
                  size="icon-sm"
                  variant="secondary"
                  className="h-7 w-7 rounded-md bg-secondary hover:bg-secondary/80 cursor-pointer transition-colors"
                  onClick={pauseTimer}
                  title="Pause Timer"
                >
                  <Pause className="h-3.5 w-3.5 fill-current" />
                </Button>
              ) : (
                <Button
                  size="icon-sm"
                  className="h-7 w-7 rounded-md bg-emerald-500 hover:bg-emerald-600 text-white cursor-pointer transition-colors shadow-xs"
                  onClick={resumeTimer}
                  title="Resume Timer"
                >
                  <Play className="h-3.5 w-3.5 fill-current ml-0.5" />
                </Button>
              )}
              <Button
                size="icon-sm"
                variant="destructive"
                className="h-7 w-7 rounded-md cursor-pointer transition-colors"
                onClick={stopTimer}
                title="Stop Timer & Log Time"
              >
                <Square className="h-3 w-3 fill-current" />
              </Button>
            </>
          ) : (
            <div
              className="flex items-center gap-1 rounded-md border border-border/60 bg-secondary/40 px-2 py-1 text-[10.5px] font-medium text-muted-foreground/70 select-none"
              title="Click the start button (▶) on any task below to begin time tracking"
            >
              <Play className="h-2.5 w-2.5 fill-current opacity-60" />
              <span>Select task</span>
            </div>
          )}
        </div>
      </div>

      {/* Daily Goal Bar */}
      <ProgressBar />
    </div>
  );
}
