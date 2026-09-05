import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  Play,
  Pause,
  Plus,
  Check,
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
} from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { ClickUpTask } from "../lib/clickup";
import { openExternalUrl, isMacOS } from "../lib/native";
import { ConfirmCompleteModal } from "./ConfirmCompleteModal";
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

function openTaskInClickUp(taskId: string) {
  openExternalUrl(`https://app.clickup.com/t/${taskId}`);
  toast.success("Opening in ClickUp...", { duration: 1500 });
}

interface TaskRowProps {
  task: ClickUpTask;
  isCurrent: boolean;
  isTimerRunning: boolean;
  onToggleTimer: (task: ClickUpTask) => void;
  onToggleComplete: (task: ClickUpTask) => void;
  /** Drop the row's own border/rounding: it sits inside a group card that owns them. */
  flat?: boolean;
  /** Only present to give its subtasks a home; it did not match the filter itself. */
  isContext?: boolean;
  subtaskSummary?: { done: number; total: number } | null;
  isCollapsed?: boolean;
  onToggleCollapse?: (taskId: string) => void;
}

const TaskRow = React.memo(function TaskRow({
  task,
  isCurrent,
  isTimerRunning,
  onToggleTimer,
  onToggleComplete,
  flat = false,
  isContext = false,
  subtaskSummary = null,
  isCollapsed = false,
  onToggleCollapse,
}: TaskRowProps) {
  const statusName = task.status?.status?.toLowerCase() || "to do";
  const isCompleted =
    statusName.includes("complete") || statusName.includes("closed") || statusName.includes("done");
  const priorityKey = task.priority?.priority?.toLowerCase();
  const priorityInfo = priorityKey ? PRIORITY_CONFIG[priorityKey] : null;
  const dueInfo = formatDueDate(task.due_date);

  const handleOpenClickUp = (e: React.MouseEvent) => {
    e.stopPropagation();
    openTaskInClickUp(task.id);
  };

  return (
    <div
      className={`group relative flex items-center justify-between gap-2 px-2.5 py-2 text-xs transition-all cursor-default select-none min-h-[42px] ${
        flat ? "" : "rounded-md border"
      } ${
        isCurrent
          ? isTimerRunning
            ? `bg-emerald-500/10 ${flat ? "" : "border-emerald-500/50 shadow-xs"}`
            : `bg-amber-500/10 ${flat ? "" : "border-amber-500/50 shadow-xs"}`
          : `hover:bg-secondary/30 ${flat ? "" : "border-border/70 bg-card hover:border-border"}`
      } ${isContext ? "opacity-70" : ""}`}
      title={isContext ? "Parent task — shown for context" : undefined}
    >
      {/* Left: ClickUp Circle Checkbox (1-click completion) */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleComplete(task);
        }}
        className={`group/cb flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-all cursor-pointer ${
          isCompleted
            ? "bg-emerald-500 text-white shadow-xs hover:bg-emerald-600"
            : "border-2 border-border/80 hover:border-emerald-500 hover:bg-emerald-500/10"
        }`}
        style={
          !isCompleted && task.status?.color ? { borderColor: `${task.status.color}99` } : undefined
        }
        title={
          isCompleted ? "Mark as incomplete" : `Mark complete (${task.status?.status || "To Do"})`
        }
      >
        <Check
          className={`h-3 w-3 stroke-[3] transition-all ${
            isCompleted ? "opacity-100" : "text-emerald-500 opacity-0 group-hover/cb:opacity-100"
          }`}
        />
      </button>

      {/* Middle: Title & Subtle Metadata Strip */}
      <div className="flex flex-1 min-w-0 flex-col gap-0.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className={`truncate text-xs transition-all ${
              isCompleted
                ? "line-through text-muted-foreground/60"
                : isCurrent
                  ? "text-foreground font-semibold"
                  : "text-foreground font-medium"
            }`}
            title={task.name}
          >
            {task.name}
          </span>
        </div>

        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground flex-wrap">
          {task.list?.name && (
            <span className="flex items-center gap-0.5 truncate max-w-[110px] font-medium text-muted-foreground/80">
              <Folder className="h-2.5 w-2.5 shrink-0 opacity-70" />
              <span className="truncate">{task.list.name}</span>
            </span>
          )}

          {priorityInfo && (
            <span
              className={`flex items-center gap-0.5 rounded-xs border px-1 py-0.2 text-[9px] uppercase tracking-wide font-medium ${priorityInfo.class}`}
            >
              <Flag className="h-2 w-2 shrink-0" />
              <span>{priorityInfo.label}</span>
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

          {/* Custom status badge if not generic To Do / Complete */}
          {task.status?.status &&
            !isCompleted &&
            !["to do", "todo", "open"].includes(statusName) && (
              <span
                className="flex items-center gap-1 rounded-xs border border-border/60 bg-secondary/40 px-1 py-0.2 text-[9px] font-medium text-muted-foreground capitalize truncate max-w-[80px]"
                title={`Status: ${task.status.status}`}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full shrink-0"
                  style={task.status.color ? { backgroundColor: task.status.color } : undefined}
                />
                <span className="truncate">{task.status.status}</span>
              </span>
            )}
        </div>
      </div>

      {/* Right: Subtask Toggle, Hover Actions & Dedicated Timer Button */}
      <div className="flex items-center gap-1 shrink-0">
        {/* Subtask count pill */}
        {subtaskSummary && onToggleCollapse && (
          <button
            type="button"
            onClick={() => onToggleCollapse(task.id)}
            className={`flex h-5 items-center gap-0.5 rounded-md border pl-1 pr-1.5 text-[10px] font-semibold transition-colors cursor-pointer ${
              subtaskSummary.done === subtaskSummary.total
                ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-400"
                : "border-border/70 bg-secondary/60 text-muted-foreground hover:text-foreground"
            }`}
            title={`${isCollapsed ? "Show" : "Hide"} ${subtaskSummary.total} subtasks`}
          >
            <ChevronDown
              className={`h-3 w-3 transition-transform ${isCollapsed ? "-rotate-90" : ""}`}
            />
            <span className="tabular-nums">
              {subtaskSummary.done}/{subtaskSummary.total}
            </span>
          </button>
        )}

        {/* Open in ClickUp link (hover revealed) */}
        <button
          type="button"
          onClick={handleOpenClickUp}
          className="opacity-0 group-hover:opacity-100 flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground transition-all cursor-pointer"
          title="Open in ClickUp Web"
        >
          <ExternalLink className="h-3 w-3" />
        </button>

        {/* Dedicated Timer Button */}
        <button
          type="button"
          onClick={() => onToggleTimer(task)}
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-all cursor-pointer ${
            isTimerRunning
              ? "bg-emerald-500 text-white shadow-[0_0_8px_rgba(16,185,129,0.5)] hover:bg-emerald-600"
              : isCurrent
                ? "bg-amber-500 text-white hover:bg-amber-600"
                : "bg-secondary/80 text-muted-foreground hover:bg-foreground hover:text-background"
          }`}
          title={isTimerRunning ? "Pause time tracking" : "Start time tracking on this task"}
        >
          {isTimerRunning ? (
            <Pause className="h-3 w-3 fill-current" />
          ) : (
            <Play className="h-3 w-3 fill-current ml-0.5" />
          )}
        </button>
      </div>
    </div>
  );
});

interface SubtaskRowProps {
  task: ClickUpTask;
  depth: number;
  isCurrent: boolean;
  isTimerRunning: boolean;
  isContext: boolean;
  onToggleTimer: (task: ClickUpTask) => void;
  onToggleComplete: (task: ClickUpTask) => void;
}

/** Subtasks: indented tree lines with interactive completion & timer controls */
const SubtaskRow = React.memo(function SubtaskRow({
  task,
  depth,
  isCurrent,
  isTimerRunning,
  isContext,
  onToggleTimer,
  onToggleComplete,
}: SubtaskRowProps) {
  const statusName = task.status?.status?.toLowerCase() || "to do";
  const isCompleted =
    statusName.includes("complete") || statusName.includes("closed") || statusName.includes("done");
  const dueInfo = formatDueDate(task.due_date);

  return (
    <div
      className={`group/sub flex h-6.5 items-center gap-1.5 rounded pr-1 text-[11px] transition-colors ${
        isCurrent
          ? isTimerRunning
            ? "bg-emerald-500/15"
            : "bg-amber-500/15"
          : "hover:bg-secondary/70"
      } ${isContext ? "opacity-60" : ""}`}
      style={{ paddingLeft: 4 + depth * 12 }}
      title={task.name}
    >
      {/* Subtask Checkbox */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleComplete(task);
        }}
        className={`group/scb flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full transition-all cursor-pointer ${
          isCompleted
            ? "bg-emerald-500 text-white"
            : "border border-border/80 hover:border-emerald-500"
        }`}
        title={isCompleted ? "Mark incomplete" : "Mark complete"}
      >
        <Check
          className={`h-2.5 w-2.5 stroke-[3] ${
            isCompleted ? "opacity-100" : "text-emerald-500 opacity-0 group-hover/scb:opacity-100"
          }`}
        />
      </button>

      <span
        className={`flex-1 truncate ${
          isCompleted
            ? "line-through text-muted-foreground/50"
            : isCurrent
              ? "text-foreground font-semibold"
              : "text-foreground/90"
        }`}
      >
        {task.name}
      </span>

      {dueInfo && (dueInfo.isOverdue || dueInfo.isToday) && (
        <span
          className={`shrink-0 text-[9px] font-semibold ${
            dueInfo.isOverdue ? "text-rose-400" : "text-amber-400"
          }`}
        >
          {dueInfo.text}
        </span>
      )}

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          openTaskInClickUp(task.id);
        }}
        className="opacity-0 group-hover/sub:opacity-100 flex h-4 w-4 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground transition-all cursor-pointer"
        title="Open in ClickUp Web"
      >
        <ExternalLink className="h-2.5 w-2.5" />
      </button>

      {/* Subtask Timer Button */}
      <button
        type="button"
        onClick={() => onToggleTimer(task)}
        className={`flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded transition-colors cursor-pointer ${
          isTimerRunning
            ? "bg-emerald-500 text-white"
            : isCurrent
              ? "bg-amber-500 text-white"
              : "text-muted-foreground/60 hover:bg-foreground hover:text-background"
        }`}
        title={isTimerRunning ? "Pause timer" : "Start timer on this subtask"}
      >
        {isTimerRunning ? (
          <Pause className="h-2.5 w-2.5 fill-current" />
        ) : (
          <Play className="h-2.5 w-2.5 fill-current ml-px" />
        )}
      </button>
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
  const updateTaskStatus = useAppStore((s) => s.updateTaskStatus);
  const taskCreationEnabled = useAppStore((s) => s.taskCreationEnabled);
  const subtasksByParent = useAppStore((s) => s.subtasksByParent);
  const confirmTaskCompletion = useAppStore((s) => s.confirmTaskCompletion);
  const setConfirmTaskCompletion = useAppStore((s) => s.setConfirmTaskCompletion);

  const [taskPendingCompletion, setTaskPendingCompletion] = useState<ClickUpTask | null>(null);

  // Search & Quick Add states (now decoupled!)
  const [searchQuery, setSearchQuery] = useState("");
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [newTaskName, setNewTaskName] = useState("");
  const [selectedPriority, setSelectedPriority] = useState<number | undefined>(undefined);
  const [isListPickerOpen, setIsListPickerOpen] = useState(false);
  const [isPriorityPickerOpen, setIsPriorityPickerOpen] = useState(false);
  const [listSearchQuery, setListSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"default" | "priority" | "due">("default");
  const [collapsedTaskIds, setCollapsedTaskIds] = useState<Set<string>>(new Set());

  const searchInputRef = useRef<HTMLInputElement>(null);
  const quickAddInputRef = useRef<HTMLInputElement>(null);
  const listPickerRef = useRef<HTMLDivElement>(null);
  const priorityPickerRef = useRef<HTMLDivElement>(null);

  // Auto-fetch lists if connected and none stored
  useEffect(() => {
    if (token && availableLists.length === 0) {
      fetchLists();
    }
  }, [token, availableLists.length, fetchLists]);

  // Keyboard shortcuts: Cmd+F focuses search, Cmd+N opens quick-add, Esc clears/closes
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const isCmdOrCtrl = e.metaKey || e.ctrlKey;
      if (isCmdOrCtrl && e.key.toLowerCase() === "f") {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      } else if (isCmdOrCtrl && e.key.toLowerCase() === "n" && taskCreationEnabled) {
        e.preventDefault();
        setIsQuickAddOpen((prev) => {
          const next = !prev;
          if (next) {
            setTimeout(() => quickAddInputRef.current?.focus(), 50);
          }
          return next;
        });
      } else if (e.key === "Escape") {
        if (taskPendingCompletion) {
          setTaskPendingCompletion(null);
        } else if (isQuickAddOpen) {
          setIsQuickAddOpen(false);
        } else if (searchQuery) {
          setSearchQuery("");
        }
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [taskCreationEnabled, isQuickAddOpen, searchQuery]);

  // Focus quick add input when drawer opens
  useEffect(() => {
    if (isQuickAddOpen) {
      setTimeout(() => quickAddInputRef.current?.focus(), 50);
    }
  }, [isQuickAddOpen]);

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

  const handleCreateTask = async (nameOverride?: string) => {
    const title = (nameOverride || newTaskName).trim();
    if (!title || isCreatingTask || !taskCreationEnabled) return;

    try {
      const created = await createTask({
        name: title,
        listId: selectedList?.id,
        priority: selectedPriority,
      });
      setNewTaskName("");
      setIsQuickAddOpen(false);
      const destName = created.list?.name || selectedList?.name || "ClickUp";
      toast.success(`Task created in ${destName}!`, { duration: 2500 });
    } catch (err) {
      console.error("Task creation failed:", err);
      toast.error(err instanceof Error ? err.message : "Failed to create task", {
        duration: 3500,
      });
    }
  };

  const handleQuickAddKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setIsQuickAddOpen(false);
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      await handleCreateTask();
    }
  };

  const executeComplete = useCallback(
    async (task: ClickUpTask) => {
      const prevStatus = task.status?.status || "to do";
      await updateTaskStatus(task.id, "complete");

      toast.success(`Completed "${task.name}"`, {
        duration: 3500,
        action: {
          label: "Undo",
          onClick: () => {
            updateTaskStatus(task.id, prevStatus);
            toast.info(`Restored "${task.name}"`);
          },
        },
      });
    },
    [updateTaskStatus],
  );

  const handleToggleComplete = useCallback(
    async (task: ClickUpTask) => {
      const statusName = task.status?.status?.toLowerCase() || "to do";
      const isCompleted =
        statusName.includes("complete") ||
        statusName.includes("closed") ||
        statusName.includes("done");

      if (isCompleted) {
        await updateTaskStatus(task.id, "to do");
        toast.info(`Reopened "${task.name}"`);
        return;
      }

      if (confirmTaskCompletion) {
        setTaskPendingCompletion(task);
      } else {
        await executeComplete(task);
      }
    },
    [confirmTaskCompletion, executeComplete, updateTaskStatus],
  );

  const handleConfirmComplete = useCallback(
    (dontAskAgain: boolean) => {
      if (!taskPendingCompletion) return;
      if (dontAskAgain) {
        setConfirmTaskCompletion(false);
        toast.info("Task confirmation disabled (can re-enable in Settings)", { duration: 2500 });
      }
      const task = taskPendingCompletion;
      setTaskPendingCompletion(null);
      executeComplete(task);
    },
    [taskPendingCompletion, setConfirmTaskCompletion, executeComplete],
  );

  const handleCancelComplete = useCallback(() => {
    setTaskPendingCompletion(null);
  }, []);

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

  const passesTabFilter = useCallback(
    (t: ClickUpTask) => {
      const status = t.status?.status?.toLowerCase() || "";
      if (activeTab === "active") {
        return !status.includes("complete") && !status.includes("closed");
      }
      if (activeTab === "due") {
        return Boolean(t.due_date);
      }
      return true;
    },
    [activeTab],
  );

  const matchesQuery = useCallback(
    (t: ClickUpTask) => {
      const q = searchQuery.trim().toLowerCase();
      if (!q) return true;
      return (
        t.name.toLowerCase().includes(q) ||
        (t.list?.name?.toLowerCase().includes(q) ?? false) ||
        (t.priority?.priority?.toLowerCase().includes(q) ?? false) ||
        (t.status?.status?.toLowerCase().includes(q) ?? false)
      );
    },
    [searchQuery],
  );

  // Filtered tasks based on active tab & search query
  const filteredTasks = useMemo(
    () => tasks.filter((t) => passesTabFilter(t) && matchesQuery(t)),
    [tasks, passesTabFilter, matchesQuery],
  );

  // Group tasks with their subtasks
  const taskGroups = useMemo(() => {
    const byId = new Map<string, ClickUpTask>();
    const originalIndex = new Map<string, number>();
    tasks.forEach((t, i) => {
      byId.set(t.id, t);
      originalIndex.set(t.id, i);
    });
    for (const children of Object.values(subtasksByParent)) {
      for (const child of children) {
        if (!byId.has(child.id)) byId.set(child.id, child);
      }
    }

    const matchedIds = new Set(filteredTasks.map((t) => t.id));

    const parentOf = (task: ClickUpTask): ClickUpTask | undefined => {
      if (!task.parent) return undefined;
      const parent = byId.get(task.parent);
      return parent && parent.id !== task.id ? parent : undefined;
    };

    const childIndex = new Map<string, ClickUpTask[]>();
    const addChild = (parentId: string, child: ClickUpTask) => {
      const siblings = childIndex.get(parentId);
      if (siblings) {
        if (!siblings.some((s) => s.id === child.id)) siblings.push(child);
      } else {
        childIndex.set(parentId, [child]);
      }
    };
    for (const task of byId.values()) {
      const parent = parentOf(task);
      if (parent) addChild(parent.id, task);
    }
    for (const [parentId, children] of Object.entries(subtasksByParent)) {
      if (!byId.has(parentId)) continue;
      for (const child of children) {
        if (child.id !== parentId) addChild(parentId, byId.get(child.id) || child);
      }
    }

    const compare = (a: ClickUpTask, b: ClickUpTask) => {
      if (sortBy === "priority") {
        const pA = PRIORITY_ORDER[a.priority?.priority?.toLowerCase() || ""] || 99;
        const pB = PRIORITY_ORDER[b.priority?.priority?.toLowerCase() || ""] || 99;
        if (pA !== pB) return pA - pB;
      } else if (sortBy === "due") {
        const dA = a.due_date ? Number(a.due_date) : Infinity;
        const dB = b.due_date ? Number(b.due_date) : Infinity;
        if (dA !== dB) return dA - dB;
      }
      return (originalIndex.get(a.id) ?? Infinity) - (originalIndex.get(b.id) ?? Infinity);
    };

    const roots: ClickUpTask[] = [];
    const seenRoots = new Set<string>();
    for (const task of filteredTasks) {
      let root = task;
      const guard = new Set([task.id]);
      let parent = parentOf(root);
      while (parent && !guard.has(parent.id)) {
        guard.add(parent.id);
        root = parent;
        parent = parentOf(root);
      }
      if (!seenRoots.has(root.id)) {
        seenRoots.add(root.id);
        roots.push(root);
      }
    }
    roots.sort(compare);

    return roots.map((root) => {
      const descendants: { task: ClickUpTask; depth: number }[] = [];
      let total = 0;
      let done = 0;
      const walk = (parent: ClickUpTask, depth: number) => {
        const children = [...(childIndex.get(parent.id) || [])].sort(compare);
        for (const child of children) {
          total += 1;
          const status = child.status?.status?.toLowerCase() || "";
          if (status.includes("complete") || status.includes("closed") || status.includes("done"))
            done += 1;
          if (matchedIds.has(child.id) || passesTabFilter(child)) {
            descendants.push({ task: child, depth });
          }
          walk(child, depth + 1);
        }
      };
      walk(root, 0);

      return {
        root,
        rootIsContext: !matchedIds.has(root.id),
        descendants,
        summary: total > 0 ? { done, total } : null,
        matchedIds,
      };
    });
  }, [tasks, subtasksByParent, filteredTasks, sortBy, passesTabFilter]);

  const toggleCollapsed = useCallback((taskId: string) => {
    setCollapsedTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }, []);

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

  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);

  const updateScrollEdges = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollUp(el.scrollTop > 1);
    setCanScrollDown(el.scrollTop + el.clientHeight < el.scrollHeight - 1);
  }, []);

  useEffect(() => {
    updateScrollEdges();
  }, [updateScrollEdges, taskGroups, collapsedTaskIds, isLoadingTasks]);

  const currentPriorityObj = PRIORITY_OPTIONS.find((p) => p.value === selectedPriority);

  return (
    <div className="flex flex-col gap-1.5 flex-1 min-h-0 overflow-hidden">
      {/* 1. Header Toolbar: Tabs + Sort + Quick Add */}
      <div className="flex items-center justify-between gap-1.5 shrink-0">
        {/* Segmented Filter Pills */}
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

        {/* Right Actions: Sort & + Quick Add */}
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

          {taskCreationEnabled && (
            <button
              type="button"
              onClick={() => setIsQuickAddOpen((prev) => !prev)}
              className={`flex h-6 items-center gap-1 rounded-md px-2 text-[11px] font-semibold transition-all cursor-pointer border ${
                isQuickAddOpen
                  ? "border-primary bg-primary text-primary-foreground shadow-xs"
                  : "border-primary/40 bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground"
              }`}
              title={`Quick Add Task (${isMacOS() ? "⌘" : "Ctrl"}+N)`}
            >
              <Plus className="h-3 w-3 stroke-[2.5]" />
              <span>Task</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. Slim Search Bar with Current Selected List indicator for Create */}
      <div className="flex items-center gap-1.5 shrink-0">
        <div className="relative flex flex-1 items-center min-w-0">
          <Search className="absolute left-2.5 h-3 w-3 text-muted-foreground/70 pointer-events-none" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && searchQuery.trim() && taskCreationEnabled) {
                if (filteredTasks.length === 0 || e.metaKey || e.ctrlKey) {
                  e.preventDefault();
                  handleCreateTask(searchQuery);
                }
              }
            }}
            placeholder={
              searchQuery && filteredTasks.length === 0
                ? `Press ↵ to create in ${selectedList?.name || "List"}...`
                : `Search or create... (${isMacOS() ? "⌘F" : "Ctrl+F"})`
            }
            className="h-6.5 w-full rounded-md border border-border/70 bg-secondary/30 pl-7 pr-7 text-[11px] text-foreground placeholder:text-muted-foreground/60 focus:border-foreground focus:bg-background focus:outline-none transition-all"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                searchInputRef.current?.focus();
              }}
              className="absolute right-1.5 flex h-4 w-4 items-center justify-center rounded text-muted-foreground hover:text-foreground cursor-pointer"
              title="Clear search (Esc)"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* Current Selected List Badge & Switcher for Create */}
        <div className="relative shrink-0" ref={listPickerRef}>
          <button
            type="button"
            onClick={() => {
              setIsListPickerOpen(!isListPickerOpen);
              setIsPriorityPickerOpen(false);
              if (!isListPickerOpen && availableLists.length === 0 && token) {
                fetchLists();
              }
            }}
            className={`flex h-6.5 items-center gap-1 rounded-md border px-2 text-[10.5px] transition-all cursor-pointer max-w-[125px] ${
              isListPickerOpen
                ? "border-foreground bg-secondary text-foreground font-semibold shadow-xs"
                : "border-border/70 bg-secondary/40 text-muted-foreground hover:border-border hover:bg-secondary/70 hover:text-foreground"
            }`}
            title={`Creating tasks in: ${selectedList?.name || "Select list"}
Click to switch list`}
          >
            <Folder className="h-2.5 w-2.5 shrink-0 text-amber-500/90" />
            <span className="truncate font-medium">{selectedList?.name || "Select list"}</span>
            <ChevronDown className="h-2 w-2 opacity-60 shrink-0" />
          </button>

          {isListPickerOpen && (
            <div className="absolute right-0 top-full mt-1 w-64 max-h-56 overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-lg z-50 animate-in fade-in zoom-in-95 duration-100 flex flex-col">
              <div className="flex items-center justify-between border-b border-border/60 px-2 py-1 mb-1 shrink-0">
                <span className="font-semibold text-[10px] text-muted-foreground uppercase tracking-wider">
                  Create in List
                </span>
                <div className="flex items-center gap-1.5">
                  {token && (
                    <button
                      type="button"
                      onClick={() => fetchLists()}
                      disabled={isLoadingLists}
                      className="flex items-center gap-1 text-[9px] text-muted-foreground hover:text-foreground cursor-pointer disabled:opacity-50"
                      title="Refresh lists from ClickUp"
                    >
                      <RefreshCw
                        className={`h-2.5 w-2.5 ${isLoadingLists ? "animate-spin" : ""}`}
                      />
                      <span>Sync</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setIsListPickerOpen(false)}
                    className="text-muted-foreground hover:text-foreground text-[10px] cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {availableLists.length > 4 && (
                <div className="px-1 pb-1 shrink-0">
                  <input
                    type="text"
                    value={listSearchQuery}
                    onChange={(e) => setListSearchQuery(e.target.value)}
                    placeholder="Filter lists..."
                    className="h-5.5 w-full rounded border border-border bg-background px-1.5 text-[10px] focus:outline-none"
                    autoFocus
                  />
                </div>
              )}

              <div className="overflow-y-auto max-h-40 flex flex-col gap-0.5">
                {filteredLists.map((list) => {
                  const isSelected = selectedList?.id === list.id;
                  return (
                    <button
                      key={list.id}
                      type="button"
                      onClick={() => {
                        setSelectedListId(list.id);
                        setIsListPickerOpen(false);
                        setListSearchQuery("");
                      }}
                      className={`flex items-center justify-between gap-1.5 rounded px-2 py-1.5 text-left text-[11px] transition-colors cursor-pointer ${
                        isSelected
                          ? "bg-primary text-primary-foreground font-semibold"
                          : "hover:bg-secondary/70 text-foreground"
                      }`}
                    >
                      <div className="flex flex-col min-w-0">
                        <span className="truncate font-medium">{list.name}</span>
                        <span
                          className={`text-[9px] truncate ${
                            isSelected ? "text-primary-foreground/80" : "text-muted-foreground"
                          }`}
                        >
                          {list.space?.name}
                          {list.folder ? ` / ${list.folder.name}` : ""}
                        </span>
                      </div>
                      {isSelected && <Check className="h-3 w-3 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Quick create prompt when searching and results are present */}
      {searchQuery.trim() && taskCreationEnabled && filteredTasks.length > 0 && (
        <button
          type="button"
          onClick={() => handleCreateTask(searchQuery)}
          disabled={isCreatingTask}
          className="flex items-center justify-between rounded-md border border-dashed border-border/80 bg-secondary/30 px-2.5 py-1 text-[11px] text-muted-foreground hover:bg-secondary/70 hover:text-foreground hover:border-border transition-all cursor-pointer shrink-0"
        >
          <span className="flex items-center gap-1.5 truncate">
            <Plus className="h-3 w-3 text-primary shrink-0" />
            <span className="truncate">Create &ldquo;{searchQuery}&rdquo;</span>
          </span>
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground/80 shrink-0">
            <span>in {selectedList?.name || "List"}</span>
            <kbd className="rounded border border-border/70 bg-background/60 px-1 py-0.2 text-[9px] font-mono">
              {isMacOS() ? "⌘↵" : "Ctrl+↵"}
            </kbd>
          </span>
        </button>
      )}

      {/* 3. Expandable Quick Add Panel (Only visible when active, saves ~50px when closed) */}
      {isQuickAddOpen && (
        <div className="flex flex-col gap-2 rounded-lg border border-primary/40 bg-card p-2.5 shadow-md animate-in fade-in slide-in-from-top-2 duration-150 shrink-0">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-foreground flex items-center gap-1.5">
              <Plus className="h-3 w-3 text-primary" />
              New ClickUp Task
            </span>
            <button
              type="button"
              onClick={() => setIsQuickAddOpen(false)}
              className="text-muted-foreground hover:text-foreground text-xs cursor-pointer p-0.5 rounded"
            >
              <X className="h-3 w-3" />
            </button>
          </div>

          <input
            ref={quickAddInputRef}
            type="text"
            value={newTaskName}
            onChange={(e) => setNewTaskName(e.target.value)}
            onKeyDown={handleQuickAddKeyDown}
            disabled={isCreatingTask}
            placeholder="Task title (press ↵ to create)..."
            className="h-7 w-full rounded-md border border-border/80 bg-background px-2 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-foreground focus:outline-none transition-all disabled:opacity-60"
          />

          <div className="flex items-center justify-between gap-1.5 pt-0.5">
            <div className="flex items-center gap-1.5 min-w-0">
              {/* Destination List Indicator in drawer */}
              <button
                type="button"
                onClick={() => {
                  setIsListPickerOpen((prev) => !prev);
                  setIsPriorityPickerOpen(false);
                }}
                className="flex h-6 items-center gap-1 rounded border border-border/80 bg-secondary/40 px-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer max-w-[130px]"
                title="Click to switch destination list"
              >
                <Folder className="h-2.5 w-2.5 shrink-0 text-amber-500/80" />
                <span className="truncate font-medium">{selectedList?.name || "Select list"}</span>
                <ChevronDown className="h-2 w-2 opacity-60 shrink-0" />
              </button>

              {/* Priority Picker Dropdown */}
              <div className="relative" ref={priorityPickerRef}>
                <button
                  type="button"
                  onClick={() => {
                    setIsPriorityPickerOpen(!isPriorityPickerOpen);
                    setIsListPickerOpen(false);
                  }}
                  className="flex h-6 items-center gap-1 rounded border border-border/80 bg-secondary/40 px-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  title="Task priority"
                >
                  <Flag
                    className={`h-2.5 w-2.5 ${currentPriorityObj?.color || "text-muted-foreground"}`}
                  />
                  <span className="font-medium">{currentPriorityObj?.label || "Normal"}</span>
                  <ChevronDown className="h-2 w-2 opacity-60 shrink-0" />
                </button>

                {isPriorityPickerOpen && (
                  <div className="absolute top-full left-0 mt-1 w-28 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-lg z-50 animate-in fade-in zoom-in-95 duration-100 flex flex-col gap-0.5">
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

            {/* Create Action Button */}
            <button
              type="button"
              onClick={() => handleCreateTask()}
              disabled={!newTaskName.trim() || isCreatingTask}
              className="flex h-6 items-center gap-1 rounded bg-foreground px-2.5 text-[10.5px] font-semibold text-background hover:bg-foreground/90 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-xs"
            >
              {isCreatingTask ? (
                <Loader2 className="h-2.5 w-2.5 animate-spin" />
              ) : (
                <>
                  <span>Create</span>
                  <CornerDownLeft className="h-2.5 w-2.5 opacity-60" />
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* 4. Task Rows List */}
      <div className="relative flex flex-1 min-h-0 flex-col">
        <div
          ref={scrollRef}
          onScroll={updateScrollEdges}
          className="flex flex-col gap-1.5 flex-1 min-h-0 overflow-y-auto overscroll-contain pr-0.5 snap-y snap-proximity"
        >
          {isLoadingTasks && tasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center text-xs text-muted-foreground">
              <Loader2 className="mb-2 h-4 w-4 animate-spin text-foreground" />
              <p>Syncing tasks from ClickUp...</p>
            </div>
          ) : filteredTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 px-4 text-center text-xs text-muted-foreground">
              {searchQuery.trim() ? (
                <>
                  <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-secondary/80 text-muted-foreground">
                    <Search className="h-4 w-4" />
                  </div>
                  <p className="font-semibold text-foreground">
                    No tasks matching &ldquo;{searchQuery}&rdquo;
                  </p>
                  {taskCreationEnabled && (
                    <button
                      type="button"
                      onClick={() => handleCreateTask(searchQuery)}
                      disabled={isCreatingTask}
                      className="mt-3 flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-semibold text-background hover:bg-foreground/90 transition-all cursor-pointer disabled:opacity-50 shadow-xs"
                    >
                      {isCreatingTask ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <>
                          <Plus className="h-3 w-3" />
                          <span>
                            Create in <strong>{selectedList?.name || "ClickUp"}</strong>
                          </span>
                          <kbd className="ml-0.5 rounded border border-background/20 bg-background/20 px-1 py-0.2 text-[9px] font-mono opacity-80">
                            ↵
                          </kbd>
                        </>
                      )}
                    </button>
                  )}
                </>
              ) : (
                <>
                  <Clock className="mb-2 h-5 w-5 opacity-40 text-muted-foreground" />
                  <p className="font-semibold text-foreground">No tasks found</p>
                  {!token ? (
                    <p className="mt-1 text-[11px] text-muted-foreground/80 max-w-[240px]">
                      Connect your ClickUp account in Settings or add a local task.
                    </p>
                  ) : tasks.length > 0 && activeTab === "active" ? (
                    <p className="mt-1 text-[11px] text-muted-foreground/80">
                      You&apos;re all caught up! No active tasks pending.
                    </p>
                  ) : (
                    <p className="mt-1 text-[11px] text-muted-foreground/80">
                      No tasks assigned to your user in this view.
                    </p>
                  )}
                </>
              )}
            </div>
          ) : (
            taskGroups.map((group) => {
              const isCollapsed = collapsedTaskIds.has(group.root.id);
              const hasSubtasks = group.descendants.length > 0;
              const rootIsCurrent = activeTaskId === group.root.id;
              const rootIsRunning = rootIsCurrent && isTimerRunning;

              const rootRow = (
                <TaskRow
                  task={group.root}
                  isCurrent={rootIsCurrent}
                  isTimerRunning={rootIsRunning}
                  onToggleTimer={handleToggleTimer}
                  onToggleComplete={handleToggleComplete}
                  flat={hasSubtasks}
                  isContext={group.rootIsContext}
                  subtaskSummary={group.summary}
                  isCollapsed={isCollapsed}
                  onToggleCollapse={toggleCollapsed}
                />
              );

              if (!hasSubtasks) {
                return (
                  <div key={group.root.id} className="snap-start scroll-mt-1">
                    {rootRow}
                  </div>
                );
              }

              // Parent + subtasks group card
              return (
                <div
                  key={group.root.id}
                  className={`snap-start scroll-mt-1 overflow-hidden rounded-md border bg-card transition-all ${
                    rootIsCurrent
                      ? rootIsRunning
                        ? "border-emerald-500/50 shadow-xs"
                        : "border-amber-500/50 shadow-xs"
                      : "border-border/70 hover:border-border"
                  }`}
                >
                  {rootRow}
                  {!isCollapsed && (
                    <div className="border-t border-border/60 bg-secondary/20 py-1 pr-1 pl-2.5">
                      <div className="flex flex-col gap-0.5 border-l border-border/60 pl-1.5">
                        {group.descendants.map(({ task, depth }) => (
                          <SubtaskRow
                            key={task.id}
                            task={task}
                            depth={depth}
                            isCurrent={activeTaskId === task.id}
                            isTimerRunning={activeTaskId === task.id && isTimerRunning}
                            isContext={!group.matchedIds.has(task.id)}
                            onToggleTimer={handleToggleTimer}
                            onToggleComplete={handleToggleComplete}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Edge scroll cues */}
        {canScrollUp && (
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-border/80" />
        )}
        {canScrollDown && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-border/80" />
        )}
      </div>

      {/* 5. Complete Confirmation Modal */}
      <ConfirmCompleteModal
        isOpen={Boolean(taskPendingCompletion)}
        task={taskPendingCompletion}
        onClose={handleCancelComplete}
        onConfirm={handleConfirmComplete}
      />
    </div>
  );
}
