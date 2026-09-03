import { create } from "zustand";
import { persist } from "zustand/middleware";
import { ClickUpClient, ClickUpTask, ClickUpUser } from "../lib/clickup";
import { notify, setTrayTitle, clearTrayTitle } from "../lib/native";

export interface ActiveTimer {
  taskId: string;
  taskName: string;
  startTime: number;
  isRunning: boolean;
}

interface AppState {
  // Auth & Workspace
  token: string | null;
  user: ClickUpUser | null;
  teamId: string | null;
  teamName: string | null;

  // Timer
  activeTimer: ActiveTimer | null;
  elapsedSeconds: number;
  todayLoggedSeconds: number;
  dailyGoalHours: number;

  // Pomodoro & Notifications
  isPomodoroActive: boolean;
  pomodoroSecondsRemaining: number;
  pomodoroDurationMinutes: number;
  notificationsEnabled: boolean;

  // Window & UX
  isPinned: boolean;
  activeTab: "active" | "due" | "all";

  // Tasks
  tasks: ClickUpTask[];
  isLoadingTasks: boolean;

  // Actions
  setToken: (token: string | null) => void;
  setUser: (user: ClickUpUser | null) => void;
  setTeam: (id: string, name: string) => void;
  setIsPinned: (pinned: boolean) => void;
  setActiveTab: (tab: "active" | "due" | "all") => void;
  setNotificationsEnabled: (enabled: boolean) => void;

  // Timer Actions
  startTimer: (taskId: string, taskName: string) => Promise<void>;
  pauseTimer: () => Promise<void>;
  resumeTimer: () => void;
  stopTimer: () => Promise<void>;
  tick: () => void;

  // Task Actions
  fetchTasks: () => Promise<void>;
  updateTaskStatus: (taskId: string, status: string) => Promise<void>;
  quickAddTask: (name: string) => Promise<void>;

  // Pomodoro Actions
  togglePomodoro: () => void;
}

const INITIAL_DEMO_TASKS: ClickUpTask[] = [
  {
    id: "demo-1",
    name: "Design menubar popup control panel",
    status: { status: "in progress", color: "#4B90FF", type: "custom", orderindex: 1 },
    priority: { priority: "high", color: "#f59e0b" },
    list: { id: "list-1", name: "Sprint Backlog" },
  },
  {
    id: "demo-2",
    name: "Connect ClickUp OAuth 2.0 endpoint",
    status: { status: "to do", color: "#d1d5db", type: "open", orderindex: 0 },
    priority: { priority: "urgent", color: "#ef4444" },
    list: { id: "list-1", name: "Sprint Backlog" },
  },
  {
    id: "demo-3",
    name: "Set up Pomodoro & native break notifications",
    status: { status: "to do", color: "#d1d5db", type: "open", orderindex: 0 },
    priority: { priority: "normal", color: "#10b981" },
    list: { id: "list-2", name: "Enhancements" },
  },
];

function formatTime(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      teamId: null,
      teamName: null,

      activeTimer: null,
      elapsedSeconds: 0,
      todayLoggedSeconds: 3600 * 2.5, // sample 2h 30m logged
      dailyGoalHours: 8,

      isPomodoroActive: false,
      pomodoroSecondsRemaining: 25 * 60,
      pomodoroDurationMinutes: 25,
      notificationsEnabled: true,

      isPinned: false,
      activeTab: "active",

      tasks: INITIAL_DEMO_TASKS,
      isLoadingTasks: false,

      setToken: (token) => set({ token }),
      setUser: (user) => set({ user }),
      setTeam: (id, name) => set({ teamId: id, teamName: name }),
      setIsPinned: (isPinned) => set({ isPinned }),
      setActiveTab: (activeTab) => set({ activeTab }),
      setNotificationsEnabled: (notificationsEnabled) => set({ notificationsEnabled }),

      startTimer: async (taskId, taskName) => {
        const { token, teamId, activeTimer, todayLoggedSeconds, elapsedSeconds } = get();

        // If another timer was running, add its elapsed time to today's log
        let updatedToday = todayLoggedSeconds;
        if (activeTimer && activeTimer.isRunning) {
          updatedToday += elapsedSeconds;
        }

        const newTimer: ActiveTimer = {
          taskId,
          taskName,
          startTime: Date.now(),
          isRunning: true,
        };

        set({
          activeTimer: newTimer,
          elapsedSeconds: 0,
          todayLoggedSeconds: updatedToday,
        });

        const formatted = "▶ 00:00";
        setTrayTitle(formatted);

        // Sync with ClickUp if authenticated
        if (token && teamId) {
          try {
            const client = new ClickUpClient(token);
            await client.startTimeEntry(teamId, taskId);
          } catch (err) {
            console.warn("ClickUp API sync error:", err);
          }
        }
      },

      pauseTimer: async () => {
        const { activeTimer } = get();
        if (!activeTimer) return;

        set({
          activeTimer: { ...activeTimer, isRunning: false },
        });
        setTrayTitle("⏸ Paused");
      },

      resumeTimer: () => {
        const { activeTimer } = get();
        if (!activeTimer) return;

        set({
          activeTimer: { ...activeTimer, isRunning: true },
        });
      },

      stopTimer: async () => {
        const { token, teamId, activeTimer, elapsedSeconds, todayLoggedSeconds } = get();
        if (!activeTimer) return;

        set({
          todayLoggedSeconds: todayLoggedSeconds + elapsedSeconds,
          activeTimer: null,
          elapsedSeconds: 0,
        });

        clearTrayTitle();

        // Sync stop with ClickUp if authenticated
        if (token && teamId) {
          try {
            const client = new ClickUpClient(token);
            await client.stopTimeEntry(teamId);
          } catch (err) {
            console.warn("ClickUp API sync error:", err);
          }
        }
      },

      tick: () => {
        const {
          activeTimer,
          elapsedSeconds,
          isPomodoroActive,
          pomodoroSecondsRemaining,
          notificationsEnabled,
        } = get();

        // Handle Active Timer
        if (activeTimer && activeTimer.isRunning) {
          const nextElapsed = elapsedSeconds + 1;
          set({ elapsedSeconds: nextElapsed });

          // Update menu bar title every few seconds or every second
          const timeStr = formatTime(nextElapsed);
          setTrayTitle(`▶ ${timeStr}`);

          // Long session reminder at 2 hours
          if (nextElapsed === 7200 && notificationsEnabled) {
            notify("Take a Break", "You've been tracking continuously for 2 hours.");
          }
        }

        // Handle Pomodoro countdown
        if (isPomodoroActive && pomodoroSecondsRemaining > 0) {
          const nextPomo = pomodoroSecondsRemaining - 1;
          set({ pomodoroSecondsRemaining: nextPomo });

          if (nextPomo === 0) {
            set({ isPomodoroActive: false });
            if (notificationsEnabled) {
              notify("Pomodoro Complete!", "Great focus session. Time for a 5-minute break.");
            }
          }
        }
      },

      fetchTasks: async () => {
        const { token, teamId, user } = get();
        if (!token || !teamId) return;

        set({ isLoadingTasks: true });
        try {
          const client = new ClickUpClient(token);
          const tasks = await client.getTasks(teamId, user?.id);
          set({ tasks, isLoadingTasks: false });
        } catch (err) {
          console.error("Failed to fetch tasks:", err);
          set({ isLoadingTasks: false });
        }
      },

      updateTaskStatus: async (taskId, newStatus) => {
        const { token, tasks } = get();

        // Optimistic update
        const updated = tasks.map((t) =>
          t.id === taskId ? { ...t, status: { ...t.status, status: newStatus } } : t,
        );
        set({ tasks: updated });

        if (token) {
          try {
            const client = new ClickUpClient(token);
            await client.updateTaskStatus(taskId, newStatus);
          } catch (err) {
            console.error("Failed to update status on ClickUp:", err);
          }
        }
      },

      quickAddTask: async (name) => {
        const { tasks } = get();
        const newTask: ClickUpTask = {
          id: `task-${Date.now()}`,
          name,
          status: { status: "to do", color: "#9ca3af", type: "open", orderindex: 0 },
          priority: { priority: "normal", color: "#10b981" },
          list: { id: "quick", name: "Quick Tasks" },
        };
        set({ tasks: [newTask, ...tasks] });
      },

      togglePomodoro: () => {
        const { isPomodoroActive, pomodoroDurationMinutes } = get();
        if (isPomodoroActive) {
          set({ isPomodoroActive: false, pomodoroSecondsRemaining: pomodoroDurationMinutes * 60 });
        } else {
          set({ isPomodoroActive: true, pomodoroSecondsRemaining: pomodoroDurationMinutes * 60 });
        }
      },
    }),
    {
      name: "clickup-lite-storage",
      partialize: (state) => ({
        token: state.token,
        user: state.user,
        teamId: state.teamId,
        teamName: state.teamName,
        dailyGoalHours: state.dailyGoalHours,
        isPinned: state.isPinned,
        notificationsEnabled: state.notificationsEnabled,
      }),
    },
  ),
);
