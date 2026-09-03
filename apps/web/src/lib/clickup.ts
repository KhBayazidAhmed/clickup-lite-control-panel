import { executeNativeClickUpRequest } from "./native";

export interface ClickUpUser {
  id: number;
  username: string;
  email: string;
  color?: string;
  profilePicture?: string;
  initials?: string;
}

export interface ClickUpTeam {
  id: string;
  name: string;
  members: Array<{ user: ClickUpUser }>;
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
    priority: "urgent" | "high" | "normal" | "low";
    color: string;
  } | null;
  due_date?: string | null;
  list?: {
    id: string;
    name: string;
  };
  project?: {
    id: string;
    name: string;
  };
  time_spent?: number;
}

export interface ClickUpTimeEntry {
  id: string;
  task?: {
    id: string;
    name: string;
    status?: {
      status: string;
      color: string;
    };
  } | null;
  wid?: string;
  user?: ClickUpUser;
  billable?: boolean;
  start: string | number;
  stop?: string | number | null;
  duration?: number | string;
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

  async getTasks(teamId: string, assigneeId?: number): Promise<ClickUpTask[]> {
    let url = `/team/${teamId}/task?subtasks=true&include_closed=false`;
    if (assigneeId) {
      url += `&assignees[]=${assigneeId}`;
    }
    const data = await this.request<{ tasks: ClickUpTask[] }>(url);
    return data.tasks || [];
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
        !taskId.startsWith("task-");
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
    try {
      const data = await this.request<{ data: ClickUpTimeEntry }>(
        `/team/${teamId}/time_entries/stop`,
        {
          method: "POST",
        },
      );
      return data?.data ?? null;
    } catch (err) {
      console.warn("ClickUp stopTimeEntry error:", err);
      return null;
    }
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
