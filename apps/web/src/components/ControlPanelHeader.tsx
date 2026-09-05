import { useTheme } from "./theme-provider";
import { useAppStore } from "../store/useAppStore";
import { Moon, Pin, RefreshCw, Settings, Sun, X } from "lucide-react";
import { toast } from "sonner";

interface ControlPanelHeaderProps {
  onOpenSettings: () => void;
  onClose?: () => void;
  onSync?: () => void;
  isSyncing?: boolean;
}

export function ControlPanelHeader({
  onOpenSettings,
  onClose,
  onSync,
  isSyncing,
}: ControlPanelHeaderProps) {
  const user = useAppStore((s) => s.user);
  const teamName = useAppStore((s) => s.teamName);
  const token = useAppStore((s) => s.token);
  const isPinned = useAppStore((s) => s.isPinned);
  const setIsPinned = useAppStore((s) => s.setIsPinned);
  const storeSyncAll = useAppStore((s) => s.syncAll);
  const isLoadingTasks = useAppStore((s) => s.isLoadingTasks);
  const storeIsSyncing = useAppStore((s) => s.isSyncing);
  const { theme, setTheme } = useTheme();

  const handleSync =
    onSync ||
    (async () => {
      const result = await storeSyncAll();
      if (result.ok) {
        toast.success("Synced with ClickUp", { duration: 1500 });
      } else {
        toast.error(result.error || "Sync failed", { duration: 3500 });
      }
    });
  const syncing = isSyncing !== undefined ? isSyncing : storeIsSyncing || isLoadingTasks;

  const handleClose = () => {
    if (onClose) {
      onClose();
    } else {
      import("@tauri-apps/api/webviewWindow")
        .then(({ getCurrentWebviewWindow }) => {
          getCurrentWebviewWindow().hide();
        })
        .catch(() => {});
    }
  };

  return (
    <div
      data-tauri-drag-region
      className="flex h-9 shrink-0 items-center justify-between border-b border-border/80 px-2.5 select-none bg-background/90 backdrop-blur-md"
    >
      {/* Left: App Logo & Workspace Tag */}
      <div className="flex items-center gap-2 min-w-0" data-tauri-drag-region>
        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-zinc-900 border border-zinc-700/60 shadow-xs">
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
            <defs>
              <linearGradient id="headerCuChevron" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#FF007F" />
                <stop offset="100%" stopColor="#7B68EE" />
              </linearGradient>
            </defs>
            <path
              d="M4.5 11L12 4.5L19.5 11"
              stroke="url(#headerCuChevron)"
              strokeWidth="3.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M6 16C8 18.5 16 18.5 18 16"
              stroke="#00D2FF"
              strokeWidth="3.2"
              strokeLinecap="round"
            />
          </svg>
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
            onClick={handleSync}
            disabled={syncing}
            title="Sync Tasks"
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin text-primary" : ""}`} />
          </button>
        )}

        <button
          type="button"
          onClick={() => setIsPinned(!isPinned)}
          title={isPinned ? "Unpin Window (Auto-hide on blur)" : "Pin Window (Keep open on blur)"}
          className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors ${
            isPinned
              ? "bg-primary/15 text-primary hover:bg-primary/25 font-semibold"
              : "text-muted-foreground hover:bg-accent hover:text-foreground"
          }`}
        >
          <Pin className={`h-3.5 w-3.5 ${isPinned ? "fill-current -rotate-45" : ""}`} />
        </button>

        <button
          type="button"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
        </button>

        <button
          type="button"
          onClick={onOpenSettings}
          title="Settings"
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          <Settings className="h-3.5 w-3.5" />
        </button>

        <div className="h-3 w-px bg-border/60 mx-0.5" />

        <button
          type="button"
          onClick={handleClose}
          title="Hide Window"
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
