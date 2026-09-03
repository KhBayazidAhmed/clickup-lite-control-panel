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
  };
  wid: string;
  user: ClickUpUser;
  billable: boolean;
  start: string;
  stop?: string;
  duration: number;
  description?: string;
}

const BASE_URL = "https://api.clickup.com/api/v2";

export class ClickUpClient {
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers = {
      Authorization: this.token,
      "Content-Type": "application/json",
      ...options.headers,
    };

    const res = await fetch(`${BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });

    if (!res.ok) {
      const errData = await res.text();
      throw new Error(`ClickUp API Error (${res.status}): ${errData}`);
    }

    return res.json() as Promise<T>;
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
    return data.tasks;
  }

  async updateTaskStatus(taskId: string, status: string): Promise<void> {
    await this.request(`/task/${taskId}`, {
      method: "PUT",
      body: JSON.stringify({ status }),
    });
  }

  async getCurrentTimeEntry(teamId: string): Promise<ClickUpTimeEntry | null> {
    const data = await this.request<{ data: ClickUpTimeEntry | null }>(
      `/team/${teamId}/time_entries/current`,
    );
    return data.data;
  }

  async startTimeEntry(
    teamId: string,
    taskId: string,
    description?: string,
  ): Promise<ClickUpTimeEntry> {
    const data = await this.request<{ data: ClickUpTimeEntry }>(
      `/team/${teamId}/time_entries/start`,
      {
        method: "POST",
        body: JSON.stringify({
          tid: taskId,
          description: description || "",
          billable: false,
        }),
      },
    );
    return data.data;
  }

  async stopTimeEntry(teamId: string): Promise<ClickUpTimeEntry> {
    const data = await this.request<{ data: ClickUpTimeEntry }>(
      `/team/${teamId}/time_entries/stop`,
      {
        method: "POST",
      },
    );
    return data.data;
  }
}

export async function exchangeOAuthCode(
  clientId: string,
  clientSecret: string,
  code: string,
): Promise<string> {
  const res = await fetch(`${BASE_URL}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to exchange OAuth token: ${text}`);
  }

  const data = await res.json();
  return data.access_token;
}
