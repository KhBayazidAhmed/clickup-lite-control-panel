import { Pin, Settings, X, Moon, Sun } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { hideWindow } from "../lib/native";
import { useTheme } from "next-themes";

interface HeaderProps {
  onOpenSettings: () => void;
}

export function ControlPanelHeader({ onOpenSettings }: HeaderProps) {
  const { isPinned, setIsPinned, user, teamName } = useAppStore();
  const { theme, setTheme } = useTheme();

  return (
    <div
      data-tauri-drag-region
      className="flex h-10 items-center justify-between border-b border-border/80 px-3 select-none bg-background/80 backdrop-blur-md"
    >
      {/* Left: App Logo & Workspace Tag */}
      <div className="flex items-center gap-2">
        <div className="flex h-5 w-5 items-center justify-center rounded-md bg-gradient-to-tr from-purple-600 to-indigo-500 text-white font-bold text-[10px]">
          CU
        </div>
        <div className="flex flex-col">
          <span className="text-xs font-semibold text-foreground leading-none">ClickUp Lite</span>
          <span className="text-[9px] text-muted-foreground leading-tight">
            {teamName ? `${teamName}` : user ? user.username : "Control Panel"}
          </span>
        </div>
      </div>

      {/* Right: Actions (Theme, Pin, Settings, Close) */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
          title="Toggle Theme"
        >
          {theme === "dark" ? <Sun className="h-3 w-3" /> : <Moon className="h-3 w-3" />}
        </button>

        <button
          type="button"
          onClick={() => setIsPinned(!isPinned)}
          className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors cursor-pointer ${
            isPinned
              ? "bg-primary/15 text-primary"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
          title={isPinned ? "Pinned (Stays open)" : "Unpinned (Auto-hides on blur)"}
        >
          <Pin className={`h-3 w-3 ${isPinned ? "fill-current" : ""}`} />
        </button>

        <button
          type="button"
          onClick={onOpenSettings}
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
          title="Settings & ClickUp Auth"
        >
          <Settings className="h-3 w-3" />
        </button>

        <button
          type="button"
          onClick={hideWindow}
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors cursor-pointer"
          title="Close to Tray"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
