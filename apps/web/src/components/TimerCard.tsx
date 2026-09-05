import React, { useState } from "react";
import {
  Play,
  Pause,
  Square,
  StickyNote,
  RotateCcw,
  Trash2,
  Flame,
  ChevronDown,
  ChevronUp,
  X,
} from "lucide-react";
import { Button } from "@clickup-lite-control-panel/ui/components/button";
import { useAppStore } from "../store/useAppStore";

function formatDigital(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function formatDurationHhMm(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  if (h === 0 && m === 0) return "0m";
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

// Micro-component for today's accumulated total
const TodaySummary = React.memo(function TodaySummary() {
  const todayLogged = useAppStore((s) => s.todayLoggedSeconds);
  const elapsed = useAppStore((s) => s.elapsedSeconds);
  const hasActive = useAppStore((s) => s.activeTimer !== null);
  const isSyncingTodayTime = useAppStore((s) => s.isSyncing);

  const total = todayLogged + (hasActive ? elapsed : 0);

  return (
    <div
      className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground select-none"
      title="Total time recorded today"
    >
      <Flame className="h-3 w-3 text-amber-500 shrink-0" />
      <span>Today:</span>
      <span
        className={`font-semibold tabular-nums text-foreground ${
          isSyncingTodayTime ? "opacity-50 transition-opacity" : ""
        }`}
      >
        {formatDurationHhMm(total)}
      </span>
    </div>
  );
});

// Micro-component for the daily goal progress bar
const ProgressBar = React.memo(function ProgressBar() {
  const dailyGoalHours = useAppStore((s) => s.dailyGoalHours);
  const todayLogged = useAppStore((s) => s.todayLoggedSeconds);
  const elapsed = useAppStore((s) => s.elapsedSeconds);
  const isRunning = useAppStore((s) => s.activeTimer?.isRunning ?? false);
  const hasActive = useAppStore((s) => s.activeTimer !== null);

  const goalSeconds = (dailyGoalHours || 8) * 3600;
  const currentSeconds = todayLogged + (hasActive ? elapsed : 0);
  const progressPercent = Math.min(100, Math.round((currentSeconds / goalSeconds) * 100));

  return (
    <div
      className="mt-2.5 pt-2 border-t border-border/40 select-none"
      title={`${formatDurationHhMm(currentSeconds)} of ${dailyGoalHours}h daily goal (${progressPercent}%)`}
    >
      <div className="mb-1 flex items-center justify-between text-[10px] text-muted-foreground">
        <span className="font-medium">Daily Goal ({dailyGoalHours}h)</span>
        <span className="tabular-nums font-semibold text-foreground/80">{progressPercent}%</span>
      </div>
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

// Shown when the app starts up and detects an interrupted timer
const RecoveredTimerPrompt = React.memo(function RecoveredTimerPrompt() {
  const recovered = useAppStore((s) => s.recoveredTimer);
  const logRecovered = useAppStore((s) => s.logRecoveredTimer);
  const discardRecovered = useAppStore((s) => s.discardRecoveredTimer);

  if (!recovered) return null;

  return (
    <div className="mb-2.5 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-amber-300 leading-tight">Interrupted Timer Detected</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground truncate">
            &ldquo;{recovered.taskName}&rdquo; tracked{" "}
            {formatDurationHhMm(recovered.trackedSeconds)} before stopping.
          </p>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-end gap-1.5">
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground cursor-pointer"
          onClick={discardRecovered}
          title="Discard this unlogged time"
        >
          <Trash2 className="h-3 w-3 mr-1" />
          Discard
        </Button>
        <Button
          size="sm"
          className="h-6 px-2 text-[11px] bg-amber-500 hover:bg-amber-600 text-white cursor-pointer shadow-xs"
          onClick={logRecovered}
          title="Log the time tracked before the interruption"
        >
          <RotateCcw className="h-3 w-3 mr-1" />
          Log {formatDurationHhMm(recovered.trackedSeconds)}
        </Button>
      </div>
    </div>
  );
});

// Note attached to the running session; saved as the ClickUp time entry's description
const ActiveTaskLine = React.memo(function ActiveTaskLine() {
  const taskName = useAppStore((s) => s.activeTimer?.taskName);
  const storedNote = useAppStore((s) => s.activeTimer?.note ?? "");
  const setTimerNote = useAppStore((s) => s.setTimerNote);

  const [draft, setDraft] = React.useState(storedNote);
  const [isFocused, setIsFocused] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Sync draft when storedNote or taskName changes, unless user is actively editing
  React.useEffect(() => {
    if (!isFocused) {
      setDraft(storedNote);
    }
  }, [storedNote, taskName, isFocused]);

  const commit = () => {
    const next = draft.trim();
    setDraft(next);
    if (next !== storedNote) {
      setTimerNote(next);
    }
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDraft("");
    if (storedNote) {
      setTimerNote("");
    }
    inputRef.current?.focus();
  };

  if (!taskName) {
    return (
      <div className="mt-2 min-h-5 flex items-center">
        <p className="text-xs italic leading-tight text-muted-foreground/70 truncate">
          Click ▶ on any task below to start tracking
        </p>
      </div>
    );
  }

  return (
    <div className="mt-2 flex flex-col gap-1.5">
      {/* Active Task Name */}
      <div className="flex items-center justify-between gap-1.5 min-w-0">
        <p
          className="min-w-0 flex-1 truncate text-xs font-semibold leading-tight text-foreground"
          title={taskName}
        >
          {taskName}
        </p>
      </div>

      {/* Clean, Simple Session Note Input */}
      <div className="flex items-center gap-1.5 rounded-md border border-border/40 bg-secondary/30 px-2 py-1 transition-all focus-within:border-border/80 focus-within:bg-secondary/60 focus-within:ring-1 focus-within:ring-ring/20 group">
        <StickyNote className="h-3 w-3 shrink-0 text-muted-foreground/50 transition-colors group-focus-within:text-foreground/70" />
        <input
          ref={inputRef}
          type="text"
          value={draft}
          maxLength={255}
          placeholder="Add session note…"
          className="min-w-0 flex-1 bg-transparent text-[11px] leading-tight text-foreground placeholder:text-muted-foreground/45 focus:outline-none"
          title="Note saved as ClickUp time entry description"
          onFocus={() => setIsFocused(true)}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            setIsFocused(false);
            commit();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.currentTarget.blur();
            } else if (e.key === "Escape") {
              setDraft(storedNote);
              e.currentTarget.blur();
            }
          }}
        />
        {draft ? (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleClear}
            className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded text-muted-foreground/40 hover:text-foreground hover:bg-secondary transition-colors cursor-pointer"
            title="Clear note"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        ) : null}
      </div>
    </div>
  );
});

export function TimerCard() {
  const activeTimer = useAppStore((s) => s.activeTimer);
  const recoveredTimer = useAppStore((s) => s.recoveredTimer);
  const pauseTimer = useAppStore((s) => s.pauseTimer);
  const resumeTimer = useAppStore((s) => s.resumeTimer);
  const stopTimer = useAppStore((s) => s.stopTimer);
  const todayLogged = useAppStore((s) => s.todayLoggedSeconds);
  const dailyGoalHours = useAppStore((s) => s.dailyGoalHours);

  const [isIdleExpanded, setIsIdleExpanded] = useState(false);

  const isRunning = activeTimer?.isRunning ?? false;
  const isTrackingOrPaused = activeTimer !== null;

  // Calculate goal progress for idle bar
  const goalSeconds = (dailyGoalHours || 8) * 3600;
  const progressPercent = Math.min(100, Math.round((todayLogged / goalSeconds) * 100));

  // If there's an active timer or recovered timer, always show the full tracking card
  const showFullCard = isTrackingOrPaused || Boolean(recoveredTimer) || isIdleExpanded;

  if (!showFullCard) {
    // Compact Idle Summary Bar: Reclaims ~80px for the task list
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-border/70 bg-card/60 px-2.5 py-1.5 transition-all hover:bg-card/90">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <TodaySummary />
          <div className="h-1.5 flex-1 max-w-[100px] overflow-hidden rounded-full bg-secondary/80">
            <div
              className={`h-full transition-all duration-500 rounded-full ${
                progressPercent >= 100
                  ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]"
                  : "bg-muted-foreground/60"
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <span className="text-[10px] text-muted-foreground tabular-nums font-mono">
            {progressPercent}%
          </span>
        </div>

        <button
          type="button"
          onClick={() => setIsIdleExpanded(true)}
          className="flex h-5 items-center gap-1 rounded px-1.5 text-[10px] text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors cursor-pointer shrink-0"
          title="Expand Timer Details"
        >
          <span className="text-[9.5px]">Expand</span>
          <ChevronDown className="h-2.5 w-2.5" />
        </button>
      </div>
    );
  }

  return (
    <div
      className={`relative overflow-hidden rounded-lg border p-2.5 transition-all ${
        isRunning
          ? "border-emerald-500/40 bg-card shadow-[0_0_20px_-8px_rgba(16,185,129,0.25)]"
          : activeTimer
            ? "border-amber-500/30 bg-card"
            : "border-border/80 bg-card"
      }`}
    >
      <RecoveredTimerPrompt />

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
          {activeTimer?.entryId ? (
            <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1 py-0.2 text-[9px] font-semibold text-emerald-400 uppercase tracking-wider">
              ClickUp
            </span>
          ) : isTrackingOrPaused ? (
            <span
              className="rounded border border-amber-500/30 bg-amber-500/10 px-1 py-0.2 text-[9px] font-semibold text-amber-400 uppercase tracking-wider"
              title="Tracking locally"
            >
              Local
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <TodaySummary />
          {!isTrackingOrPaused && !recoveredTimer && (
            <button
              type="button"
              onClick={() => setIsIdleExpanded(false)}
              className="flex h-4 w-4 items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              title="Collapse Timer"
            >
              <ChevronUp className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Active task, with its session note */}
      <ActiveTaskLine />

      {/* Clock Display & Controls */}
      <div className="mt-2 flex items-center justify-between">
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
