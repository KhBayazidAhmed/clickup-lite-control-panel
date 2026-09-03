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
  list?: {
    id: string;
    name: string;
  };
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
    this.token = token;
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
    const headers: Record<string, string> = {
      Authorization: this.token,
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
      const spaces = spacesData.spaces || [];
      const allLists: ClickUpList[] = [];

      await Promise.all(
        spaces.map(async (space) => {
          // 1. Folderless lists directly under space
          const folderlessPromise = this.request<{ lists: { id: string; name: string }[] }>(
            `/space/${space.id}/list?archived=false`,
          )
            .then((res) => {
              for (const l of res.lists || []) {
                allLists.push({
                  id: l.id,
                  name: l.name,
                  space: { id: space.id, name: space.name },
                });
              }
            })
            .catch((err) => {
              console.warn(`ClickUp: error fetching folderless lists for space ${space.id}:`, err);
            });

          // 2. Folders and lists inside folders
          const folderPromise = this.request<{
            folders: {
              id: string;
              name: string;
              lists?: { id: string; name: string }[];
            }[];
          }>(`/space/${space.id}/folder?archived=false`)
            .then((res) => {
              for (const folder of res.folders || []) {
                for (const l of folder.lists || []) {
                  allLists.push({
                    id: l.id,
                    name: l.name,
                    folder: { id: folder.id, name: folder.name },
                    space: { id: space.id, name: space.name },
                  });
                }
              }
            })
            .catch((err) => {
              console.warn(`ClickUp: error fetching folders for space ${space.id}:`, err);
            });

          await Promise.all([folderlessPromise, folderPromise]);
        }),
      );

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

  async getCurrentTimeEntry(teamId: string, assigneeId?: number): Promise<ClickUpTimeEntry | null> {
    try {
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
    } catch (err) {
      console.warn("ClickUp getCurrentTimeEntry error:", err);
      return null;
    }
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
    try {
      const isRealTask =
        taskId &&
        !taskId.startsWith("demo-") &&
        taskId !== "general" &&
        !taskId.startsWith("task-") &&
        !taskId.startsWith("local-");
      const body: Record<string, unknown> = {
        description: description || "",
        billable: false,
      };
      if (isRealTask) {
        body.tid = taskId;
      }

      const data = await this.request<{ data: ClickUpTimeEntry }>(
        `/team/${teamId}/time_entries/start`,
        {
          method: "POST",
          body: JSON.stringify(body),
        },
      );
      return data.data;
    } catch (err) {
      console.warn("ClickUp startTimeEntry error:", err);
      return null;
    }
  }

  async stopTimeEntry(teamId: string): Promise<ClickUpTimeEntry | null> {
    const data = await this.request<{ data: ClickUpTimeEntry }>(
      `/team/${teamId}/time_entries/stop`,
      {
        method: "POST",
      },
    );
    return data?.data ?? null;
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

    const body: Record<string, unknown> = {
      start: entry.start,
      duration: entry.duration,
      description: entry.description || "",
      billable: false,
    };
    if (isRealTask) {
      body.tid = entry.taskId;
    }

    const data = await this.request<{ data: ClickUpTimeEntry }>(`/team/${teamId}/time_entries`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    return data?.data ?? null;
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
