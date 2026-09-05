import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  ClickUpClient,
  ClickUpList,
  ClickUpTask,
  ClickUpTimeEntry,
  ClickUpUser,
} from "../lib/clickup";
import { notify, setTrayTitle, setNativePinned } from "../lib/native";

export interface ActiveTimer {
  entryId?: string;
  taskId: string;
  taskName: string;
  startTime: number;
  accumulatedSeconds?: number;
  isRunning: boolean;
  /** Free-text note logged as the ClickUp time entry's description. */
  note?: string;
}

/** A timer that was still marked running when the app last stopped ticking.
 *  Held aside for the user to confirm instead of being counted or dropped. */
export interface RecoveredTimer {
  taskId: string;
  taskName: string;
  entryId?: string;
  startTime: number;
  /** Seconds actually tracked, i.e. up to the last heartbeat — never the gap. */
  trackedSeconds: number;
  /** Wall-clock seconds between the last heartbeat and this launch. */
  gapSeconds: number;
  note?: string;
}

export interface PendingTimeEntry {
  id: string;
  taskId: string;
  taskName: string;
  start: number;
  durationMs: number;
  createdAt: number;
  note?: string;
}

interface AppState {
  // Auth & Workspace
  token: string | null;
  user: ClickUpUser | null;
  teamId: string | null;
  teamName: string | null;
  customClientId: string;
  customClientSecret: string;
  setCustomOAuthCredentials: (clientId: string, clientSecret: string) => void;

  // Timer
  activeTimer: ActiveTimer | null;
  elapsedSeconds: number;
  todayLoggedSeconds: number;
  dailyGoalHours: number;
  isSyncing: boolean;
  lastSyncError: string | null;
  /** Written every tick so a relaunch can tell tracked time from downtime. */
  timerHeartbeat: number | null;
  recoveredTimer: RecoveredTimer | null;
  /** A ClickUp entry we failed to stop; retried on every sync so it can never
   *  keep running (and inflating) behind our back. */
  pendingStopEntryId: string | null;

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
  taskCreationEnabled: boolean;
  activeTab: "active" | "due" | "all";

  // Lists & Tasks
  availableLists: ClickUpList[];
  selectedListId: string | null;
  isLoadingLists: boolean;
  isCreatingTask: boolean;
  tasks: ClickUpTask[];
  /** Subtasks fetched per parent id. Kept apart from `tasks` so counts and
   *  filters keep reflecting what is actually assigned to the user. */
  subtasksByParent: Record<string, ClickUpTask[]>;
  isLoadingSubtasks: boolean;
  isLoadingTasks: boolean;
  lastTaskPollTime: number | null;

  // Actions
  setToken: (token: string | null) => void;
  setUser: (user: ClickUpUser | null) => void;
  setTeam: (id: string, name: string) => void;
  setIsPinned: (pinned: boolean) => void;
  setTaskCreationEnabled: (enabled: boolean) => void;
  setActiveTab: (tab: "active" | "due" | "all") => void;
  setSelectedListId: (listId: string | null) => void;
  setNotificationsEnabled: (enabled: boolean) => void;
  setDailyGoalHours: (hours: number) => void;
  setPomodoroDurationMinutes: (minutes: number) => void;

  // Timer Actions
  startTimer: (taskId: string, taskName: string) => Promise<void>;
  setTimerNote: (note: string) => Promise<void>;
  pauseTimer: () => Promise<void>;
  resumeTimer: () => Promise<void>;
  stopTimer: () => Promise<void>;
  tick: () => void;
  logRecoveredTimer: () => Promise<void>;
  discardRecoveredTimer: () => Promise<void>;
  syncCurrentTimer: () => Promise<void>;
  syncTodayTime: () => Promise<void>;
  syncAll: () => Promise<{ ok: boolean; error?: string }>;
  fetchSubtasks: () => Promise<void>;

  // List & Task Actions
  fetchLists: () => Promise<ClickUpList[]>;
  fetchTasks: () => Promise<void>;
  pollTaskUpdates: () => Promise<void>;
  createTask: (params: {
    name: string;
    listId?: string;
    priority?: number;
    dueDate?: number;
    description?: string;
  }) => Promise<ClickUpTask>;
  quickAddTask: (name: string, listId?: string, priority?: number) => Promise<ClickUpTask | void>;
  updateTaskStatus: (taskId: string, status: string) => Promise<void>;

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

/** What ClickUp stores as the entry's description: the user's note when there
 *  is one, otherwise the task name so an entry is never left unlabelled. */
function entryDescription(taskName: string, note?: string): string {
  const trimmed = (note || "").trim();
  return trimmed || taskName;
}

/** Shown in the menu bar whenever nothing is being tracked, so the slot always
 *  holds a clock rather than disappearing. */
const IDLE_TRAY_TITLE = "00:00";

/** A relaunch gap longer than this means the app was not ticking, so the wall
 *  clock since then is downtime rather than tracked work. */
const STALE_GAP_MS = 90_000;

// In-flight request deduplication promises & polling state
/** Bounds on the per-task subtask fan-out. */
const SUBTASK_FETCH_LIMIT = 40;
const SUBTASK_FETCH_CONCURRENCY = 5;

let syncTimerPromise: Promise<void> | null = null;
let syncTodayPromise: Promise<void> | null = null;
let fetchTasksPromise: Promise<void> | null = null;
let fetchSubtasksPromise: Promise<void> | null = null;
let fetchListsPromise: Promise<ClickUpList[]> | null = null;
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
      customClientId: "",
      customClientSecret: "",
      setCustomOAuthCredentials: (customClientId, customClientSecret) =>
        set({ customClientId, customClientSecret }),

      activeTimer: null,
      elapsedSeconds: 0,
      todayLoggedSeconds: 0,
      dailyGoalHours: 8,
      isSyncing: false,
      lastSyncError: null,
      timerHeartbeat: null,
      recoveredTimer: null,
      pendingStopEntryId: null,

      offlineTimeQueue: [],

      isPomodoroActive: false,
      pomodoroSecondsRemaining: 25 * 60,
      pomodoroDurationMinutes: 25,
      notificationsEnabled: true,

      isPinned: false,
      taskCreationEnabled: true,
      activeTab: "active",

      availableLists: [],
      selectedListId: null,
      isLoadingLists: false,
      isCreatingTask: false,
      tasks: [],
      subtasksByParent: {},
      isLoadingSubtasks: false,
      isLoadingTasks: false,
      lastTaskPollTime: null,

      setToken: (token) => {
        if (!token) {
          taskBaselineEstablished = false;
          notifiedDueMap.clear();
          set({
            token: null,
            user: null,
            teamId: null,
            teamName: null,
            tasks: [],
            availableLists: [],
            selectedListId: null,
          });
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
      setTaskCreationEnabled: (taskCreationEnabled) => set({ taskCreationEnabled }),
      setActiveTab: (activeTab) => set({ activeTab }),
      setSelectedListId: (selectedListId) => set({ selectedListId }),
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
          timerHeartbeat: now,
          recoveredTimer: null,
        });

        setTrayTitle(`00:00`);

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

      /** Attaches a note to the running session. Pushed to ClickUp right away
       *  when an entry already exists there, so the note survives a stop that
       *  happens elsewhere (or a crash) rather than only landing on stop. */
      setTimerNote: async (note) => {
        const { activeTimer, token, teamId } = get();
        if (!activeTimer) return;
        if ((activeTimer.note || "") === note) return;

        set({ activeTimer: { ...activeTimer, note } });

        const entryId = activeTimer.entryId;
        if (!entryId || !token || !teamId) return;

        try {
          const client = new ClickUpClient(token);
          await client.updateTimeEntry(teamId, entryId, {
            description: entryDescription(activeTimer.taskName, note),
          });
        } catch (err) {
          // The note is kept locally and re-sent when the timer is stopped.
          console.warn("ClickUp API sync error on setTimerNote:", err);
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
          timerHeartbeat: null,
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
          timerHeartbeat: now,
        });

        const timeStr = formatTime(activeTimer.accumulatedSeconds || 0);
        setTrayTitle(`${timeStr}`);

        if (token && teamId) {
          try {
            const client = new ClickUpClient(token);
            const entry = await client.startTimeEntry(
              teamId,
              activeTimer.taskId,
              entryDescription(activeTimer.taskName, activeTimer.note),
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
        const note = activeTimer.note;
        const entryId = activeTimer.entryId;
        const hadEntryId = Boolean(entryId);

        set({
          activeTimer: null,
          todayLoggedSeconds: todayLoggedSeconds + elapsedSeconds,
          elapsedSeconds: 0,
          timerHeartbeat: null,
        });

        setTrayTitle(IDLE_TRAY_TITLE);

        if (token && teamId && durationMs >= 1000) {
          try {
            const client = new ClickUpClient(token);
            if (hadEntryId) {
              await client.stopTimeEntry(teamId);
              // Re-send the note in case it was typed before the entry existed
              // or an earlier push failed.
              if ((note || "").trim() && entryId) {
                await client.updateTimeEntry(teamId, entryId, {
                  description: entryDescription(taskName, note),
                });
              }
            } else {
              await client.createTimeEntry(teamId, {
                start: startTime,
                duration: durationMs,
                description: entryDescription(taskName, note),
                taskId,
              });
            }
            await get().syncTodayTime();
          } catch (err) {
            // ClickUp already holds this entry and it is still running there.
            // Queueing a copy would double-log, so retry the stop instead.
            if (hadEntryId && entryId) {
              set({ pendingStopEntryId: entryId });
              console.warn("Failed to stop the ClickUp entry; will retry on next sync:", err);
              notify(
                "Couldn't Stop Timer",
                `"${taskName}" is still running in ClickUp. Retrying automatically.`,
              );
              return;
            }

            console.warn("Failed to log timer online. Enqueuing for offline sync:", err);
            const pendingEntry: PendingTimeEntry = {
              id: `offline-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              taskId,
              taskName,
              start: startTime,
              durationMs,
              createdAt: Date.now(),
              note,
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
                description: entryDescription(item.taskName, item.note),
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

          set({ elapsedSeconds: currentElapsed, timerHeartbeat: Date.now() });

          // Update menu bar title
          const timeStr = formatTime(currentElapsed);
          setTrayTitle(`${timeStr}`);

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

      logRecoveredTimer: async () => {
        const { recoveredTimer, token, teamId, user } = get();
        if (!recoveredTimer) return;

        const { taskId, taskName, entryId, startTime, trackedSeconds, note } = recoveredTimer;
        const durationMs = trackedSeconds * 1000;

        set({ recoveredTimer: null });
        if (durationMs < 1000) return;

        const enqueueOffline = () => {
          set((state) => ({
            offlineTimeQueue: [
              ...state.offlineTimeQueue,
              {
                id: `offline-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                taskId,
                taskName,
                start: startTime,
                durationMs,
                createdAt: Date.now(),
                note,
              },
            ],
          }));
          notify(
            "Saved Offline",
            `"${taskName}" (${formatTime(trackedSeconds)}) will sync when connection returns.`,
          );
        };

        if (!token || !teamId) {
          enqueueOffline();
          return;
        }

        const client = new ClickUpClient(token);
        try {
          let serverEntry = null;
          if (entryId) {
            try {
              serverEntry = await client.getCurrentTimeEntry(teamId, user?.id);
            } catch (err) {
              // Without knowing whether ClickUp still holds this entry we cannot
              // choose between correcting it and creating a new one — creating
              // one blindly would double-log. Hand it back for a later retry.
              console.warn("Could not check ClickUp before logging recovered time:", err);
              set({ recoveredTimer });
              notify(
                "Couldn't Reach ClickUp",
                `"${taskName}" is still waiting to be logged. Try again when you're online.`,
              );
              return;
            }
          }

          if (entryId && serverEntry && serverEntry.id === entryId) {
            // Still open on ClickUp, so it has been accruing the whole downtime.
            // Stop it, then rewrite it to the time actually tracked.
            await client.stopTimeEntry(teamId);
            await client.updateTimeEntry(teamId, entryId, {
              start: startTime,
              duration: durationMs,
              description: entryDescription(taskName, note),
            });
          } else {
            await client.createTimeEntry(teamId, {
              start: startTime,
              duration: durationMs,
              description: entryDescription(taskName, note),
              taskId,
            });
          }
          await get().syncTodayTime();
          notify("Time Logged", `"${taskName}" (${formatTime(trackedSeconds)}) saved to ClickUp.`);
        } catch (err) {
          console.warn("Failed to log recovered time online:", err);
          enqueueOffline();
        }
      },

      discardRecoveredTimer: async () => {
        const { recoveredTimer, token, teamId, user } = get();
        if (!recoveredTimer) return;

        const { entryId } = recoveredTimer;
        set({ recoveredTimer: null });
        if (!token || !teamId || !entryId) return;

        // If the abandoned entry is still open on ClickUp, discarding locally is
        // not enough — it would keep running there forever.
        try {
          const client = new ClickUpClient(token);
          const serverEntry = await client.getCurrentTimeEntry(teamId, user?.id);
          if (serverEntry && serverEntry.id === entryId) {
            await client.stopTimeEntry(teamId);
            await client.deleteTimeEntry(teamId, entryId);
            await get().syncTodayTime();
          }
        } catch (err) {
          console.warn("Failed to discard the abandoned ClickUp entry:", err);
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

            let entry: ClickUpTimeEntry | null = null;
            try {
              entry = await client.getCurrentTimeEntry(teamId, user?.id);
            } catch (err) {
              // We could not ask ClickUp. "Unknown" is not "nothing is running",
              // so leave local state intact instead of deleting a live timer.
              console.warn("Could not reach ClickUp to sync the timer; keeping local state:", err);
              return;
            }

            const serverIsRunning = entry !== null && (!entry.stop || Number(entry.duration) < 0);

            // Settle any stop we still owe ClickUp before reading the server as
            // truth — an entry we failed to stop keeps accruing time there.
            // Only stop it if it is still the running one, so a timer started
            // since then is never cut short.
            const stuckEntryId = get().pendingStopEntryId;
            if (stuckEntryId) {
              if (entry && serverIsRunning && entry.id === stuckEntryId) {
                try {
                  await client.stopTimeEntry(teamId);
                  set({ pendingStopEntryId: null });
                  await get().syncTodayTime();
                } catch (err) {
                  console.warn("Retrying a pending timer stop failed:", err);
                }
                return;
              }
              // It is no longer running, so nothing is owed.
              set({ pendingStopEntryId: null });
            }

            const current = get().activeTimer;

            if (entry && serverIsRunning) {
              // A locally paused timer must never be revived by the server copy
              // we failed to stop; that turns a pause into billed time.
              if (
                current &&
                !current.isRunning &&
                (!current.entryId || current.entryId === entry.id)
              ) {
                try {
                  await client.stopTimeEntry(teamId);
                  await get().syncTodayTime();
                } catch (err) {
                  set({ pendingStopEntryId: entry.id });
                  console.warn("Could not stop the ClickUp entry behind a paused timer:", err);
                }
                return;
              }

              const startTimestamp = Number(entry.start);
              const now = Date.now();
              if (!Number.isFinite(startTimestamp) || startTimestamp <= 0 || startTimestamp > now) {
                console.warn("Ignoring ClickUp entry with an implausible start:", entry.start);
                return;
              }

              const taskId = entry.task?.id || "";
              const taskName =
                entry.task?.name ||
                tasks.find((t) => t.id === taskId)?.name ||
                entry.description ||
                "Active Task";

              // Segments finished before this one (e.g. before a pause) exist only
              // in local accumulatedSeconds — the server entry starts at the resume.
              const continuesLocal =
                current !== null &&
                current.isRunning &&
                (current.entryId === entry.id || current.taskId === taskId);
              const accumulated = continuesLocal ? current.accumulatedSeconds || 0 : 0;
              // A description that is not just the task name is a note, whether
              // it was written here or in ClickUp.
              const serverNote =
                entry.description && entry.description !== taskName ? entry.description : undefined;
              const note = continuesLocal ? current.note || serverNote : serverNote;
              const elapsed = accumulated + Math.max(0, Math.floor((now - startTimestamp) / 1000));

              set({
                activeTimer: {
                  entryId: entry.id,
                  taskId,
                  taskName,
                  startTime: startTimestamp,
                  accumulatedSeconds: accumulated,
                  isRunning: true,
                  note,
                },
                elapsedSeconds: elapsed,
                timerHeartbeat: now,
              });

              setTrayTitle(`${formatTime(elapsed)}`);
            } else if (current && current.isRunning) {
              // ClickUp definitively reports nothing running: the timer was stopped
              // elsewhere, so drop ours and re-read today's total.
              set({
                activeTimer: null,
                elapsedSeconds: 0,
                timerHeartbeat: null,
              });
              setTrayTitle(IDLE_TRAY_TITLE);
              await get().syncTodayTime();
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
              const dayStart = startOfDay.getTime();
              const dayEnd = endOfDay.getTime();
              let totalSeconds = 0;
              for (const entry of entries) {
                // In ClickUp API, completed entries have positive duration in milliseconds
                const dur = Number(entry.duration);
                if (!(dur > 0)) continue;

                // An entry that began before midnight is returned in full; count
                // only the part that actually falls inside today.
                const entryStart = Number(entry.start);
                if (!Number.isFinite(entryStart) || entryStart <= 0) {
                  totalSeconds += Math.floor(dur / 1000);
                  continue;
                }
                const overlapMs =
                  Math.min(entryStart + dur, dayEnd) - Math.max(entryStart, dayStart);
                if (overlapMs > 0) {
                  totalSeconds += Math.floor(overlapMs / 1000);
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

      fetchLists: async () => {
        const { token, teamId } = get();
        if (!token || !teamId) return [];

        if (fetchListsPromise) {
          return fetchListsPromise;
        }

        set({ isLoadingLists: true });

        fetchListsPromise = (async () => {
          try {
            const client = new ClickUpClient(token);
            const lists = await client.getLists(teamId);

            set((state) => {
              const listMap = new Map<string, ClickUpList>();
              // Keep any previously discovered lists
              for (const l of state.availableLists) {
                listMap.set(l.id, l);
              }
              for (const l of lists) {
                listMap.set(l.id, l);
              }

              const merged = Array.from(listMap.values());
              const currentSelected = state.selectedListId;
              const selectedListId =
                currentSelected && listMap.has(currentSelected)
                  ? currentSelected
                  : merged[0]?.id || null;

              return {
                availableLists: merged,
                selectedListId,
                isLoadingLists: false,
              };
            });

            return lists;
          } catch (err) {
            console.warn("Failed to fetch lists from ClickUp:", err);
            set({ isLoadingLists: false });
            return [];
          } finally {
            fetchListsPromise = null;
          }
        })();

        return fetchListsPromise;
      },

      syncAll: async () => {
        const { token } = get();
        if (!token) {
          return { ok: false, error: "Not connected to ClickUp. Add a token in Settings." };
        }

        set({ isSyncing: true, lastSyncError: null });
        try {
          // A persisted session can carry a token without a workspace id (an older
          // build, or a getTeams() call that failed at connect time). Recover it
          // here instead of returning silently and leaving the button inert.
          if (!get().teamId) {
            try {
              const teams = await new ClickUpClient(token).getTeams();
              const first = teams?.[0];
              if (!first) {
                return { ok: false, error: "No ClickUp workspace found for this account." };
              }
              get().setTeam(first.id, first.name);
            } catch (err) {
              return {
                ok: false,
                error: err instanceof Error ? err.message : "Could not reach ClickUp.",
              };
            }
          }

          await Promise.allSettled([
            get().flushOfflineQueue(),
            get().fetchTasks(),
            get().fetchLists(),
            get().syncCurrentTimer(),
            get().syncTodayTime(),
          ]);

          const error = get().lastSyncError;
          return error ? { ok: false, error } : { ok: true };
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

            // Automatically register lists discovered from tasks
            const listsFromTasks: ClickUpList[] = [];
            for (const t of tasks) {
              if (t.list && t.list.id && t.list.name) {
                listsFromTasks.push({
                  id: t.list.id,
                  name: t.list.name,
                });
              }
            }

            set((state) => {
              const listMap = new Map<string, ClickUpList>();
              for (const l of state.availableLists) {
                listMap.set(l.id, l);
              }
              for (const l of listsFromTasks) {
                if (!listMap.has(l.id)) {
                  listMap.set(l.id, l);
                }
              }

              const mergedLists = Array.from(listMap.values());
              const selectedListId = state.selectedListId || mergedLists[0]?.id || null;

              return {
                tasks,
                availableLists: mergedLists,
                selectedListId,
                isLoadingTasks: false,
                lastTaskPollTime: Date.now(),
              };
            });

            // Fire and forget: rows render immediately, subtasks fill in after.
            get().fetchSubtasks();
          } catch (err) {
            console.error("Failed to fetch tasks:", err);
            set({
              isLoadingTasks: false,
              lastSyncError: err instanceof Error ? err.message : "Failed to fetch tasks",
            });
          } finally {
            fetchTasksPromise = null;
          }
        })();

        return fetchTasksPromise;
      },

      /** The workspace task query is assignee-filtered, so it returns a subtask
       *  only when that subtask is assigned to the user, and never its parent.
       *  Pull the real tree for each visible task so rows can be grouped. */
      fetchSubtasks: async () => {
        const { token, tasks } = get();
        if (!token || tasks.length === 0) return;

        if (fetchSubtasksPromise) {
          return fetchSubtasksPromise;
        }

        fetchSubtasksPromise = (async () => {
          set({ isLoadingSubtasks: true });
          try {
            const client = new ClickUpClient(token);
            const known = new Set(tasks.map((t) => t.id));
            // Only ask about tasks that are not themselves a known subtask, and
            // cap the fan-out so a large workspace cannot flood the API.
            const roots = tasks
              .filter((t) => !t.parent || !known.has(t.parent))
              .filter((t) => !t.id.startsWith("local-") && !t.id.startsWith("demo-"))
              .slice(0, SUBTASK_FETCH_LIMIT);

            const results: Record<string, ClickUpTask[]> = {};
            let cursor = 0;
            const worker = async () => {
              while (cursor < roots.length) {
                const task = roots[cursor++];
                if (!task) return;
                try {
                  const full = await client.getTask(task.id, true);
                  const children = (full.subtasks || []).filter((sub) => sub.id !== task.id);
                  if (children.length > 0) {
                    results[task.id] = children;
                  }
                } catch (err) {
                  console.warn(`Failed to fetch subtasks for ${task.id}:`, err);
                }
              }
            };
            await Promise.all(
              Array.from({ length: Math.min(SUBTASK_FETCH_CONCURRENCY, roots.length) }, worker),
            );

            set({ subtasksByParent: results, isLoadingSubtasks: false });
          } catch (err) {
            console.warn("Failed to fetch subtasks:", err);
            set({ isLoadingSubtasks: false });
          } finally {
            fetchSubtasksPromise = null;
          }
        })();

        return fetchSubtasksPromise;
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

      createTask: async ({ name, listId, priority, dueDate, description }) => {
        const { token, teamId, user, selectedListId, availableLists, tasks, taskCreationEnabled } =
          get();

        if (!taskCreationEnabled) {
          throw new Error("Task creation is disabled in Settings.");
        }

        // If offline / no token connected, save locally
        if (!token || !teamId) {
          const newTask: ClickUpTask = {
            id: `local-${Date.now()}`,
            name,
            status: { status: "to do", color: "#9ca3af", type: "open", orderindex: 0 },
            priority: priority
              ? {
                  priority:
                    priority === 1
                      ? "urgent"
                      : priority === 2
                        ? "high"
                        : priority === 3
                          ? "normal"
                          : "low",
                  color:
                    priority === 1
                      ? "#f43f5e"
                      : priority === 2
                        ? "#f59e0b"
                        : priority === 3
                          ? "#0ea5e9"
                          : "#9ca3af",
                }
              : null,
            list: { id: "local", name: "Local Tasks" },
          };
          set((state) => ({ tasks: [newTask, ...state.tasks] }));
          return newTask;
        }

        set({ isCreatingTask: true });
        try {
          const client = new ClickUpClient(token);

          // Find target list
          let targetListId = listId || selectedListId;

          if (!targetListId) {
            if (availableLists.length > 0 && availableLists[0]) {
              targetListId = availableLists[0].id;
            } else if (tasks.length > 0 && tasks[0]?.list?.id) {
              targetListId = tasks[0].list.id;
            } else {
              // Try to fetch lists on the fly
              const lists = await get().fetchLists();
              if (lists.length > 0 && lists[0]) {
                targetListId = lists[0].id;
              }
            }
          }

          if (!targetListId) {
            throw new Error(
              "No ClickUp list found in this workspace. Please create a list in ClickUp first.",
            );
          }

          const created = await client.createTask(targetListId, {
            name,
            description,
            assignees: user?.id ? [user.id] : undefined,
            priority,
            dueDate,
          });

          // Ensure task has list metadata if missing from raw response
          const targetListObj = availableLists.find((l) => l.id === targetListId);
          const fullTask: ClickUpTask = {
            ...created,
            list:
              created.list ||
              (targetListObj ? { id: targetListObj.id, name: targetListObj.name } : undefined),
          };

          set((state) => ({
            tasks: [fullTask, ...state.tasks.filter((t) => t.id !== fullTask.id)],
            selectedListId: targetListId,
          }));

          return fullTask;
        } finally {
          set({ isCreatingTask: false });
        }
      },

      quickAddTask: async (name, listId, priority) => {
        return await get().createTask({ name, listId, priority });
      },

      updateTaskStatus: async (taskId, newStatus) => {
        const { token, tasks } = get();

        // Optimistic update
        const updated = tasks.map((t) =>
          t.id === taskId ? { ...t, status: { ...t.status, status: newStatus } } : t,
        );
        set({ tasks: updated });

        if (token && !taskId.startsWith("local-") && !taskId.startsWith("demo-")) {
          try {
            const client = new ClickUpClient(token);
            await client.updateTaskStatus(taskId, newStatus);
          } catch (err) {
            console.error("Failed to update status on ClickUp:", err);
          }
        }
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
        customClientId: state.customClientId || "",
        customClientSecret: state.customClientSecret || "",
        dailyGoalHours: state.dailyGoalHours,
        pomodoroDurationMinutes: state.pomodoroDurationMinutes,
        isPinned: state.isPinned,
        taskCreationEnabled: state.taskCreationEnabled,
        notificationsEnabled: state.notificationsEnabled,
        activeTimer: state.activeTimer,
        timerHeartbeat: state.timerHeartbeat,
        recoveredTimer: state.recoveredTimer,
        pendingStopEntryId: state.pendingStopEntryId,
        todayLoggedSeconds: state.todayLoggedSeconds,
        offlineTimeQueue: state.offlineTimeQueue || [],
        tasks: (state.tasks || []).filter((t) => !t.id.startsWith("demo-")),
        subtasksByParent: state.subtasksByParent || {},
        availableLists: state.availableLists || [],
        selectedListId: state.selectedListId,
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

          // Ensure availableLists is initialized as array
          if (!Array.isArray(state.availableLists)) {
            state.availableLists = [];
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
            setTrayTitle(IDLE_TRAY_TITLE);
          } else if (state.activeTimer) {
            if (state.activeTimer.isRunning) {
              const timer = state.activeTimer;
              const heartbeat = state.timerHeartbeat;
              // The last tick is the last moment we can vouch for. Anything after
              // it is time the app was closed or the machine asleep.
              const lastSeen =
                typeof heartbeat === "number" && heartbeat > timer.startTime
                  ? heartbeat
                  : timer.startTime;
              const gapMs = Date.now() - lastSeen;

              if (gapMs > STALE_GAP_MS) {
                state.recoveredTimer = {
                  taskId: timer.taskId,
                  taskName: timer.taskName,
                  entryId: timer.entryId,
                  startTime: timer.startTime,
                  trackedSeconds:
                    (timer.accumulatedSeconds || 0) +
                    Math.max(0, Math.floor((lastSeen - timer.startTime) / 1000)),
                  gapSeconds: Math.floor(gapMs / 1000),
                  note: timer.note,
                };
                state.activeTimer = null;
                state.elapsedSeconds = 0;
                state.timerHeartbeat = null;
                setTrayTitle(IDLE_TRAY_TITLE);
              } else {
                const elapsed =
                  (timer.accumulatedSeconds || 0) +
                  Math.max(0, Math.floor((Date.now() - timer.startTime) / 1000));
                state.elapsedSeconds = elapsed;
                setTrayTitle(`${formatTime(elapsed)}`);
              }
            } else {
              state.elapsedSeconds = state.activeTimer.accumulatedSeconds || 0;
              setTrayTitle("⏸ Paused");
            }
          }

          if (!state.activeTimer) {
            state.elapsedSeconds = 0;
            setTrayTitle(IDLE_TRAY_TITLE);
          }
        }
      },
    },
  ),
);
