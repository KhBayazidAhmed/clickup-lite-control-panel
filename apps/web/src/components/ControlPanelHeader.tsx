import React from "react";
import { Pin, Settings, X, Moon, Sun, RefreshCw } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { hideWindow } from "../lib/native";
import { useTheme } from "next-themes";

interface HeaderProps {
  onOpenSettings: () => void;
}

export const ControlPanelHeader = React.memo(function ControlPanelHeader({
  onOpenSettings,
}: HeaderProps) {
  const isPinned = useAppStore((s) => s.isPinned);
  const setIsPinned = useAppStore((s) => s.setIsPinned);
  const user = useAppStore((s) => s.user);
  const teamName = useAppStore((s) => s.teamName);
  const syncAll = useAppStore((s) => s.syncAll);
  const isSyncing = useAppStore((s) => s.isSyncing);
  const token = useAppStore((s) => s.token);
  const { theme, setTheme } = useTheme();

  return (
    <div
      data-tauri-drag-region
      className="flex h-9 shrink-0 items-center justify-between border-b border-border/80 px-2.5 select-none bg-background/90 backdrop-blur-md"
    >
      {/* Left: App Logo & Workspace Tag */}
      <div className="flex items-center gap-2 min-w-0" data-tauri-drag-region>
        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-foreground text-background font-black text-[10px] tracking-tight shadow-xs">
          CU
        </div>
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-xs font-semibold text-foreground tracking-tight whitespace-nowrap">
            ClickUp
          </span>
          <span className="text-[10px] text-muted-foreground/60">•</span>
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground truncate font-medium">
            {token ? (
              <>
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
                <span className="truncate max-w-[110px]">
                  {teamName || user?.username || "Workspace"}
                </span>
              </>
            ) : (
              <>
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
                <span className="truncate">Offline</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-0.5">
        {token && (
          <button
            type="button"
            onClick={() => syncAll()}
            disabled={isSyncing}
            className={`flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors cursor-pointer ${
              isSyncing ? "text-foreground" : ""
            }`}
            title={isSyncing ? "Syncing with ClickUp..." : "Sync Now"}
          >
            <RefreshCw className={`h-3 w-3 ${isSyncing ? "animate-spin" : ""}`} />
          </button>
        )}

        <button
          type="button"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors cursor-pointer"
          title="Toggle Dark/Light Theme"
        >
          {theme === "dark" ? <Sun className="h-3 w-3" /> : <Moon className="h-3 w-3" />}
        </button>

        <button
          type="button"
          onClick={() => setIsPinned(!isPinned)}
          className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors cursor-pointer ${
            isPinned
              ? "bg-foreground text-background shadow-xs font-bold"
              : "text-muted-foreground hover:bg-secondary hover:text-foreground"
          }`}
          title={isPinned ? "Pinned (Always on top)" : "Pin Window"}
        >
          <Pin className={`h-3 w-3 ${isPinned ? "fill-current" : ""}`} />
        </button>

        <button
          type="button"
          onClick={onOpenSettings}
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors cursor-pointer"
          title="Settings"
        >
          <Settings className="h-3 w-3" />
        </button>

        <button
          type="button"
          onClick={hideWindow}
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/15 hover:text-destructive transition-colors cursor-pointer ml-0.5"
          title="Close to Tray"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
});
