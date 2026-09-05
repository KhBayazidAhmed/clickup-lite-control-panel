import { executeNativeClickUpRequest } from "./native";

export interface ClickUpUser {
  id: number;
  username: string;
  email: string;
  color?: string;
  profilePicture?: string;
}

export interface ClickUpTeam {
  id: string;
  name: string;
  members: { user: ClickUpUser }[];
}

export interface ClickUpList {
  id: string;
  name: string;
  space?: {
    id: string;
    name: string;
  };
  folder?: {
    id: string;
    name: string;
  };
}

export interface ClickUpTask {
  id: string;
  name: string;
  status: {
    status: string;
    color: string;
    type: string;
    orderindex: number;
  };
  priority?: {
    priority: string;
    color: string;
  } | null;
  due_date?: string | null;
  parent?: string | null;
  top_level_parent?: string | null;
  list?: {
    id: string;
    name: string;
  };
}

export interface ClickUpTaskWithSubtasks extends ClickUpTask {
  subtasks?: ClickUpTask[];
}

export interface ClickUpTimeEntry {
  id: string;
  task?: {
    id: string;
    name: string;
  };
  wid: string;
  user: ClickUpUser;
  billable: boolean;
  start: string | number;
  stop?: string | number;
  duration: string | number;
  description?: string;
  at?: string | number;
}

const BASE_URL = "https://api.clickup.com/api/v2";

export class ClickUpClient {
  private token: string;

  constructor(token: string) {
    this.token = (token || "").trim();
  }

  private async request<T>(
    endpoint: string,
    options: {
      method?: string;
      headers?: Record<string, string>;
      body?: string;
    } = {},
  ): Promise<T> {
    const method = options.method || "GET";
    const authHeader =
      this.token.startsWith("pk_") || this.token.startsWith("Bearer ")
        ? this.token
        : `Bearer ${this.token}`;

    const headers: Record<string, string> = {
      Authorization: authHeader,
      "Content-Type": "application/json",
      ...options.headers,
    };

    const text = await executeNativeClickUpRequest(
      method,
      `${BASE_URL}${endpoint}`,
      headers,
      options.body,
    );

    return JSON.parse(text) as T;
  }

  async getCurrentUser(): Promise<ClickUpUser> {
    const data = await this.request<{ user: ClickUpUser }>("/user");
    return data.user;
  }

  async getTeams(): Promise<ClickUpTeam[]> {
    const data = await this.request<{ teams: ClickUpTeam[] }>("/team");
    return data.teams;
  }

  async getLists(teamId: string): Promise<ClickUpList[]> {
    try {
      const spacesData = await this.request<{ spaces: { id: string; name: string }[] }>(
        `/team/${teamId}/space?archived=false`,
      );

      const allLists: ClickUpList[] = [];

      for (const space of spacesData.spaces || []) {
        const folderlessListsData = await this.request<{ lists: ClickUpList[] }>(
          `/space/${space.id}/list?archived=false`,
        ).catch(() => ({ lists: [] }));

        for (const list of folderlessListsData.lists || []) {
          allLists.push({
            ...list,
            space: { id: space.id, name: space.name },
          });
        }

        const foldersData = await this.request<{
          folders: { id: string; name: string; lists: ClickUpList[] }[];
        }>(`/space/${space.id}/folder?archived=false`).catch(() => ({ folders: [] }));

        for (const folder of foldersData.folders || []) {
          for (const list of folder.lists || []) {
            allLists.push({
              ...list,
              space: { id: space.id, name: space.name },
              folder: { id: folder.id, name: folder.name },
            });
          }
        }
      }

      return allLists;
    } catch (err) {
      console.warn("ClickUp: failed to get workspace lists:", err);
      return [];
    }
  }

  async getTasks(teamId: string, assigneeId?: number): Promise<ClickUpTask[]> {
    let url = `/team/${teamId}/task?subtasks=true&include_closed=false`;
    if (assigneeId) {
      url += `&assignees[]=${assigneeId}`;
    }
    const data = await this.request<{ tasks: ClickUpTask[] }>(url);
    return data.tasks || [];
  }

  /** Single task fetch. `include_subtasks` returns every descendant (flattened,
   *  each carrying its own `parent`) alongside the task itself. */
  async getTask(taskId: string, includeSubtasks = false): Promise<ClickUpTaskWithSubtasks> {
    const query = includeSubtasks ? "?include_subtasks=true" : "";
    return await this.request<ClickUpTaskWithSubtasks>(`/task/${taskId}${query}`);
  }

  async createTask(
    listId: string,
    data: {
      name: string;
      description?: string;
      assignees?: number[];
      priority?: number;
      dueDate?: number;
    },
  ): Promise<ClickUpTask> {
    const body: Record<string, unknown> = {
      name: data.name,
    };
    if (data.description) {
      body.description = data.description;
    }
    if (data.assignees && data.assignees.length > 0) {
      body.assignees = data.assignees;
    }
    if (data.priority !== undefined) {
      body.priority = data.priority;
    }
    if (data.dueDate !== undefined) {
      body.due_date = data.dueDate;
    }

    return await this.request<ClickUpTask>(`/list/${listId}/task`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async updateTaskStatus(taskId: string, status: string): Promise<void> {
    await this.request(`/task/${taskId}`, {
      method: "PUT",
      body: JSON.stringify({ status }),
    });
  }

  /** Throws on transport/auth failure so callers can tell "nothing is running"
   *  apart from "we could not ask". Returning null for both would let a dropped
   *  request silently delete a live timer. */
  async getCurrentTimeEntry(teamId: string, assigneeId?: number): Promise<ClickUpTimeEntry | null> {
    let url = `/team/${teamId}/time_entries/current`;
    if (assigneeId) {
      url += `?assignee=${assigneeId}`;
    }
    const data = await this.request<{ data: ClickUpTimeEntry | null | ClickUpTimeEntry[] }>(url);
    if (!data || !data.data) {
      return null;
    }
    if (Array.isArray(data.data)) {
      return data.data.length > 0 ? data.data[0]! : null;
    }
    return data.data;
  }

  async getTimeEntries(
    teamId: string,
    startDate: number,
    endDate: number,
    assigneeId?: number,
  ): Promise<ClickUpTimeEntry[]> {
    try {
      let url = `/team/${teamId}/time_entries?start_date=${startDate}&end_date=${endDate}`;
      if (assigneeId) {
        url += `&assignee=${assigneeId}`;
      }
      const data = await this.request<{ data: ClickUpTimeEntry[] }>(url);
      return data?.data || [];
    } catch (err) {
      console.warn("ClickUp getTimeEntries error:", err);
      return [];
    }
  }

  async startTimeEntry(
    teamId: string,
    taskId?: string,
    description?: string,
  ): Promise<ClickUpTimeEntry | null> {
    const isRealTask =
      taskId &&
      !taskId.startsWith("demo-") &&
      taskId !== "general" &&
      !taskId.startsWith("task-") &&
      !taskId.startsWith("local-");

    const isCustomTask = Boolean(isRealTask && taskId && taskId.includes("-"));
    const query = isCustomTask ? `?custom_task_ids=true&team_id=${teamId}` : "";

    const doStart = async (customQuery = query, includeDescription = true) => {
      const body: Record<string, unknown> = {};
      if (isRealTask) {
        body.tid = taskId;
      }
      // Only include description if non-empty and allowed, preventing TIMEENTRY_064 plan limits
      const desc = description?.trim();
      if (includeDescription && desc) {
        body.description = desc;
      }

      const data = await this.request<{ data: ClickUpTimeEntry }>(
        `/team/${teamId}/time_entries/start${customQuery}`,
        {
          method: "POST",
          body: JSON.stringify(body),
        },
      );
      return data?.data ?? (data as unknown as ClickUpTimeEntry) ?? null;
    };

    // Ensure any previously running timer in ClickUp is stopped before starting a new one
    await this.stopTimeEntry(teamId).catch(() => {});

    try {
      return await doStart();
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);

      // If failed due to Advanced Time Tracking plan limit (TIMEENTRY_064), retry without description
      if (
        errMsg.includes("TIMEENTRY_064") ||
        errMsg.toLowerCase().includes("advanced time tracking")
      ) {
        try {
          return await doStart(query, false);
        } catch (planErr) {
          console.warn("ClickUp startTimeEntry retry without description error:", planErr);
        }
      }

      // If standard task ID failed with not found / inaccessible, retry with custom_task_ids
      if (
        !isCustomTask &&
        isRealTask &&
        (errMsg.includes("TASK_010") ||
          errMsg.includes("TASK_001") ||
          errMsg.toLowerCase().includes("not found"))
      ) {
        try {
          return await doStart(`?custom_task_ids=true&team_id=${teamId}`);
        } catch (customErr) {
          const customErrMsg = customErr instanceof Error ? customErr.message : String(customErr);
          if (
            customErrMsg.includes("TIMEENTRY_064") ||
            customErrMsg.toLowerCase().includes("advanced time tracking")
          ) {
            try {
              return await doStart(`?custom_task_ids=true&team_id=${teamId}`, false);
            } catch {
              // ignore
            }
          }
          console.warn("ClickUp startTimeEntry retry with custom_task_ids error:", customErr);
        }
      }

      console.warn("ClickUp startTimeEntry error:", err);
      return null;
    }
  }

  async stopTimeEntry(teamId: string): Promise<ClickUpTimeEntry | null> {
    try {
      const data = await this.request<{ data: ClickUpTimeEntry }>(
        `/team/${teamId}/time_entries/stop`,
        {
          method: "POST",
          body: "{}",
        },
      );
      return data?.data ?? (data as unknown as ClickUpTimeEntry) ?? null;
    } catch (err) {
      console.warn("ClickUp stopTimeEntry error (may not have been running):", err);
      return null;
    }
  }

  async createTimeEntry(
    teamId: string,
    entry: {
      start: number;
      duration: number; // in milliseconds
      description?: string;
      taskId?: string;
    },
  ): Promise<ClickUpTimeEntry | null> {
    const isRealTask =
      entry.taskId &&
      !entry.taskId.startsWith("demo-") &&
      entry.taskId !== "general" &&
      !entry.taskId.startsWith("task-") &&
      !entry.taskId.startsWith("local-");

    const doCreate = async (includeDescription = true) => {
      const body: Record<string, unknown> = {
        start: entry.start,
        duration: entry.duration,
      };
      if (isRealTask) {
        body.tid = entry.taskId;
      }
      const desc = entry.description?.trim();
      if (includeDescription && desc) {
        body.description = desc;
      }

      const data = await this.request<{ data: ClickUpTimeEntry }>(`/team/${teamId}/time_entries`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      return data?.data ?? (data as unknown as ClickUpTimeEntry) ?? null;
    };

    try {
      return await doCreate();
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (
        errMsg.includes("TIMEENTRY_064") ||
        errMsg.toLowerCase().includes("advanced time tracking")
      ) {
        try {
          return await doCreate(false);
        } catch (retryErr) {
          console.warn("ClickUp createTimeEntry retry without description error:", retryErr);
        }
      }
      console.warn("ClickUp createTimeEntry error:", err);
      return null;
    }
  }

  /** Rewrites an existing entry. Used to correct an entry that was left running
   *  while the app was closed, so ClickUp records the time actually tracked
   *  rather than the wall-clock gap, and to attach a note to a live entry. */
  async updateTimeEntry(
    teamId: string,
    entryId: string,
    entry: { start?: number; duration?: number; description?: string },
  ): Promise<ClickUpTimeEntry | null> {
    const doUpdate = async (includeDescription = true) => {
      const body: Record<string, unknown> = {};
      if (entry.start !== undefined) body.start = entry.start;
      if (entry.duration !== undefined) body.duration = entry.duration;
      const desc = entry.description?.trim();
      if (includeDescription && desc !== undefined && desc.length > 0) {
        body.description = desc;
      }

      const data = await this.request<{ data: ClickUpTimeEntry }>(
        `/team/${teamId}/time_entries/${entryId}`,
        {
          method: "PUT",
          body: JSON.stringify(body),
        },
      );
      return data?.data ?? (data as unknown as ClickUpTimeEntry) ?? null;
    };

    try {
      return await doUpdate();
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (
        errMsg.includes("TIMEENTRY_064") ||
        errMsg.toLowerCase().includes("advanced time tracking")
      ) {
        try {
          return await doUpdate(false);
        } catch (retryErr) {
          console.warn("ClickUp updateTimeEntry retry without description error:", retryErr);
        }
      }
      console.warn("ClickUp updateTimeEntry error:", err);
      return null;
    }
  }

  async deleteTimeEntry(teamId: string, entryId: string): Promise<void> {
    await this.request(`/team/${teamId}/time_entries/${entryId}`, {
      method: "DELETE",
    });
  }
}

export async function exchangeOAuthCode(
  clientId: string,
  clientSecret: string,
  code: string,
): Promise<string> {
  const text = await executeNativeClickUpRequest(
    "POST",
    `${BASE_URL}/oauth/token`,
    { "Content-Type": "application/json" },
    JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
    }),
  );

  const data = JSON.parse(text);
  return data.access_token;
}
