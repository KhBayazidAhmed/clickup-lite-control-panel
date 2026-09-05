import React, { useState, useEffect, useRef } from "react";
import { Check, CheckCircle2, AlertTriangle, Timer, Folder, X } from "lucide-react";
import { Button } from "@clickup-lite-control-panel/ui/components/button";
import { useAppStore } from "../store/useAppStore";
import { ClickUpTask } from "../lib/clickup";

export interface ConfirmCompleteModalProps {
  task: ClickUpTask | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (dontAskAgain: boolean) => void;
}

export const ConfirmCompleteModal = React.memo(function ConfirmCompleteModal({
  task,
  isOpen,
  onClose,
  onConfirm,
}: ConfirmCompleteModalProps) {
  const [dontAskAgain, setDontAskAgain] = useState(false);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  const activeTimer = useAppStore((s) => s.activeTimer);
  const subtasksByParent = useAppStore((s) => s.subtasksByParent);

  // Reset checkbox & auto-focus confirm button on open
  useEffect(() => {
    if (!isOpen) return;
    setDontAskAgain(false);

    const timer = setTimeout(() => {
      confirmButtonRef.current?.focus();
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      } else if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        onConfirm(dontAskAgain);
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [isOpen, onClose, onConfirm, dontAskAgain]);

  if (!isOpen || !task) return null;

  const isTimerActive = activeTimer !== null && activeTimer.taskId === task.id;
  const subtasks = subtasksByParent[task.id] || [];
  const openSubtasks = subtasks.filter((st) => {
    const s = st.status?.status?.toLowerCase() || "";
    return !s.includes("complete") && !s.includes("closed") && !s.includes("done");
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3.5 select-none"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-[340px] flex-col gap-3 rounded-xl border border-border bg-card p-3.5 shadow-2xl text-card-foreground animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-500 border border-emerald-500/30">
              <CheckCircle2 className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-xs font-bold text-foreground leading-tight truncate">
                Complete Task?
              </h3>
              <p className="text-[10.5px] text-muted-foreground leading-tight mt-0.5">
                Confirm marking this task as complete
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors cursor-pointer shrink-0"
            title="Cancel"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Task Details Card */}
        <div className="rounded-lg border border-border/80 bg-secondary/40 p-2.5 flex flex-col gap-1">
          <span className="text-xs font-semibold text-foreground break-words line-clamp-2 leading-snug">
            {task.name}
          </span>
          {task.list?.name && (
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground truncate">
              <Folder className="h-2.5 w-2.5 shrink-0 opacity-70" />
              <span className="truncate">{task.list.name}</span>
            </span>
          )}
        </div>

        {/* Notice Banners */}
        {isTimerActive && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-[11px] text-amber-500 dark:text-amber-400">
            <Timer className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span className="leading-tight">
              An active timer is currently tracking this task. Completing it will stop and log the
              timer.
            </span>
          </div>
        )}

        {openSubtasks.length > 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-[11px] text-amber-500 dark:text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span className="leading-tight">
              This task has {openSubtasks.length} unresolved subtask
              {openSubtasks.length > 1 ? "s" : ""}.
            </span>
          </div>
        )}

        {/* Don't ask again toggle */}
        <label className="flex items-center gap-2 pt-0.5 text-[10.5px] text-muted-foreground hover:text-foreground cursor-pointer select-none">
          <input
            type="checkbox"
            checked={dontAskAgain}
            onChange={(e) => setDontAskAgain(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-border accent-primary cursor-pointer"
          />
          <span>Don&apos;t ask again (can re-enable in Settings)</span>
        </label>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2 pt-1 border-t border-border/50">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onClose}
            className="h-7 px-2.5 text-[11px] cursor-pointer"
          >
            Cancel
          </Button>
          <Button
            ref={confirmButtonRef}
            type="button"
            size="sm"
            onClick={() => onConfirm(dontAskAgain)}
            className="h-7 px-3 text-[11px] bg-emerald-600 hover:bg-emerald-700 text-white font-semibold cursor-pointer shadow-xs gap-1.5"
          >
            <Check className="h-3 w-3 stroke-[2.5]" />
            <span>Mark Complete</span>
          </Button>
        </div>
      </div>
    </div>
  );
});
