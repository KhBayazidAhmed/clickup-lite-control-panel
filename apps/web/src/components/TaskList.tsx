import React, { useState, useMemo, useCallback } from "react";
import {
  Play,
  Pause,
  Plus,
  CheckCircle2,
  Clock,
  Loader2,
  Search,
  X,
  ArrowUpDown,
  ExternalLink,
  Calendar,
  CornerDownLeft,
} from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { ClickUpTask } from "../lib/clickup";
import { openExternalUrl } from "../lib/native";
import { toast } from "sonner";

const PRIORITY_CONFIG: Record<string, { label: string; class: string }> = {
  urgent: {
    label: "Urgent",
    class: "bg-rose-500/15 text-rose-400 border-rose-500/30 font-semibold",
  },
  high: {
    label: "High",
    class: "bg-amber-500/15 text-amber-400 border-amber-500/30 font-semibold",
  },
  normal: { label: "Normal", class: "bg-sky-500/15 text-sky-400 border-sky-500/30" },
  low: { label: "Low", class: "bg-secondary text-muted-foreground border-border/80" },
};

const PRIORITY_ORDER: Record<string, number> = {
  urgent: 1,
  high: 2,
  normal: 3,
  low: 4,
};

function formatDueDate(
  dueDateMs?: string,
): { text: string; isOverdue: boolean; isToday: boolean } | null {
  if (!dueDateMs) return null;
  const due = Number(dueDateMs);
  if (isNaN(due) || due === 0) return null;

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const endOfToday = startOfToday + 86400000;
  const endOfTomorrow = endOfToday + 86400000;

  if (due < startOfToday) {
    const daysAgo = Math.max(1, Math.floor((startOfToday - due) / 86400000));
    return { text: `${daysAgo}d overdue`, isOverdue: true, isToday: false };
  } else if (due < endOfToday) {
    return { text: "Today", isOverdue: false, isToday: true };
  } else if (due < endOfTomorrow) {
    return { text: "Tomorrow", isOverdue: false, isToday: false };
  } else {
    const dateObj = new Date(due);
    const text = dateObj.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    return { text, isOverdue: false, isToday: false };
  }
}

interface TaskRowProps {
  task: ClickUpTask;
  isCurrent: boolean;
  isTimerRunning: boolean;
  onToggleTimer: (task: ClickUpTask) => void;
}

const TaskRow = React.memo(function TaskRow({
  task,
  isCurrent,
  isTimerRunning,
  onToggleTimer,
}: TaskRowProps) {
  const statusName = task.status?.status?.toLowerCase() || "to do";
  const isCompleted = statusName.includes("complete") || statusName.includes("closed");
  const isInProgress = statusName.includes("in progress") || statusName.includes("doing");
  const priorityInfo = task.priority?.priority ? PRIORITY_CONFIG[task.priority.priority] : null;
  const dueInfo = formatDueDate(task.due_date);

  const handleOpenClickUp = (e: React.MouseEvent) => {
    e.stopPropagation();
    const url = `https://app.clickup.com/t/${task.id}`;
    openExternalUrl(url);
    toast.success("Opening in ClickUp...", { duration: 1500 });
  };

  return (
    <div
      onClick={() => onToggleTimer(task)}
      className={`group relative flex items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-xs transition-all cursor-pointer select-none ${
        isCurrent
          ? isTimerRunning
            ? "border-emerald-500/50 bg-emerald-500/10 shadow-xs"
            : "border-amber-500/50 bg-amber-500/10 shadow-xs"
          : "border-border/70 bg-card hover:border-border hover:bg-secondary/40"
      }`}
    >
      {/* Left: Quick Play/Pause Button */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleTimer(task);
        }}
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-all cursor-pointer ${
          isTimerRunning
            ? "bg-emerald-500 text-white shadow-[0_0_8px_rgba(16,185,129,0.5)]"
            : isCurrent
              ? "bg-amber-500 text-white"
              : "bg-secondary text-muted-foreground group-hover:bg-foreground group-hover:text-background"
        }`}
        title={isTimerRunning ? "Pause tracking" : "Track time on this task"}
      >
        {isTimerRunning ? (
          <Pause className="h-3 w-3 fill-current" />
        ) : (
          <Play className="h-3 w-3 fill-current ml-0.5" />
        )}
      </button>

      {/* Middle: Title & Metadata */}
      <div className="flex flex-1 min-w-0 flex-col gap-0.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className={`truncate font-medium text-xs ${
              isCompleted
                ? "line-through text-muted-foreground/60"
                : isCurrent
                  ? "text-foreground font-semibold"
                  : "text-foreground group-hover:text-foreground"
            }`}
            title={task.name}
          >
            {task.name}
          </span>
        </div>

        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          {task.list?.name && (
            <span className="truncate max-w-[100px] font-medium text-muted-foreground/70">
              {task.list.name}
            </span>
          )}

          {priorityInfo && (
            <span
              className={`rounded-xs border px-1 py-0.2 text-[9px] uppercase tracking-wide ${priorityInfo.class}`}
            >
              {priorityInfo.label}
            </span>
          )}

          {dueInfo && (
            <span
              className={`flex items-center gap-0.5 text-[9px] font-medium rounded-xs px-1 py-0.2 border ${
                dueInfo.isOverdue
                  ? "border-rose-500/30 bg-rose-500/15 text-rose-400 font-bold"
                  : dueInfo.isToday
                    ? "border-amber-500/30 bg-amber-500/15 text-amber-400 font-semibold"
                    : "border-border/60 bg-secondary/60 text-muted-foreground"
              }`}
            >
              <Calendar className="h-2.5 w-2.5 shrink-0" />
              <span>{dueInfo.text}</span>
            </span>
          )}
        </div>
      </div>

      {/* Right: Hover Actions & Read-Only Status Badge */}
      <div className="flex items-center gap-1.5 shrink-0">
        {/* Open in ClickUp Web (Revealed on hover) */}
        <button
          type="button"
          onClick={handleOpenClickUp}
          className="opacity-0 group-hover:opacity-100 flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground transition-all cursor-pointer"
          title="Open in ClickUp Web"
        >
          <ExternalLink className="h-3 w-3" />
        </button>

        {/* Read-Only Status Badge */}
        <div
          className={`flex items-center gap-1.2 rounded-md px-1.8 py-0.5 text-[10px] font-medium border select-none cursor-default ${
            isCompleted
              ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
              : isInProgress
                ? "bg-sky-500/15 text-sky-400 border-sky-500/30"
                : "bg-secondary/60 text-muted-foreground border-border/70"
          }`}
          title={`Status: ${task.status?.status || "To Do"} (Read-only)`}
        >
          {isCompleted ? (
            <CheckCircle2 className="h-2.5 w-2.5 text-emerald-400 shrink-0" />
          ) : (
            <span
              className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                isInProgress ? "bg-sky-400" : "bg-muted-foreground/60"
              }`}
              style={task.status?.color ? { backgroundColor: task.status.color } : undefined}
            />
          )}
          <span className="capitalize truncate max-w-[70px] font-normal">
            {task.status?.status || "To Do"}
          </span>
        </div>
      </div>
    </div>
  );
});

export function TaskList() {
  const tasks = useAppStore((s) => s.tasks);
  const isLoadingTasks = useAppStore((s) => s.isLoadingTasks);
  const token = useAppStore((s) => s.token);
  const activeTaskId = useAppStore((s) => s.activeTimer?.taskId);
  const isTimerRunning = useAppStore((s) => s.activeTimer?.isRunning ?? false);
  const activeTab = useAppStore((s) => s.activeTab);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const startTimer = useAppStore((s) => s.startTimer);
  const pauseTimer = useAppStore((s) => s.pauseTimer);
  const resumeTimer = useAppStore((s) => s.resumeTimer);
  const quickAddTask = useAppStore((s) => s.quickAddTask);

  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [sortBy, setSortBy] = useState<"default" | "priority" | "due">("default");

  const handleKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && newTaskTitle.trim()) {
      const title = newTaskTitle.trim();
      setNewTaskTitle("");
      await quickAddTask(title);
      toast.success(`Task created: "${title}"`, { duration: 2000 });
    }
  };

  const handleToggleTimer = useCallback(
    (task: ClickUpTask) => {
      if (activeTaskId === task.id) {
        if (isTimerRunning) {
          pauseTimer();
        } else {
          resumeTimer();
        }
      } else {
        startTimer(task.id, task.name);
      }
    },
    [activeTaskId, isTimerRunning, pauseTimer, resumeTimer, startTimer],
  );

  const activeCount = useMemo(() => {
    return tasks.filter((t) => !t.status?.status?.toLowerCase().includes("complete")).length;
  }, [tasks]);

  const dueCount = useMemo(() => {
    return tasks.filter(
      (t) => Boolean(t.due_date) && !t.status?.status?.toLowerCase().includes("complete"),
    ).length;
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    let list = tasks.filter((t) => {
      const status = t.status?.status?.toLowerCase() || "";
      if (activeTab === "active") {
        if (status.includes("complete") || status.includes("closed")) return false;
      } else if (activeTab === "due") {
        if (!t.due_date) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = t.name.toLowerCase().includes(q);
        const matchProject = t.list?.name?.toLowerCase().includes(q) ?? false;
        const matchPriority = t.priority?.priority?.toLowerCase().includes(q) ?? false;
        if (!matchName && !matchProject && !matchPriority) return false;
      }

      return true;
    });

    if (sortBy === "priority") {
      list = [...list].sort((a, b) => {
        const pA = PRIORITY_ORDER[a.priority?.priority?.toLowerCase() || ""] || 99;
        const pB = PRIORITY_ORDER[b.priority?.priority?.toLowerCase() || ""] || 99;
        return pA - pB;
      });
    } else if (sortBy === "due") {
      list = [...list].sort((a, b) => {
        const dA = a.due_date ? Number(a.due_date) : Infinity;
        const dB = b.due_date ? Number(b.due_date) : Infinity;
        return dA - dB;
      });
    }

    return list;
  }, [tasks, activeTab, searchQuery, sortBy]);

  const cycleSort = () => {
    if (sortBy === "default") {
      setSortBy("priority");
      toast.info("Sorted by Priority", { duration: 1200 });
    } else if (sortBy === "priority") {
      setSortBy("due");
      toast.info("Sorted by Due Date", { duration: 1200 });
    } else {
      setSortBy("default");
      toast.info("Default sort order", { duration: 1200 });
    }
  };

  return (
    <div className="flex flex-col gap-2 flex-1 min-h-0 overflow-hidden">
      {/* Segmented Tabs & Action Row */}
      <div className="flex items-center justify-between gap-1.5 shrink-0">
        {/* macOS Native Segmented Control */}
        <div className="flex items-center rounded-md border border-border/70 bg-secondary/50 p-0.5 text-xs font-medium">
          <button
            type="button"
            onClick={() => setActiveTab("active")}
            className={`rounded px-2 py-0.5 text-[11px] transition-all cursor-pointer ${
              activeTab === "active"
                ? "bg-foreground text-background shadow-xs font-bold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Active ({activeCount})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("due")}
            className={`rounded px-2 py-0.5 text-[11px] transition-all cursor-pointer ${
              activeTab === "due"
                ? "bg-foreground text-background shadow-xs font-bold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Due ({dueCount})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("all")}
            className={`rounded px-2 py-0.5 text-[11px] transition-all cursor-pointer ${
              activeTab === "all"
                ? "bg-foreground text-background shadow-xs font-bold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            All ({tasks.length})
          </button>
        </div>

        {/* Action icons: Sort & Search */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={cycleSort}
            className={`flex h-6 items-center gap-1 rounded-md px-1.5 text-[10px] transition-colors cursor-pointer border ${
              sortBy !== "default"
                ? "border-foreground bg-foreground text-background font-bold shadow-xs"
                : "border-border/60 bg-secondary/50 text-muted-foreground hover:text-foreground"
            }`}
            title={`Sort: ${sortBy.toUpperCase()} (Click to toggle)`}
          >
            <ArrowUpDown className="h-2.5 w-2.5" />
            <span className="capitalize">{sortBy === "default" ? "Sort" : sortBy}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setIsSearchOpen(!isSearchOpen);
              if (isSearchOpen) setSearchQuery("");
            }}
            className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors cursor-pointer border ${
              isSearchOpen || searchQuery
                ? "border-foreground bg-foreground text-background"
                : "border-border/60 bg-secondary/50 text-muted-foreground hover:text-foreground"
            }`}
            title={isSearchOpen ? "Close Search" : "Search Tasks"}
          >
            {isSearchOpen ? <X className="h-3 w-3" /> : <Search className="h-3 w-3" />}
          </button>
        </div>
      </div>

      {/* Expandable Search Bar */}
      {(isSearchOpen || searchQuery) && (
        <div className="relative flex items-center shrink-0 animate-in fade-in duration-150">
          <Search className="absolute left-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter tasks by name, list, or priority..."
            autoFocus
            className="h-7 w-full rounded-md border border-border bg-card pl-8 pr-7 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-foreground focus:outline-none transition-all"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2 text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      )}

      {/* Quick Add Bar */}
      <div className="relative flex items-center shrink-0">
        <Plus className="absolute left-2.5 h-3.5 w-3.5 text-muted-foreground" />
        <input
          type="text"
          value={newTaskTitle}
          onChange={(e) => setNewTaskTitle(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Quick add task to ClickUp..."
          className="h-7.5 w-full rounded-md border border-border/80 bg-secondary/40 pl-8 pr-7 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-foreground focus:bg-card focus:outline-none transition-all"
        />
        <div className="absolute right-2 flex items-center pointer-events-none text-[10px] text-muted-foreground/60 border border-border/80 rounded px-1">
          <CornerDownLeft className="h-2.5 w-2.5" />
        </div>
      </div>

      {/* Task Rows List - Truly flex-1 scrollable */}
      <div className="flex flex-col gap-1.5 flex-1 min-h-0 overflow-y-auto pr-0.5">
        {isLoadingTasks && tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center text-xs text-muted-foreground">
            <Loader2 className="mb-2 h-4 w-4 animate-spin text-foreground" />
            <p>Syncing tasks from ClickUp...</p>
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 px-4 text-center text-xs text-muted-foreground">
            <Clock className="mb-2 h-5 w-5 opacity-40 text-muted-foreground" />
            <p className="font-semibold text-foreground">
              {searchQuery ? `No tasks match "${searchQuery}"` : "No tasks found"}
            </p>
            {searchQuery ? (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="mt-2 text-xs text-foreground underline cursor-pointer"
              >
                Clear filter
              </button>
            ) : !token ? (
              <p className="mt-1 text-[11px] text-muted-foreground/80 max-w-[240px]">
                Connect your ClickUp account in Settings or type a task title above.
              </p>
            ) : tasks.length > 0 && activeTab === "active" ? (
              <p className="mt-1 text-[11px] text-muted-foreground/80">
                You're all caught up! No active tasks pending.
              </p>
            ) : (
              <p className="mt-1 text-[11px] text-muted-foreground/80">
                No tasks assigned to your user in this workspace.
              </p>
            )}
          </div>
        ) : (
          filteredTasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              isCurrent={activeTaskId === task.id}
              isTimerRunning={activeTaskId === task.id && isTimerRunning}
              onToggleTimer={handleToggleTimer}
            />
          ))
        )}
      </div>
    </div>
  );
}
