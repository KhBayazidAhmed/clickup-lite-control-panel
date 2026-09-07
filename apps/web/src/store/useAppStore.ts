import { create } from "zustand";
import { persist } from "zustand/middleware";
import { ClickUpClient, ClickUpList, ClickUpTask, ClickUpUser } from "../lib/clickup";
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

export interface PendingTaskEntry {
  localId: string;
  name: string;
  listId?: string;
  priority?: number;
  dueDate?: number;
  description?: string;
  createdAt: number;
}

export interface PendingStatusEntry {
  id: string;
  taskId: string;
  status: string;
  updatedAt: number;
}

export interface PendingStopEntry {
  id: string;
  entryId: string;
  start: number;
  durationMs: number;
  taskName: string;
  note?: string;
  createdAt: number;
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
  isOnline: boolean;
  setIsOnline: (online: boolean) => void;

  // Timer
  activeTimer: ActiveTimer | null;
  elapsedSeconds: number;
  todayLoggedSeconds: number;
  todayDate?: string;
  dailyGoalHours: number;
  isSyncing: boolean;
  lastSyncError: string | null;
  /** Written every tick so a relaunch can tell tracked time from downtime. */
  timerHeartbeat: number | null;
  recoveredTimer: RecoveredTimer | null;
  /** ClickUp entries we failed to stop; retried on every sync so they can never
   *  keep running (and inflating) behind our back. */
  pendingStopQueue: PendingStopEntry[];

  // Offline Sync Queue
  offlineTimeQueue: PendingTimeEntry[];
  offlineTaskQueue: PendingTaskEntry[];
  offlineStatusQueue: PendingStatusEntry[];
  flushOfflineQueue: () => Promise<void>;

  // Pomodoro & Notifications
  isPomodoroActive: boolean;
  pomodoroSecondsRemaining: number;
  pomodoroDurationMinutes: number;
  notificationsEnabled: boolean;

  // Window & UX
  availableUpdateVersion: string | null;
  setAvailableUpdateVersion: (version: string | null) => void;
  isPinned: boolean;
  taskCreationEnabled: boolean;
  confirmTaskCompletion: boolean;
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
  setConfirmTaskCompletion: (enabled: boolean) => void;
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
function entryDescription(_taskName: string, note?: string): string {
  // Only return user notes; do NOT fallback to taskName because ClickUp
  // counts non-empty descriptions as "Advanced Time Tracking" (40 use limit).
  return (note || "").trim();
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
      isOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
      setIsOnline: (isOnline) => set({ isOnline }),

      activeTimer: null,
      elapsedSeconds: 0,
      todayLoggedSeconds: 0,
      todayDate: new Date().toISOString().slice(0, 10),
      dailyGoalHours: 8,
      isSyncing: false,
      lastSyncError: null,
      timerHeartbeat: null,
      recoveredTimer: null,
      pendingStopQueue: [],

      offlineTimeQueue: [],
      offlineTaskQueue: [],
      offlineStatusQueue: [],

      isPomodoroActive: false,
      pomodoroSecondsRemaining: 25 * 60,
      pomodoroDurationMinutes: 25,
      notificationsEnabled: true,

      availableUpdateVersion: null,
      setAvailableUpdateVersion: (availableUpdateVersion) => set({ availableUpdateVersion }),
      isPinned: false,
      taskCreationEnabled: true,
      confirmTaskCompletion: true,
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
      setConfirmTaskCompletion: (confirmTaskCompletion) => set({ confirmTaskCompletion }),
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
        const { activeTimer } = get();

        // If a timer was active (whether running or paused), finish and save it cleanly first!
        if (activeTimer) {
          await get().stopTimer();
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
          timerHeartbeat: now,
          recoveredTimer: null,
        });

        setTrayTitle("00:00");

        const { token, teamId, isOnline } = get();
        if (
          token &&
          teamId &&
          isOnline &&
          !taskId.startsWith("local-") &&
          !taskId.startsWith("demo-")
        ) {
          try {
            const client = new ClickUpClient(token);
            const entry = await client.startTimeEntry(teamId, taskId);
            if (entry) {
              set((state) => ({
                activeTimer: state.activeTimer
                  ? {
                      ...state.activeTimer,
                      entryId: entry.id,
                      startTime:
                        entry.start && Number(entry.start) > 0 && Number(entry.start) <= Date.now()
                          ? Number(entry.start)
                          : state.activeTimer.startTime,
                    }
                  : null,
              }));
              get().syncTodayTime();
            }
          } catch (err) {
            console.warn("ClickUp API sync error on startTimer (tracking locally):", err);
          }
        }
      },

      /** Attaches a note to the running session. Pushed to ClickUp right away
       *  when an entry already exists there, so the note survives a stop that
       *  happens elsewhere (or a crash) rather than only landing on stop. */
      setTimerNote: async (note) => {
        const { activeTimer, token, teamId, isOnline } = get();
        if (!activeTimer) return;
        if ((activeTimer.note || "") === note) return;

        set({ activeTimer: { ...activeTimer, note } });

        const entryId = activeTimer.entryId;
        if (!entryId || !token || !teamId || !isOnline) return;

        try {
          const client = new ClickUpClient(token);
          await client.updateTimeEntry(teamId, entryId, {
            description: entryDescription(activeTimer.taskName, note),
          });
        } catch (err) {
          console.warn("ClickUp API sync error on setTimerNote:", err);
        }
      },

      pauseTimer: async () => {
        const { activeTimer, elapsedSeconds, token, teamId, isOnline } = get();
        if (!activeTimer || !activeTimer.isRunning) return;

        const now = Date.now();
        const segmentDurationSec = Math.max(0, Math.floor((now - activeTimer.startTime) / 1000));
        const entryId = activeTimer.entryId;

        set({
          activeTimer: {
            ...activeTimer,
            isRunning: false,
            accumulatedSeconds: elapsedSeconds,
            entryId: undefined, // Segment closed on ClickUp; next resume begins new segment
          },
          timerHeartbeat: null,
        });

        setTrayTitle("⏸ Paused");

        if (entryId && token && teamId) {
          if (isOnline) {
            try {
              const client = new ClickUpClient(token);
              await client.stopTimeEntry(teamId);
              return;
            } catch (err) {
              console.warn("ClickUp API sync error on pauseTimer, queuing stop:", err);
            }
          }
          // Queue stop entry so ClickUp does not keep running it
          set((state) => ({
            pendingStopQueue: [
              ...state.pendingStopQueue,
              {
                id: `stop-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                entryId,
                start: activeTimer.startTime,
                durationMs: segmentDurationSec * 1000,
                taskName: activeTimer.taskName,
                note: activeTimer.note,
                createdAt: Date.now(),
              },
            ],
          }));
        }
      },

      resumeTimer: async () => {
        const { activeTimer, token, teamId, isOnline } = get();
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

        if (
          token &&
          teamId &&
          isOnline &&
          !activeTimer.taskId.startsWith("local-") &&
          !activeTimer.taskId.startsWith("demo-")
        ) {
          try {
            const client = new ClickUpClient(token);
            const entry = await client.startTimeEntry(
              teamId,
              activeTimer.taskId,
              activeTimer.note ? activeTimer.note.trim() : undefined,
            );
            if (entry) {
              set((state) => ({
                activeTimer: state.activeTimer ? { ...state.activeTimer, entryId: entry.id } : null,
              }));
              get().syncTodayTime();
            }
          } catch (err) {
            console.warn("ClickUp API sync error on resumeTimer:", err);
          }
        }
      },

      stopTimer: async () => {
        const { activeTimer, elapsedSeconds, todayLoggedSeconds, token, teamId, isOnline } = get();
        if (!activeTimer) return;

        const now = Date.now();
        const totalDurationMs = elapsedSeconds * 1000;
        const segmentDurationSec = activeTimer.isRunning
          ? Math.max(0, Math.floor((now - activeTimer.startTime) / 1000))
          : 0;
        const segmentDurationMs = segmentDurationSec * 1000;

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

        // Sub-second timers: clean up any live server entry and exit
        if (totalDurationMs < 1000) {
          if (hadEntryId && entryId && token && teamId) {
            try {
              const client = new ClickUpClient(token);
              await client.stopTimeEntry(teamId);
              await client.deleteTimeEntry(teamId, entryId).catch(() => {});
            } catch {
              // ignore sub-second discard errors
            }
          }
          return;
        }

        const enqueueOfflineTime = (start: number, durMs: number) => {
          if (durMs < 1000) return;
          const pendingEntry: PendingTimeEntry = {
            id: `offline-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            taskId,
            taskName,
            start,
            durationMs: durMs,
            createdAt: Date.now(),
            note,
          };
          set((state) => ({
            offlineTimeQueue: [...state.offlineTimeQueue, pendingEntry],
          }));
          notify(
            "Saved Offline",
            `"${taskName}" (${formatTime(Math.floor(durMs / 1000))}) will sync when connection returns.`,
          );
        };

        if (!token || !teamId) {
          enqueueOfflineTime(now - totalDurationMs, totalDurationMs);
          return;
        }

        // Case A: Live ClickUp entry running on the server
        if (hadEntryId && entryId) {
          if (isOnline) {
            try {
              const client = new ClickUpClient(token);
              await client.stopTimeEntry(teamId);
              if ((note || "").trim()) {
                await client.updateTimeEntry(teamId, entryId, {
                  description: entryDescription(taskName, note),
                });
              }
              await get().syncTodayTime();
              return;
            } catch (err) {
              set({ isOnline: false });
              console.warn("Failed to stop ClickUp entry online, queuing stop entry:", err);
            }
          }

          set((state) => ({
            pendingStopQueue: [
              ...state.pendingStopQueue,
              {
                id: `stop-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                entryId,
                start: activeTimer.startTime,
                durationMs: segmentDurationMs,
                taskName,
                note,
                createdAt: Date.now(),
              },
            ],
          }));
          notify(
            "Timer Stopped Offline",
            `"${taskName}" will finish syncing when connection returns.`,
          );
          return;
        }

        // Case B: Purely local or offline session
        const sessionStartTime = now - totalDurationMs;

        if (isOnline && !taskId.startsWith("local-") && !taskId.startsWith("demo-")) {
          try {
            const client = new ClickUpClient(token);
            await client.createTimeEntry(teamId, {
              start: sessionStartTime,
              duration: totalDurationMs,
              description: entryDescription(taskName, note),
              taskId,
            });
            await get().syncTodayTime();
            return;
          } catch (err) {
            set({ isOnline: false });
            console.warn("Failed to create time entry online, saving to offline queue:", err);
          }
        }

        enqueueOfflineTime(sessionStartTime, totalDurationMs);
      },

      flushOfflineQueue: async () => {
        const {
          token,
          teamId,
          offlineTimeQueue,
          offlineTaskQueue,
          offlineStatusQueue,
          pendingStopQueue,
        } = get();

        const totalPending =
          (offlineTimeQueue?.length || 0) +
          (offlineTaskQueue?.length || 0) +
          (offlineStatusQueue?.length || 0) +
          (pendingStopQueue?.length || 0);

        if (!token || !teamId || totalPending === 0) return;

        if (flushOfflinePromise) return flushOfflinePromise;

        flushOfflinePromise = (async () => {
          const client = new ClickUpClient(token);

          // 1. Settle pending stop queue
          const currentStopQueue = get().pendingStopQueue || [];
          const remainingStops: PendingStopEntry[] = [];
          let syncedStopsCount = 0;

          for (const stopItem of currentStopQueue) {
            try {
              const running = await client.getCurrentTimeEntry(teamId).catch(() => null);
              if (running && running.id === stopItem.entryId) {
                await client.stopTimeEntry(teamId);
              }
              if (stopItem.durationMs === 0) {
                // Abandoned / discarded timer: delete from ClickUp
                await client.deleteTimeEntry(teamId, stopItem.entryId).catch(() => {});
              } else if (stopItem.start && stopItem.durationMs && stopItem.durationMs >= 1000) {
                await client.updateTimeEntry(teamId, stopItem.entryId, {
                  start: stopItem.start,
                  duration: stopItem.durationMs,
                  description: entryDescription(stopItem.taskName, stopItem.note),
                });
              }
              syncedStopsCount++;
            } catch (err: unknown) {
              const errMsg = err instanceof Error ? err.message : String(err);
              if (
                errMsg.includes("not found") ||
                errMsg.includes("TIMEENTRY_001") ||
                errMsg.includes("404")
              ) {
                console.warn(`Stop entry ${stopItem.entryId} no longer exists on ClickUp:`, err);
                syncedStopsCount++; // drop dead entry
              } else {
                console.warn("Failed to settle pending stop entry, retaining:", err);
                remainingStops.push(stopItem);
              }
            }
          }
          set({ pendingStopQueue: remainingStops });

          // 2. Flush offline tasks first so remapped task IDs can update time & status queues
          const currentTasksQueue = get().offlineTaskQueue || [];
          const remainingTasks: PendingTaskEntry[] = [];
          const localToRemoteTaskMap = new Map<string, string>();
          let syncedTasksCount = 0;

          for (const taskItem of currentTasksQueue) {
            try {
              let targetListId = taskItem.listId || get().selectedListId;
              if (!targetListId) {
                const lists = get().availableLists;
                if (lists.length > 0 && lists[0]) {
                  targetListId = lists[0].id;
                }
              }
              if (!targetListId) {
                const fetchedLists = await client.getLists(teamId);
                if (fetchedLists.length > 0 && fetchedLists[0]) {
                  targetListId = fetchedLists[0].id;
                }
              }

              if (!targetListId) {
                remainingTasks.push(taskItem);
                continue;
              }

              const created = await client.createTask(targetListId, {
                name: taskItem.name,
                description: taskItem.description,
                priority: taskItem.priority,
                dueDate: taskItem.dueDate,
              });

              localToRemoteTaskMap.set(taskItem.localId, created.id);
              syncedTasksCount++;

              set((state) => ({
                tasks: state.tasks.map((t) => (t.id === taskItem.localId ? created : t)),
                activeTimer:
                  state.activeTimer && state.activeTimer.taskId === taskItem.localId
                    ? { ...state.activeTimer, taskId: created.id }
                    : state.activeTimer,
              }));
            } catch (err) {
              console.warn("Failed to flush offline task, retaining:", err);
              remainingTasks.push(taskItem);
            }
          }

          set({ offlineTaskQueue: remainingTasks });

          // Remap localIds to real ClickUp IDs in time queue & status queue
          if (localToRemoteTaskMap.size > 0) {
            set((state) => ({
              offlineTimeQueue: state.offlineTimeQueue.map((item) => {
                if (item.taskId && localToRemoteTaskMap.has(item.taskId)) {
                  return { ...item, taskId: localToRemoteTaskMap.get(item.taskId)! };
                }
                return item;
              }),
              offlineStatusQueue: (state.offlineStatusQueue || []).map((item) => {
                if (localToRemoteTaskMap.has(item.taskId)) {
                  return { ...item, taskId: localToRemoteTaskMap.get(item.taskId)! };
                }
                return item;
              }),
            }));
          }

          // 3. Flush offline time entries
          const currentTimeQueue = get().offlineTimeQueue || [];
          const remainingTime: PendingTimeEntry[] = [];
          let syncedTimeCount = 0;

          for (const item of currentTimeQueue) {
            // If task was created offline and has not synced yet, retain until task is created
            if (
              item.taskId &&
              item.taskId.startsWith("local-") &&
              !localToRemoteTaskMap.has(item.taskId)
            ) {
              remainingTime.push(item);
              continue;
            }

            try {
              await client.createTimeEntry(teamId, {
                start: item.start,
                duration: item.durationMs,
                description: entryDescription(item.taskName, item.note),
                taskId: item.taskId,
              });
              syncedTimeCount++;
            } catch (err: unknown) {
              const errMsg = err instanceof Error ? err.message : String(err);
              if (
                item.taskId &&
                (errMsg.includes("TASK_010") ||
                  errMsg.includes("TASK_001") ||
                  errMsg.includes("not found"))
              ) {
                // Task invalid/deleted in ClickUp: log without task so work time is not lost!
                try {
                  await client.createTimeEntry(teamId, {
                    start: item.start,
                    duration: item.durationMs,
                    description: entryDescription(item.taskName, item.note),
                  });
                  syncedTimeCount++;
                  continue;
                } catch {
                  // retain if still failing
                }
              }
              console.warn("Failed to flush offline time entry, retaining in queue:", err);
              remainingTime.push(item);
            }
          }

          set({ offlineTimeQueue: remainingTime });

          // 4. Flush offline status updates
          const currentStatusQueue = get().offlineStatusQueue || [];
          const remainingStatus: PendingStatusEntry[] = [];
          let syncedStatusCount = 0;

          for (const statusItem of currentStatusQueue) {
            if (statusItem.taskId.startsWith("local-")) {
              remainingStatus.push(statusItem);
              continue;
            }
            try {
              await client.updateTaskStatus(statusItem.taskId, statusItem.status);
              syncedStatusCount++;
            } catch (err: unknown) {
              const errMsg = err instanceof Error ? err.message : String(err);
              if (
                errMsg.includes("not found") ||
                errMsg.includes("TASK_010") ||
                errMsg.includes("TASK_001")
              ) {
                syncedStatusCount++;
              } else {
                console.warn("Failed to flush offline status update:", err);
                remainingStatus.push(statusItem);
              }
            }
          }

          set({ offlineStatusQueue: remainingStatus });

          const totalSynced =
            syncedTimeCount + syncedTasksCount + syncedStatusCount + syncedStopsCount;
          if (totalSynced > 0) {
            set({ isOnline: true });
            const parts: string[] = [];
            if (syncedTimeCount > 0) {
              parts.push(`${syncedTimeCount} time session${syncedTimeCount > 1 ? "s" : ""}`);
            }
            if (syncedTasksCount > 0) {
              parts.push(`${syncedTasksCount} task${syncedTasksCount > 1 ? "s" : ""}`);
            }
            if (syncedStatusCount > 0) {
              parts.push(`${syncedStatusCount} status update${syncedStatusCount > 1 ? "s" : ""}`);
            }
            if (syncedStopsCount > 0) {
              parts.push(`${syncedStopsCount} timer stop${syncedStopsCount > 1 ? "s" : ""}`);
            }

            notify("Offline Work Synced", `Uploaded ${parts.join(", ")} to ClickUp.`);
            get().syncTodayTime();
            get().fetchTasks();
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

          // Timer finished
          if (nextPomo === 0 && notificationsEnabled) {
            notify("Pomodoro Complete!", "Great job! Take a short break.");
            setTrayTitle("🎉 Break");
          }
        }
      },

      logRecoveredTimer: async () => {
        const { recoveredTimer, token, teamId, isOnline } = get();
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

        if (!token || !teamId || !isOnline) {
          enqueueOffline();
          return;
        }

        const client = new ClickUpClient(token);
        try {
          let serverEntry = null;
          if (entryId) {
            try {
              serverEntry = await client.getCurrentTimeEntry(teamId);
            } catch (err) {
              console.warn(
                "Could not check ClickUp before logging recovered time, queueing offline:",
                err,
              );
              enqueueOffline();
              return;
            }
          }

          if (entryId && serverEntry && serverEntry.id === entryId) {
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
          console.warn("Failed to log recovered time online, saving offline:", err);
          enqueueOffline();
        }
      },

      discardRecoveredTimer: async () => {
        const { recoveredTimer, token, teamId, isOnline } = get();
        if (!recoveredTimer) return;

        const { entryId, startTime, taskName } = recoveredTimer;
        set({ recoveredTimer: null });
        if (!token || !teamId || !entryId) return;

        if (isOnline) {
          try {
            const client = new ClickUpClient(token);
            const serverEntry = await client.getCurrentTimeEntry(teamId);
            if (serverEntry && serverEntry.id === entryId) {
              await client.stopTimeEntry(teamId).catch(() => {});
              await client.deleteTimeEntry(teamId, entryId).catch(() => {});
              await get().syncTodayTime();
              return;
            }
          } catch (err) {
            console.warn("Failed to discard the abandoned ClickUp entry online:", err);
          }
        }

        // If offline or network failed, queue a stop with duration 0 so ClickUp deletes it on reconnect
        set((state) => ({
          pendingStopQueue: [
            ...state.pendingStopQueue,
            {
              id: `discard-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              entryId,
              start: startTime,
              durationMs: 0,
              taskName,
              createdAt: Date.now(),
            },
          ],
        }));
      },

      syncCurrentTimer: async () => {
        const { token, teamId, tasks, isOnline } = get();
        if (!token || !teamId || !isOnline) return;

        if (syncTimerPromise) {
          return syncTimerPromise;
        }

        syncTimerPromise = (async () => {
          try {
            const client = new ClickUpClient(token);
            const entry = await client.getCurrentTimeEntry(teamId);
            const serverIsRunning = entry !== null && (!entry.stop || Number(entry.stop) === 0);

            // Settle pending stop queue if items are waiting
            const stops = get().pendingStopQueue || [];
            if (stops.length > 0) {
              await get().flushOfflineQueue();
            }

            const current = get().activeTimer;

            if (entry && serverIsRunning) {
              // A locally paused timer must never be revived by the server copy
              if (
                current &&
                !current.isRunning &&
                (!current.entryId || current.entryId === entry.id)
              ) {
                try {
                  await client.stopTimeEntry(teamId);
                  await get().syncTodayTime();
                } catch (err) {
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

              const continuesLocal =
                current !== null &&
                current.isRunning &&
                (current.entryId === entry.id || current.taskId === taskId);
              const accumulated = continuesLocal ? current.accumulatedSeconds || 0 : 0;
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
              // If tracking locally (no entryId, local task, or started < 15s ago), DO NOT wipe!
              if (
                !current.entryId ||
                current.taskId.startsWith("local-") ||
                current.taskId.startsWith("demo-") ||
                Date.now() - current.startTime < 15000
              ) {
                return;
              }

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
              // Also include un-flushed offline time entries from today so the counter does not jump backwards
              const offlineQueue = get().offlineTimeQueue || [];
              for (const off of offlineQueue) {
                const offStart = off.start;
                const offDur = off.durationMs;
                if (offStart && offDur > 0) {
                  const overlapMs =
                    Math.min(offStart + offDur, dayEnd) - Math.max(offStart, dayStart);
                  if (overlapMs > 0) {
                    totalSeconds += Math.floor(overlapMs / 1000);
                  }
                }
              }

              // Also include un-flushed pending stop entries from today
              const stopQueue = get().pendingStopQueue || [];
              for (const stop of stopQueue) {
                const stopStart = stop.start;
                const stopDur = stop.durationMs;
                if (stopStart && stopDur > 0) {
                  const overlapMs =
                    Math.min(stopStart + stopDur, dayEnd) - Math.max(stopStart, dayStart);
                  if (overlapMs > 0) {
                    totalSeconds += Math.floor(overlapMs / 1000);
                  }
                }
              }

              set({
                todayLoggedSeconds: totalSeconds,
                todayDate: new Date().toISOString().slice(0, 10),
                isOnline: true,
              });
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
                isOnline: true,
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
              set({ isOnline: false });
              return {
                ok: false,
                error: err instanceof Error ? err.message : "Could not reach ClickUp.",
              };
            }
          }

          // Flush any offline work first
          await get()
            .flushOfflineQueue()
            .catch((err) => {
              console.warn("flushOfflineQueue error during syncAll:", err);
            });

          await Promise.allSettled([
            get().fetchTasks(),
            get().fetchLists(),
            get().syncCurrentTimer(),
            get().syncTodayTime(),
          ]);

          set({ isOnline: true });
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

              // Preserve unsynced local tasks
              const localTasks = (state.tasks || []).filter((t) => t.id.startsWith("local-"));
              const allTasks = [...localTasks, ...tasks];

              // Reapply pending status updates from offlineStatusQueue
              const pendingStatuses = new Map(
                (state.offlineStatusQueue || []).map((s) => [s.taskId, s.status]),
              );
              const finalTasks = allTasks.map((t) => {
                const pendingStatus = pendingStatuses.get(t.id);
                if (pendingStatus) {
                  return { ...t, status: { ...t.status, status: pendingStatus } };
                }
                return t;
              });

              return {
                tasks: finalTasks,
                availableLists: mergedLists,
                selectedListId,
                isLoadingTasks: false,
                lastTaskPollTime: Date.now(),
                isOnline: true,
              };
            });

            // Fire and forget: rows render immediately, subtasks fill in after.
            get().fetchSubtasks();
          } catch (err) {
            console.error("Failed to fetch tasks:", err);
            set({
              isLoadingTasks: false,
              isOnline: false,
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
              set({ tasks: freshTasks, lastTaskPollTime: now, isOnline: true });
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

            // Preserve unsynced local tasks and pending statuses
            const localTasks = (currentTasks || []).filter((t) => t.id.startsWith("local-"));
            const allTasks = [...localTasks, ...freshTasks];
            const pendingStatuses = new Map(
              (get().offlineStatusQueue || []).map((s) => [s.taskId, s.status]),
            );
            const finalTasks = allTasks.map((t) => {
              const pendingStatus = pendingStatuses.get(t.id);
              if (pendingStatus) {
                return { ...t, status: { ...t.status, status: pendingStatus } };
              }
              return t;
            });

            set({ tasks: finalTasks, lastTaskPollTime: now, isOnline: true });
          } catch (err) {
            console.warn("Failed to poll task updates from ClickUp:", err);
          } finally {
            pollTasksPromise = null;
          }
        })();

        return pollTasksPromise;
      },

      createTask: async ({ name, listId, priority, dueDate, description }) => {
        const { token, teamId, user, selectedListId, availableLists, taskCreationEnabled } = get();

        if (!taskCreationEnabled) {
          throw new Error("Task creation is disabled in Settings.");
        }

        const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        let targetListId = listId || selectedListId;
        if (!targetListId && availableLists.length > 0 && availableLists[0]) {
          targetListId = availableLists[0].id;
        }
        const targetListObj = availableLists.find((l) => l.id === targetListId);

        const localTask: ClickUpTask = {
          id: localId,
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
          due_date: dueDate ? String(dueDate) : null,
          list: targetListObj
            ? { id: targetListObj.id, name: targetListObj.name }
            : { id: "local", name: "Local Tasks" },
        };

        const enqueueOfflineTask = () => {
          const pendingTask: PendingTaskEntry = {
            localId,
            name,
            listId: targetListId || undefined,
            priority,
            dueDate,
            description,
            createdAt: Date.now(),
          };
          set((state) => ({
            tasks: [localTask, ...state.tasks],
            offlineTaskQueue: [...(state.offlineTaskQueue || []), pendingTask],
          }));
          notify("Task Saved Offline", `"${name}" will sync when connection returns.`);
          return localTask;
        };

        // If offline / no token connected, save locally and enqueue
        if (!token || !teamId) {
          return enqueueOfflineTask();
        }

        set({ isCreatingTask: true });
        try {
          const client = new ClickUpClient(token);

          // Find target list
          if (!targetListId) {
            const lists = await get().fetchLists();
            if (lists.length > 0 && lists[0]) {
              targetListId = lists[0].id;
            }
          }

          if (!targetListId) {
            return enqueueOfflineTask();
          }

          const created = await client.createTask(targetListId, {
            name,
            description,
            assignees: user?.id ? [user.id] : undefined,
            priority,
            dueDate,
          });

          // Ensure task has list metadata if missing from raw response
          const fullTask: ClickUpTask = {
            ...created,
            list:
              created.list ||
              (targetListObj ? { id: targetListObj.id, name: targetListObj.name } : undefined),
          };

          set((state) => ({
            tasks: [fullTask, ...state.tasks.filter((t) => t.id !== fullTask.id)],
            selectedListId: targetListId,
            isOnline: true,
          }));

          return fullTask;
        } catch (err) {
          console.warn("Failed to create task online, saving offline:", err);
          set({ isOnline: false });
          return enqueueOfflineTask();
        } finally {
          set({ isCreatingTask: false });
        }
      },

      quickAddTask: async (name, listId, priority) => {
        return await get().createTask({ name, listId, priority });
      },

      updateTaskStatus: async (taskId, newStatus) => {
        const { token, tasks, subtasksByParent, activeTimer } = get();

        // Optimistic update
        const updated = tasks.map((t) =>
          t.id === taskId ? { ...t, status: { ...t.status, status: newStatus } } : t,
        );
        const updatedSubtasks: Record<string, ClickUpTask[]> = {};
        for (const [parentId, children] of Object.entries(subtasksByParent)) {
          updatedSubtasks[parentId] = children.map((s) =>
            s.id === taskId ? { ...s, status: { ...s.status, status: newStatus } } : s,
          );
        }
        set({ tasks: updated, subtasksByParent: updatedSubtasks });

        // If completed task is currently tracking, stop timer and log it
        const isComplete =
          newStatus.toLowerCase().includes("complete") ||
          newStatus.toLowerCase().includes("closed") ||
          newStatus.toLowerCase().includes("done");
        if (activeTimer && activeTimer.taskId === taskId && isComplete) {
          await get().stopTimer();
        }

        const enqueueOfflineStatus = () => {
          set((state) => {
            const filtered = (state.offlineStatusQueue || []).filter((s) => s.taskId !== taskId);
            return {
              offlineStatusQueue: [
                ...filtered,
                { id: `status-${Date.now()}`, taskId, status: newStatus, updatedAt: Date.now() },
              ],
            };
          });
        };

        if (token && !taskId.startsWith("demo-")) {
          if (taskId.startsWith("local-")) {
            enqueueOfflineStatus();
            return;
          }
          try {
            const client = new ClickUpClient(token);
            await client.updateTaskStatus(taskId, newStatus);
            set((state) => ({
              offlineStatusQueue: (state.offlineStatusQueue || []).filter(
                (s) => s.taskId !== taskId,
              ),
              isOnline: true,
            }));
          } catch (err) {
            console.warn("Failed to update status on ClickUp online, queuing offline:", err);
            set({ isOnline: false });
            enqueueOfflineStatus();
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
        confirmTaskCompletion: state.confirmTaskCompletion ?? true,
        notificationsEnabled: state.notificationsEnabled,
        activeTimer: state.activeTimer,
        timerHeartbeat: state.timerHeartbeat,
        recoveredTimer: state.recoveredTimer,
        pendingStopQueue: state.pendingStopQueue || [],
        todayLoggedSeconds: state.todayLoggedSeconds,
        todayDate: state.todayDate || new Date().toISOString().slice(0, 10),
        offlineTimeQueue: state.offlineTimeQueue || [],
        offlineTaskQueue: state.offlineTaskQueue || [],
        offlineStatusQueue: state.offlineStatusQueue || [],
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

          // Check for midnight rollover across app relaunch
          const todayStr = new Date().toISOString().slice(0, 10);
          if (state.todayDate && state.todayDate !== todayStr) {
            state.todayLoggedSeconds = 0;
            state.todayDate = todayStr;
          } else if (!state.todayDate) {
            state.todayDate = todayStr;
          }

          // Ensure offline queues are initialized as arrays
          if (!Array.isArray(state.offlineTimeQueue)) {
            state.offlineTimeQueue = [];
          }
          if (!Array.isArray(state.offlineTaskQueue)) {
            state.offlineTaskQueue = [];
          }
          if (!Array.isArray(state.offlineStatusQueue)) {
            state.offlineStatusQueue = [];
          }
          if (!Array.isArray(state.pendingStopQueue)) {
            state.pendingStopQueue = [];
          }
          // Legacy migration
          if ((state as any).pendingStopEntry) {
            const legacy = (state as any).pendingStopEntry;
            state.pendingStopQueue.push({
              id: `migrated-${Date.now()}`,
              entryId: legacy.entryId,
              start: legacy.start,
              durationMs: legacy.durationMs,
              taskName: legacy.taskName,
              note: legacy.note,
              createdAt: Date.now(),
            });
            delete (state as any).pendingStopEntry;
            delete (state as any).pendingStopEntryId;
          }

          if (typeof state.confirmTaskCompletion !== "boolean") {
            state.confirmTaskCompletion = true;
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
