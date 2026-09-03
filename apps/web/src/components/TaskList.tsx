import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
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
  Folder,
  ChevronDown,
  Flag,
  RefreshCw,
  Check,
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

const PRIORITY_OPTIONS = [
  { value: undefined, label: "No Priority", color: "text-muted-foreground" },
  { value: 1, label: "Urgent", color: "text-rose-500" },
  { value: 2, label: "High", color: "text-amber-500" },
  { value: 3, label: "Normal", color: "text-sky-500" },
  { value: 4, label: "Low", color: "text-slate-400" },
];

function formatDueDate(
  dueDateMs?: string | null,
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
  const priorityKey = task.priority?.priority?.toLowerCase();
  const priorityInfo = priorityKey ? PRIORITY_CONFIG[priorityKey] : null;
  const dueInfo = formatDueDate(task.due_date);

  const handleOpenClickUp = (e: React.MouseEvent) => {
    e.stopPropagation();
    const url = `https://app.clickup.com/t/${task.id}`;
    openExternalUrl(url);
    toast.success("Opening in ClickUp...", { duration: 1500 });
  };

  return (
    <div
      className={`group relative flex items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-xs transition-all cursor-default select-none ${
        isCurrent
          ? isTimerRunning
            ? "border-emerald-500/50 bg-emerald-500/10 shadow-xs"
            : "border-amber-500/50 bg-amber-500/10 shadow-xs"
          : "border-border/70 bg-card hover:border-border hover:bg-secondary/30"
      }`}
    >
      {/* Left: Dedicated Task Start / Pause Button */}
      <button
        type="button"
        onClick={() => onToggleTimer(task)}
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-all cursor-pointer ${
          isTimerRunning
            ? "bg-emerald-500 text-white shadow-[0_0_8px_rgba(16,185,129,0.5)] hover:bg-emerald-600"
            : isCurrent
              ? "bg-amber-500 text-white hover:bg-amber-600"
              : "bg-secondary text-muted-foreground hover:bg-foreground hover:text-background"
        }`}
        title={isTimerRunning ? "Pause time tracking" : "Start time tracking on this task"}
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
                  : "text-foreground"
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
  const availableLists = useAppStore((s) => s.availableLists);
  const selectedListId = useAppStore((s) => s.selectedListId);
  const setSelectedListId = useAppStore((s) => s.setSelectedListId);
  const fetchLists = useAppStore((s) => s.fetchLists);
  const isLoadingLists = useAppStore((s) => s.isLoadingLists);
  const isCreatingTask = useAppStore((s) => s.isCreatingTask);
  const createTask = useAppStore((s) => s.createTask);

  // Unified Search & Add input state
  const [taskInput, setTaskInput] = useState("");
  const [selectedPriority, setSelectedPriority] = useState<number | undefined>(undefined);
  const [isListPickerOpen, setIsListPickerOpen] = useState(false);
  const [isPriorityPickerOpen, setIsPriorityPickerOpen] = useState(false);
  const [listSearchQuery, setListSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"default" | "priority" | "due">("default");

  const inputRef = useRef<HTMLInputElement>(null);
  const listPickerRef = useRef<HTMLDivElement>(null);
  const priorityPickerRef = useRef<HTMLDivElement>(null);

  // Auto-fetch lists if connected and none stored
  useEffect(() => {
    if (token && availableLists.length === 0) {
      fetchLists();
    }
  }, [token, availableLists.length, fetchLists]);

  // Global keyboard shortcut: Cmd+F or Ctrl+F focuses unified input
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (listPickerRef.current && !listPickerRef.current.contains(e.target as Node)) {
        setIsListPickerOpen(false);
      }
      if (priorityPickerRef.current && !priorityPickerRef.current.contains(e.target as Node)) {
        setIsPriorityPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const selectedList = useMemo(() => {
    if (selectedListId) {
      const found = availableLists.find((l) => l.id === selectedListId);
      if (found) return found;
    }
    return availableLists[0] || null;
  }, [selectedListId, availableLists]);

  const filteredLists = useMemo(() => {
    if (!listSearchQuery.trim()) return availableLists;
    const q = listSearchQuery.toLowerCase();
    return availableLists.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        l.space?.name.toLowerCase().includes(q) ||
        l.folder?.name.toLowerCase().includes(q),
    );
  }, [availableLists, listSearchQuery]);

  const handleCreateTask = async () => {
    const title = taskInput.trim();
    if (!title || isCreatingTask) return;

    try {
      const created = await createTask({
        name: title,
        listId: selectedList?.id,
        priority: selectedPriority,
      });
      setTaskInput("");
      const destName = created.list?.name || selectedList?.name || "ClickUp";
      toast.success(`Task created in ${destName}!`, { duration: 2500 });
    } catch (err) {
      console.error("Task creation failed:", err);
      toast.error(err instanceof Error ? err.message : "Failed to create task", {
        duration: 3500,
      });
    }
  };

  const handleKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setTaskInput("");
      inputRef.current?.blur();
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      await handleCreateTask();
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

  // Real-time task filtering using the unified taskInput
  const filteredTasks = useMemo(() => {
    let list = tasks.filter((t) => {
      const status = t.status?.status?.toLowerCase() || "";
      if (activeTab === "active") {
        if (status.includes("complete") || status.includes("closed")) return false;
      } else if (activeTab === "due") {
        if (!t.due_date) return false;
      }

      if (taskInput.trim()) {
        const q = taskInput.toLowerCase().trim();
        const matchName = t.name.toLowerCase().includes(q);
        const matchProject = t.list?.name?.toLowerCase().includes(q) ?? false;
        const matchPriority = t.priority?.priority?.toLowerCase().includes(q) ?? false;
        const matchStatus = t.status?.status?.toLowerCase().includes(q) ?? false;
        if (!matchName && !matchProject && !matchPriority && !matchStatus) return false;
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
  }, [tasks, activeTab, taskInput, sortBy]);

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

  const currentPriorityObj = PRIORITY_OPTIONS.find((p) => p.value === selectedPriority);

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

        {/* Action icons: Sort & Focus Search */}
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
              inputRef.current?.focus();
              inputRef.current?.select();
            }}
            className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors cursor-pointer border ${
              taskInput.trim()
                ? "border-foreground bg-foreground text-background"
                : "border-border/60 bg-secondary/50 text-muted-foreground hover:text-foreground"
            }`}
            title="Search or Add Task (Cmd+F)"
          >
            <Search className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Unified Search & Quick Add Section */}
      <div className="flex flex-col gap-1.5 rounded-lg border border-border/80 bg-secondary/25 p-1.5 shrink-0">
        <div className="relative flex items-center">
          {isCreatingTask ? (
            <Loader2 className="absolute left-2.5 h-3.5 w-3.5 animate-spin text-primary shrink-0" />
          ) : (
            <Search className="absolute left-2.5 h-3.5 w-3.5 text-muted-foreground/70 shrink-0" />
          )}

          <input
            ref={inputRef}
            type="text"
            value={taskInput}
            onChange={(e) => setTaskInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isCreatingTask}
            placeholder={
              selectedList
                ? `Search or press ↵ to add to ${selectedList.name}...`
                : "Search or press ↵ to add task..."
            }
            className="h-7.5 w-full rounded-md border border-border/80 bg-background pl-8 pr-16 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-foreground focus:outline-none transition-all disabled:opacity-60"
          />

          {/* Action buttons inside input */}
          <div className="absolute right-1.5 flex items-center gap-1">
            {taskInput && (
              <button
                type="button"
                onClick={() => {
                  setTaskInput("");
                  inputRef.current?.focus();
                }}
                className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-foreground cursor-pointer"
                title="Clear input (Esc)"
              >
                <X className="h-3 w-3" />
              </button>
            )}

            <button
              type="button"
              onClick={handleCreateTask}
              disabled={!taskInput.trim() || isCreatingTask}
              className="flex h-5 items-center gap-1 rounded bg-secondary px-1.5 text-[10px] font-medium text-foreground hover:bg-foreground hover:text-background transition-all disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
              title={`Press Enter to create "${taskInput.trim()}"`}
            >
              {isCreatingTask ? (
                <Loader2 className="h-2.5 w-2.5 animate-spin" />
              ) : (
                <>
                  <span>Add</span>
                  <CornerDownLeft className="h-2.5 w-2.5 opacity-60" />
                </>
              )}
            </button>
          </div>
        </div>

        {/* Task Destination & Priority Selector Row */}
        <div className="flex items-center justify-between gap-1 px-1 text-[10px]">
          {/* List Selector Dropdown */}
          <div className="relative min-w-0 flex-1" ref={listPickerRef}>
            <button
              type="button"
              onClick={() => {
                setIsListPickerOpen(!isListPickerOpen);
                setIsPriorityPickerOpen(false);
                if (!isListPickerOpen && availableLists.length === 0 && token) {
                  fetchLists();
                }
              }}
              className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors cursor-pointer max-w-full truncate"
              title="Click to change destination ClickUp list"
            >
              <Folder className="h-3 w-3 shrink-0 text-amber-500/80" />
              <span className="truncate font-medium">
                {selectedList?.name || (token ? "Select list" : "Local Tasks")}
              </span>
              <ChevronDown className="h-2.5 w-2.5 shrink-0 opacity-60" />
            </button>

            {/* List Picker Dropdown Menu */}
            {isListPickerOpen && (
              <div className="absolute top-full left-0 mt-1 w-64 max-h-56 overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-lg z-50 animate-in fade-in zoom-in-95 duration-100 flex flex-col">
                <div className="flex items-center justify-between border-b border-border/60 px-2 py-1 mb-1 shrink-0">
                  <span className="font-semibold text-[10.5px]">ClickUp Lists</span>
                  {token && (
                    <button
                      type="button"
                      onClick={() => fetchLists()}
                      disabled={isLoadingLists}
                      className="flex items-center gap-1 text-[9.5px] text-muted-foreground hover:text-foreground cursor-pointer disabled:opacity-50"
                      title="Refresh lists from ClickUp"
                    >
                      <RefreshCw
                        className={`h-2.5 w-2.5 ${isLoadingLists ? "animate-spin" : ""}`}
                      />
                      <span>Sync</span>
                    </button>
                  )}
                </div>

                {availableLists.length > 5 && (
                  <div className="px-1.5 pb-1 shrink-0">
                    <input
                      type="text"
                      value={listSearchQuery}
                      onChange={(e) => setListSearchQuery(e.target.value)}
                      placeholder="Search lists..."
                      className="h-6 w-full rounded border border-border bg-background px-1.5 text-[10px] focus:outline-none"
                    />
                  </div>
                )}

                <div className="overflow-y-auto flex-1 flex flex-col gap-0.5">
                  {isLoadingLists && availableLists.length === 0 ? (
                    <div className="flex items-center justify-center gap-1.5 py-4 text-xs text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      <span>Fetching lists...</span>
                    </div>
                  ) : filteredLists.length === 0 ? (
                    <div className="py-3 px-2 text-center text-[10.5px] text-muted-foreground">
                      {token ? "No lists found" : "Log in to view ClickUp lists"}
                    </div>
                  ) : (
                    filteredLists.map((list) => {
                      const isSelected = selectedList?.id === list.id;
                      const pathInfo = [list.space?.name, list.folder?.name]
                        .filter(Boolean)
                        .join(" / ");

                      return (
                        <button
                          key={list.id}
                          type="button"
                          onClick={() => {
                            setSelectedListId(list.id);
                            setIsListPickerOpen(false);
                            toast.info(`Destination: ${list.name}`, { duration: 1500 });
                          }}
                          className={`flex items-center justify-between gap-1.5 rounded px-2 py-1 text-left text-[11px] transition-colors cursor-pointer ${
                            isSelected
                              ? "bg-primary text-primary-foreground font-medium"
                              : "hover:bg-secondary text-foreground"
                          }`}
                        >
                          <div className="flex flex-col min-w-0 flex-1">
                            <span className="truncate">{list.name}</span>
                            {pathInfo && (
                              <span
                                className={`text-[9px] truncate ${
                                  isSelected
                                    ? "text-primary-foreground/80"
                                    : "text-muted-foreground"
                                }`}
                              >
                                {pathInfo}
                              </span>
                            )}
                          </div>
                          {isSelected && <Check className="h-3 w-3 shrink-0" />}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Priority Toggle / Selector */}
          <div className="relative shrink-0" ref={priorityPickerRef}>
            <button
              type="button"
              onClick={() => {
                setIsPriorityPickerOpen(!isPriorityPickerOpen);
                setIsListPickerOpen(false);
              }}
              className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              title="Set task priority"
            >
              <Flag className={`h-3 w-3 ${currentPriorityObj?.color || "text-muted-foreground"}`} />
              <span className="font-medium">{currentPriorityObj?.label || "Normal"}</span>
              <ChevronDown className="h-2.5 w-2.5 opacity-60" />
            </button>

            {/* Priority Picker Dropdown */}
            {isPriorityPickerOpen && (
              <div className="absolute top-full right-0 mt-1 w-28 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-lg z-50 animate-in fade-in zoom-in-95 duration-100 flex flex-col gap-0.5">
                {PRIORITY_OPTIONS.map((opt) => (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => {
                      setSelectedPriority(opt.value);
                      setIsPriorityPickerOpen(false);
                    }}
                    className={`flex items-center gap-1.5 rounded px-2 py-1 text-left text-[10.5px] transition-colors cursor-pointer ${
                      selectedPriority === opt.value
                        ? "bg-secondary font-semibold text-foreground"
                        : "hover:bg-secondary/60 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Flag className={`h-2.5 w-2.5 ${opt.color}`} />
                    <span>{opt.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
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
          <div className="flex flex-col items-center justify-center py-8 px-4 text-center text-xs text-muted-foreground">
            {taskInput.trim() ? (
              <>
                <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-secondary/80 text-muted-foreground">
                  <Search className="h-4 w-4" />
                </div>
                <p className="font-semibold text-foreground">No tasks matching "{taskInput}"</p>
                <p className="mt-1 text-[11px] text-muted-foreground/80 max-w-[240px]">
                  Press{" "}
                  <kbd className="rounded border border-border bg-secondary px-1 py-0.5 text-[10px] font-mono">
                    ↵ Enter
                  </kbd>{" "}
                  to create it in{" "}
                  <span className="font-medium text-foreground">
                    {selectedList?.name || "ClickUp"}
                  </span>
                </p>
                <button
                  type="button"
                  onClick={handleCreateTask}
                  disabled={isCreatingTask}
                  className="mt-3 flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-semibold text-background hover:bg-foreground/90 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isCreatingTask ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <>
                      <Plus className="h-3 w-3" />
                      <span>Create "{taskInput}"</span>
                    </>
                  )}
                </button>
              </>
            ) : (
              <>
                <Clock className="mb-2 h-5 w-5 opacity-40 text-muted-foreground" />
                <p className="font-semibold text-foreground">No tasks found</p>
                {!token ? (
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
              </>
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
