import { useState } from "react";
import { Play, Pause, Plus, CheckCircle2, Circle, Clock } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { ClickUpTask } from "../lib/clickup";

const PRIORITY_COLORS: Record<string, { label: string; class: string }> = {
  urgent: { label: "Urgent", class: "bg-red-500/10 text-red-500 border-red-500/20" },
  high: { label: "High", class: "bg-amber-500/10 text-amber-500 border-amber-500/20" },
  normal: { label: "Normal", class: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" },
  low: { label: "Low", class: "bg-gray-500/10 text-gray-400 border-gray-500/20" },
};

export function TaskList() {
  const {
    tasks,
    activeTimer,
    activeTab,
    setActiveTab,
    startTimer,
    pauseTimer,
    resumeTimer,
    updateTaskStatus,
    quickAddTask,
  } = useAppStore();

  const [newTaskTitle, setNewTaskTitle] = useState("");

  const handleKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && newTaskTitle.trim()) {
      await quickAddTask(newTaskTitle.trim());
      setNewTaskTitle("");
    }
  };

  const handleToggleTimer = (task: ClickUpTask) => {
    if (activeTimer?.taskId === task.id) {
      if (activeTimer.isRunning) {
        pauseTimer();
      } else {
        resumeTimer();
      }
    } else {
      startTimer(task.id, task.name);
    }
  };

  const handleCycleStatus = (task: ClickUpTask) => {
    const current = task.status.status.toLowerCase();
    let nextStatus = "in progress";
    if (current.includes("in progress")) {
      nextStatus = "complete";
    } else if (current.includes("complete") || current.includes("closed")) {
      nextStatus = "to do";
    } else {
      nextStatus = "in progress";
    }
    updateTaskStatus(task.id, nextStatus);
  };

  const filteredTasks = tasks.filter((t) => {
    const status = t.status.status.toLowerCase();
    if (activeTab === "active") {
      return !status.includes("complete") && !status.includes("closed");
    }
    if (activeTab === "due") {
      return Boolean(t.due_date);
    }
    return true;
  });

  return (
    <div className="flex flex-col gap-2.5 flex-1 min-h-0">
      {/* Tabs & Quick Add Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 rounded-lg bg-muted/60 p-0.5 text-xs font-medium">
          <button
            type="button"
            onClick={() => setActiveTab("active")}
            className={`rounded-md px-2.5 py-1 transition-all ${
              activeTab === "active"
                ? "bg-background text-foreground shadow-xs font-semibold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Active (
            {tasks.filter((t) => !t.status.status.toLowerCase().includes("complete")).length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("all")}
            className={`rounded-md px-2.5 py-1 transition-all ${
              activeTab === "all"
                ? "bg-background text-foreground shadow-xs font-semibold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            All ({tasks.length})
          </button>
        </div>
      </div>

      {/* Inline Quick Add Input */}
      <div className="relative flex items-center">
        <Plus className="absolute left-2.5 h-3.5 w-3.5 text-muted-foreground" />
        <input
          type="text"
          value={newTaskTitle}
          onChange={(e) => setNewTaskTitle(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Quick add task... [Enter]"
          className="h-8 w-full rounded-lg border border-border/80 bg-background/50 pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40 transition-all"
        />
      </div>

      {/* Task Rows List */}
      <div className="flex flex-col gap-1.5 overflow-y-auto pr-0.5 max-h-[260px] scrollbar-thin">
        {filteredTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center text-xs text-muted-foreground">
            <Clock className="mb-1.5 h-5 w-5 opacity-40" />
            <p>No tasks found</p>
          </div>
        ) : (
          filteredTasks.map((task) => {
            const isCurrent = activeTimer?.taskId === task.id;
            const isTimerRunning = isCurrent && activeTimer?.isRunning;
            const statusName = task.status.status.toLowerCase();
            const isCompleted = statusName.includes("complete") || statusName.includes("closed");
            const priorityInfo = task.priority?.priority
              ? PRIORITY_COLORS[task.priority.priority]
              : null;

            return (
              <div
                key={task.id}
                className={`group flex items-center justify-between gap-2 rounded-lg border p-2 text-xs transition-all ${
                  isCurrent
                    ? "border-primary/50 bg-primary/5 shadow-xs"
                    : "border-border/60 bg-card/40 hover:border-border hover:bg-card/90"
                }`}
              >
                {/* Left: Play / Pause Quick Action */}
                <button
                  type="button"
                  onClick={() => handleToggleTimer(task)}
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-all cursor-pointer ${
                    isTimerRunning
                      ? "bg-emerald-500 text-white shadow-xs"
                      : isCurrent
                        ? "bg-amber-500 text-white"
                        : "bg-muted text-muted-foreground hover:bg-primary hover:text-primary-foreground"
                  }`}
                  title={isTimerRunning ? "Pause timer" : "Track time on this task"}
                >
                  {isTimerRunning ? (
                    <Pause className="h-3 w-3 fill-current" />
                  ) : (
                    <Play className="h-3 w-3 fill-current ml-0.5" />
                  )}
                </button>

                {/* Middle: Title & Meta */}
                <div className="flex flex-col flex-1 min-w-0 pr-1">
                  <span
                    className={`truncate font-medium ${
                      isCompleted ? "line-through text-muted-foreground" : "text-foreground"
                    }`}
                  >
                    {task.name}
                  </span>
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <span>{task.list?.name || "General"}</span>
                    {priorityInfo && (
                      <span
                        className={`rounded-sm border px-1 py-0.2 text-[9px] font-semibold ${priorityInfo.class}`}
                      >
                        {priorityInfo.label}
                      </span>
                    )}
                  </div>
                </div>

                {/* Right: 1-Click Status Badge */}
                <button
                  type="button"
                  onClick={() => handleCycleStatus(task)}
                  className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium border transition-colors cursor-pointer ${
                    isCompleted
                      ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                      : statusName.includes("in progress")
                        ? "bg-blue-500/10 text-blue-500 border-blue-500/20"
                        : "bg-muted text-muted-foreground border-transparent hover:bg-muted/80"
                  }`}
                  title="Click to advance status"
                >
                  {isCompleted ? (
                    <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                  ) : (
                    <Circle className="h-3 w-3 opacity-60" />
                  )}
                  <span className="capitalize">{task.status.status}</span>
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
