import { create } from "zustand";
import { persist } from "zustand/middleware";
import { ClickUpClient, ClickUpTask, ClickUpUser } from "../lib/clickup";
import { notify, setTrayTitle, clearTrayTitle, setNativePinned } from "../lib/native";

export interface ActiveTimer {
  entryId?: string;
  taskId: string;
  taskName: string;
  startTime: number;
  accumulatedSeconds?: number;
  isRunning: boolean;
}

export interface PendingTimeEntry {
  id: string;
  taskId: string;
  taskName: string;
  start: number;
  durationMs: number;
  createdAt: number;
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
  isSyncing: boolean;

  // Offline Sync Queue
  offlineTimeQueue: PendingTimeEntry[];
  flushOfflineQueue: () => Promise<void>;

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
  lastTaskPollTime: number | null;

  // Actions
  setToken: (token: string | null) => void;
  setUser: (user: ClickUpUser | null) => void;
  setTeam: (id: string, name: string) => void;
  setIsPinned: (pinned: boolean) => void;
  setActiveTab: (tab: "active" | "due" | "all") => void;
  setNotificationsEnabled: (enabled: boolean) => void;
  setDailyGoalHours: (hours: number) => void;
  setPomodoroDurationMinutes: (minutes: number) => void;

  // Timer Actions
  startTimer: (taskId: string, taskName: string) => Promise<void>;
  pauseTimer: () => Promise<void>;
  resumeTimer: () => Promise<void>;
  stopTimer: () => Promise<void>;
  tick: () => void;
  syncCurrentTimer: () => Promise<void>;
  syncTodayTime: () => Promise<void>;
  syncAll: () => Promise<void>;

  // Task Actions
  fetchTasks: () => Promise<void>;
  pollTaskUpdates: () => Promise<void>;
  updateTaskStatus: (taskId: string, status: string) => Promise<void>;
  quickAddTask: (name: string) => Promise<void>;

  // Pomodoro Actions
  togglePomodoro: () => void;
}

function formatTime(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

// In-flight request deduplication promises & polling state
let syncTimerPromise: Promise<void> | null = null;
let syncTodayPromise: Promise<void> | null = null;
let fetchTasksPromise: Promise<void> | null = null;
let pollTasksPromise: Promise<void> | null = null;
let flushOfflinePromise: Promise<void> | null = null;
let taskBaselineEstablished = false;
const notifiedDueMap = new Map<string, number>();

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      teamId: null,
      teamName: null,

      activeTimer: null,
      elapsedSeconds: 0,
      todayLoggedSeconds: 0,
      dailyGoalHours: 8,
      isSyncing: false,

      offlineTimeQueue: [],

      isPomodoroActive: false,
      pomodoroSecondsRemaining: 25 * 60,
      pomodoroDurationMinutes: 25,
      notificationsEnabled: true,

      isPinned: false,
      activeTab: "active",

      tasks: [],
      isLoadingTasks: false,
      lastTaskPollTime: null,

      setToken: (token) => {
        if (!token) {
          taskBaselineEstablished = false;
          notifiedDueMap.clear();
          set({ token: null, user: null, teamId: null, teamName: null, tasks: [] });
        } else {
          set({ token });
        }
      },
      setUser: (user) => set({ user }),
      setTeam: (id, name) => set({ teamId: id, teamName: name }),
      setIsPinned: (isPinned) => {
        set({ isPinned });
        setNativePinned(isPinned);
      },
      setActiveTab: (activeTab) => set({ activeTab }),
      setNotificationsEnabled: (notificationsEnabled) => set({ notificationsEnabled }),
      setDailyGoalHours: (dailyGoalHours) =>
        set({
          dailyGoalHours: Math.max(0.5, Math.min(24, Math.round(dailyGoalHours * 10) / 10)),
        }),
      setPomodoroDurationMinutes: (pomodoroDurationMinutes) => {
        const mins = Math.max(5, Math.min(120, Math.round(pomodoroDurationMinutes)));
        set((state) => ({
          pomodoroDurationMinutes: mins,
          pomodoroSecondsRemaining: state.isPomodoroActive
            ? state.pomodoroSecondsRemaining
            : mins * 60,
        }));
      },

      startTimer: async (taskId, taskName) => {
        const { token, teamId, activeTimer, todayLoggedSeconds, elapsedSeconds } = get();

        // If another timer was running, add its elapsed time to today's log
        let updatedToday = todayLoggedSeconds;
        if (activeTimer && activeTimer.isRunning) {
          updatedToday += elapsedSeconds;
        }

        const now = Date.now();
        set({
          activeTimer: {
            taskId,
            taskName,
            startTime: now,
            accumulatedSeconds: 0,
            isRunning: true,
          },
          elapsedSeconds: 0,
          todayLoggedSeconds: updatedToday,
        });

        setTrayTitle(`▶ 00:00`);

        if (token && teamId) {
          try {
            const client = new ClickUpClient(token);
            const entry = await client.startTimeEntry(teamId, taskId, taskName);
            if (entry) {
              set((state) => ({
                activeTimer: state.activeTimer ? { ...state.activeTimer, entryId: entry.id } : null,
              }));
            }
          } catch (err) {
            console.warn("ClickUp API sync error on startTimer (will track locally):", err);
          }
        }
      },

      pauseTimer: async () => {
        const { activeTimer, elapsedSeconds, token, teamId } = get();
        if (!activeTimer || !activeTimer.isRunning) return;

        set({
          activeTimer: {
            ...activeTimer,
            isRunning: false,
            accumulatedSeconds: elapsedSeconds,
          },
        });

        setTrayTitle("⏸ Paused");

        if (token && teamId) {
          try {
            const client = new ClickUpClient(token);
            await client.stopTimeEntry(teamId);
          } catch (err) {
            console.warn("ClickUp API sync error on pauseTimer:", err);
          }
        }
      },

      resumeTimer: async () => {
        const { activeTimer, token, teamId } = get();
        if (!activeTimer || activeTimer.isRunning) return;

        const now = Date.now();
        set({
          activeTimer: {
            ...activeTimer,
            startTime: now,
            isRunning: true,
          },
        });

        const timeStr = formatTime(activeTimer.accumulatedSeconds || 0);
        setTrayTitle(`▶ ${timeStr}`);

        if (token && teamId) {
          try {
            const client = new ClickUpClient(token);
            const entry = await client.startTimeEntry(
              teamId,
              activeTimer.taskId,
              activeTimer.taskName,
            );
            if (entry) {
              set((state) => ({
                activeTimer: state.activeTimer ? { ...state.activeTimer, entryId: entry.id } : null,
              }));
            }
          } catch (err) {
            console.warn("ClickUp API sync error on resumeTimer:", err);
          }
        }
      },

      stopTimer: async () => {
        const { activeTimer, elapsedSeconds, todayLoggedSeconds, token, teamId } = get();
        if (!activeTimer) return;

        const durationMs = elapsedSeconds * 1000;
        const startTime = activeTimer.startTime;
        const taskId = activeTimer.taskId;
        const taskName = activeTimer.taskName;
        const hadEntryId = Boolean(activeTimer.entryId);

        set({
          activeTimer: null,
          todayLoggedSeconds: todayLoggedSeconds + elapsedSeconds,
          elapsedSeconds: 0,
        });

        clearTrayTitle();

        if (token && teamId && durationMs >= 1000) {
          try {
            const client = new ClickUpClient(token);
            if (hadEntryId) {
              await client.stopTimeEntry(teamId);
            } else {
              await client.createTimeEntry(teamId, {
                start: startTime,
                duration: durationMs,
                description: taskName,
                taskId,
              });
            }
            await get().syncTodayTime();
          } catch (err) {
            console.warn("Failed to log timer online. Enqueuing for offline sync:", err);
            const pendingEntry: PendingTimeEntry = {
              id: `offline-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              taskId,
              taskName,
              start: startTime,
              durationMs,
              createdAt: Date.now(),
            };
            set((state) => ({
              offlineTimeQueue: [...state.offlineTimeQueue, pendingEntry],
            }));
            notify(
              "Saved Offline",
              `"${taskName}" (${formatTime(elapsedSeconds)}) will sync when connection returns.`,
            );
          }
        }
      },

      flushOfflineQueue: async () => {
        const { token, teamId, offlineTimeQueue } = get();
        if (!token || !teamId || offlineTimeQueue.length === 0) return;

        if (flushOfflinePromise) return flushOfflinePromise;

        flushOfflinePromise = (async () => {
          const client = new ClickUpClient(token);
          const remaining: PendingTimeEntry[] = [];
          let syncedCount = 0;

          for (const item of offlineTimeQueue) {
            try {
              await client.createTimeEntry(teamId, {
                start: item.start,
                duration: item.durationMs,
                description: item.taskName,
                taskId: item.taskId,
              });
              syncedCount++;
            } catch (err) {
              console.warn("Failed to flush offline entry, retaining in queue:", err);
              remaining.push(item);
            }
          }

          set({ offlineTimeQueue: remaining });

          if (syncedCount > 0) {
            notify(
              "Offline Time Synced",
              `Successfully uploaded ${syncedCount} offline session(s) to ClickUp.`,
            );
            get().syncTodayTime();
          }
        })().finally(() => {
          flushOfflinePromise = null;
        });

        return flushOfflinePromise;
      },

      tick: () => {
        const { activeTimer, isPomodoroActive, pomodoroSecondsRemaining, notificationsEnabled } =
          get();

        // Handle Active Timer with accurate real-time clock calculation
        if (activeTimer && activeTimer.isRunning) {
          const currentElapsed =
            (activeTimer.accumulatedSeconds || 0) +
            Math.max(0, Math.floor((Date.now() - activeTimer.startTime) / 1000));

          set({ elapsedSeconds: currentElapsed });

          // Update menu bar title
          const timeStr = formatTime(currentElapsed);
          setTrayTitle(`▶ ${timeStr}`);

          // Long session reminder at 2 hours
          if (currentElapsed === 7200 && notificationsEnabled) {
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

      syncCurrentTimer: async () => {
        const { token, teamId, user, tasks } = get();
        if (!token || !teamId) return;

        if (syncTimerPromise) {
          return syncTimerPromise;
        }

        syncTimerPromise = (async () => {
          try {
            const client = new ClickUpClient(token);
            const entry = await client.getCurrentTimeEntry(teamId, user?.id);

            if (entry && (!entry.stop || Number(entry.duration) < 0)) {
              const startTimestamp = Number(entry.start);
              const now = Date.now();
              const elapsed = Math.max(0, Math.floor((now - startTimestamp) / 1000));
              const taskId = entry.task?.id || "";
              const taskName =
                entry.task?.name ||
                tasks.find((t) => t.id === taskId)?.name ||
                entry.description ||
                "Active Task";

              set({
                activeTimer: {
                  entryId: entry.id,
                  taskId,
                  taskName,
                  startTime: startTimestamp,
                  accumulatedSeconds: 0,
                  isRunning: true,
                },
                elapsedSeconds: elapsed,
              });

              setTrayTitle(`▶ ${formatTime(elapsed)}`);
            } else {
              // No running timer returned from ClickUp
              const current = get().activeTimer;
              // If local state thought a ClickUp-linked timer was running, align with server
              if (current && (current.entryId || token)) {
                if (current.isRunning) {
                  set({
                    activeTimer: null,
                    elapsedSeconds: 0,
                  });
                  clearTrayTitle();
                  await get().syncTodayTime();
                }
              }
            }
          } catch (err) {
            console.warn("Failed to sync current timer from ClickUp:", err);
          } finally {
            syncTimerPromise = null;
          }
        })();

        return syncTimerPromise;
      },

      syncTodayTime: async () => {
        const { token, teamId, user } = get();
        if (!token || !teamId) return;

        if (syncTodayPromise) {
          return syncTodayPromise;
        }

        syncTodayPromise = (async () => {
          try {
            const client = new ClickUpClient(token);
            const startOfDay = new Date();
            startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date();
            endOfDay.setHours(23, 59, 59, 999);

            const entries = await client.getTimeEntries(
              teamId,
              startOfDay.getTime(),
              endOfDay.getTime(),
              user?.id,
            );

            if (Array.isArray(entries)) {
              let totalSeconds = 0;
              for (const entry of entries) {
                const dur = Number(entry.duration);
                // In ClickUp API, completed entries have positive duration in milliseconds
                if (dur > 0) {
                  totalSeconds += Math.floor(dur / 1000);
                }
              }
              set({ todayLoggedSeconds: totalSeconds });
            }
          } catch (err) {
            console.warn("Failed to sync today's time from ClickUp:", err);
          } finally {
            syncTodayPromise = null;
          }
        })();

        return syncTodayPromise;
      },

      syncAll: async () => {
        const { token, teamId } = get();
        if (!token || !teamId) return;

        set({ isSyncing: true });
        try {
          await Promise.allSettled([
            get().flushOfflineQueue(),
            get().fetchTasks(),
            get().syncCurrentTimer(),
            get().syncTodayTime(),
          ]);
        } finally {
          set({ isSyncing: false });
        }
      },

      fetchTasks: async () => {
        const { token, teamId, user } = get();
        if (!token || !teamId) return;

        if (fetchTasksPromise) {
          return fetchTasksPromise;
        }

        set({ isLoadingTasks: true });

        fetchTasksPromise = (async () => {
          try {
            const client = new ClickUpClient(token);
            const tasks = await client.getTasks(teamId, user?.id);
            taskBaselineEstablished = true;
            set({ tasks, isLoadingTasks: false, lastTaskPollTime: Date.now() });
          } catch (err) {
            console.error("Failed to fetch tasks:", err);
            set({ isLoadingTasks: false });
          } finally {
            fetchTasksPromise = null;
          }
        })();

        return fetchTasksPromise;
      },

      pollTaskUpdates: async () => {
        const { token, teamId, user, tasks: currentTasks, notificationsEnabled } = get();
        if (!token || !teamId) return;

        if (pollTasksPromise) {
          return pollTasksPromise;
        }

        pollTasksPromise = (async () => {
          try {
            const client = new ClickUpClient(token);
            const freshTasks = await client.getTasks(teamId, user?.id);
            const now = Date.now();

            // Establish baseline on first run without spamming alerts
            if (!taskBaselineEstablished) {
              taskBaselineEstablished = true;
              set({ tasks: freshTasks, lastTaskPollTime: now });
              return;
            }

            if (notificationsEnabled) {
              const currentTaskMap = new Map(currentTasks.map((t) => [t.id, t]));

              for (const fresh of freshTasks) {
                const existing = currentTaskMap.get(fresh.id);

                // 1. New task assigned to user
                if (!existing) {
                  const listInfo = fresh.list?.name ? ` in ${fresh.list.name}` : "";
                  notify("New Task Assigned", `"${fresh.name}"${listInfo}`);
                }
                // 2. Task status changed
                else if (
                  existing.status?.status?.toLowerCase() !== fresh.status?.status?.toLowerCase()
                ) {
                  notify(
                    "Task Status Updated",
                    `"${fresh.name}" is now ${(fresh.status?.status || "updated").toUpperCase()}`,
                  );
                }

                // 3. Due Soon Reminder (within next 30 minutes)
                if (fresh.due_date) {
                  const dueMs = Number(fresh.due_date);
                  const diffMinutes = Math.floor((dueMs - now) / 60000);
                  if (diffMinutes > 0 && diffMinutes <= 30) {
                    const lastNotifiedDue = notifiedDueMap.get(fresh.id);
                    if (lastNotifiedDue !== dueMs) {
                      notifiedDueMap.set(fresh.id, dueMs);
                      notify("Task Due Soon", `"${fresh.name}" is due in ${diffMinutes}m`);
                    }
                  }
                }
              }
            }

            set({ tasks: freshTasks, lastTaskPollTime: now });
          } catch (err) {
            console.warn("Failed to poll task updates from ClickUp:", err);
          } finally {
            pollTasksPromise = null;
          }
        })();

        return pollTasksPromise;
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
        pomodoroDurationMinutes: state.pomodoroDurationMinutes,
        isPinned: state.isPinned,
        notificationsEnabled: state.notificationsEnabled,
        activeTimer: state.activeTimer,
        todayLoggedSeconds: state.todayLoggedSeconds,
        offlineTimeQueue: state.offlineTimeQueue || [],
        tasks: (state.tasks || []).filter((t) => !t.id.startsWith("demo-")),
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Sync native pin state on rehydration
          if (typeof state.isPinned === "boolean") {
            setNativePinned(state.isPinned);
          }

          // Ensure offlineTimeQueue is initialized as array
          if (!Array.isArray(state.offlineTimeQueue)) {
            state.offlineTimeQueue = [];
          }

          // Clean up any legacy demo tasks
          if (Array.isArray(state.tasks)) {
            state.tasks = state.tasks.filter((t) => !t.id.startsWith("demo-"));
          } else {
            state.tasks = [];
          }

          if (state.activeTimer?.taskId?.startsWith("demo-")) {
            state.activeTimer = null;
            state.elapsedSeconds = 0;
            clearTrayTitle();
          } else if (state.activeTimer) {
            if (state.activeTimer.isRunning) {
              const elapsed =
                (state.activeTimer.accumulatedSeconds || 0) +
                Math.max(0, Math.floor((Date.now() - state.activeTimer.startTime) / 1000));
              state.elapsedSeconds = elapsed;
              setTrayTitle(`▶ ${formatTime(elapsed)}`);
            } else {
              state.elapsedSeconds = state.activeTimer.accumulatedSeconds || 0;
              setTrayTitle("⏸ Paused");
            }
          }
        }
      },
    },
  ),
);
