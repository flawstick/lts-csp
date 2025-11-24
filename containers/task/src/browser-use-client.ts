/**
 * Browser Use Cloud API Client
 * TypeScript wrapper for Browser Use Cloud API v2
 */

const API_BASE = "https://api.browser-use.com/api/v2";

// ============================================================================
// Types
// ============================================================================

export type TaskStatus = "started" | "paused" | "finished" | "stopped";
export type SessionStatus = "active" | "stopped";
export type BrowserSessionStatus = "active" | "stopped";
export type ProxyCountryCode = "us" | "uk" | "fr" | "it" | "jp" | "au" | "de" | "fi" | "ca" | "in";
export type SupportedLLM =
  | "browser-use-llm"
  | "gpt-4.1"
  | "gpt-4.1-mini"
  | "o4-mini"
  | "o3"
  | "gemini-2.5-flash"
  | "gemini-2.5-pro"
  | "claude-sonnet-4-20250514"
  | "gpt-4o"
  | "gpt-4o-mini"
  | "claude-3-7-sonnet-20250219";

export interface TaskStep {
  number: number;
  memory: string;
  evaluationPreviousGoal: string;
  nextGoal: string;
  url: string;
  screenshotUrl?: string;
  actions: string[];
}

export interface FileView {
  id: string;
  fileName: string;
}

export interface TaskView {
  id: string;
  sessionId: string;
  llm: string;
  task: string;
  status: TaskStatus;
  startedAt: string;
  finishedAt?: string;
  metadata?: Record<string, unknown>;
  steps: TaskStep[];
  output?: string;
  outputFiles: FileView[];
  browserUseVersion?: string;
  isSuccess?: boolean;
}

export interface TaskCreatedResponse {
  id: string;
  sessionId: string;
}

export interface CreateTaskRequest {
  task: string;
  llm?: SupportedLLM;
  startUrl?: string;
  maxSteps?: number;
  structuredOutput?: string;
  sessionId?: string;
  metadata?: Record<string, string>;
  secrets?: Record<string, string>;
  allowedDomains?: string[];
  highlightElements?: boolean;
  flashMode?: boolean;
  thinking?: boolean;
  vision?: boolean | "auto";
  systemPromptExtension?: string;
}

export interface SessionView {
  id: string;
  status: SessionStatus;
  liveUrl?: string;
  startedAt: string;
  finishedAt?: string;
  tasks: TaskItemView[];
  publicShareUrl?: string;
}

export interface SessionItemView {
  id: string;
  status: SessionStatus;
  liveUrl?: string;
  startedAt: string;
  finishedAt?: string;
}

export interface TaskItemView {
  id: string;
  sessionId: string;
  llm: string;
  task: string;
  status: TaskStatus;
  startedAt: string;
  finishedAt?: string;
  metadata?: Record<string, unknown>;
  output?: string;
  browserUseVersion?: string;
  isSuccess?: boolean;
}

export interface CreateSessionRequest {
  profileId?: string;
  proxyCountryCode?: ProxyCountryCode;
  startUrl?: string;
}

export interface ProfileView {
  id: string;
  name?: string;
  lastUsedAt?: string;
  createdAt: string;
  updatedAt: string;
  cookieDomains?: string[];
}

export interface BrowserSessionView {
  id: string;
  status: BrowserSessionStatus;
  liveUrl?: string;
  cdpUrl?: string;
  timeoutAt: string;
  startedAt: string;
  finishedAt?: string;
}

export interface CreateBrowserSessionRequest {
  profileId?: string;
  proxyCountryCode?: ProxyCountryCode;
  timeout?: number; // in seconds
}

export interface UploadFileRequest {
  fileName: string;
  contentType: string;
  sizeBytes: number;
}

export interface UploadFilePresignedUrlResponse {
  url: string;
  method: "POST";
  fields: Record<string, string>;
  fileName: string;
  expiresIn: number;
}

// ============================================================================
// Client Class
// ============================================================================

export class BrowserUseClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async request<T>(
    method: "GET" | "POST" | "PATCH" | "DELETE",
    path: string,
    body?: unknown,
    retries = 3
  ): Promise<T> {
    const url = `${API_BASE}${path}`;
    const headers: Record<string, string> = {
      "X-Browser-Use-API-Key": this.apiKey,
    };

    if (body) {
      headers["Content-Type"] = "application/json";
    }

    for (let attempt = 1; attempt <= retries; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120000); // 2 minute timeout

      try {
        const response = await fetch(url, {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!response.ok) {
          const errorText = await response.text();
          // Retry on 5xx errors
          if (response.status >= 500 && attempt < retries) {
            console.log(`[BrowserUseClient] ${response.status} error, retrying (${attempt}/${retries})...`);
            await new Promise(r => setTimeout(r, 2000 * attempt));
            continue;
          }
          throw new Error(`Browser Use API error ${response.status}: ${errorText}`);
        }

        // Handle 204 No Content
        if (response.status === 204) {
          return {} as T;
        }

        return response.json();
      } catch (err) {
        clearTimeout(timeout);
        if (err instanceof Error && err.name === 'AbortError') {
          if (attempt < retries) {
            console.log(`[BrowserUseClient] Request timeout, retrying (${attempt}/${retries})...`);
            continue;
          }
          throw new Error(`Browser Use API timeout after ${retries} attempts`);
        }
        throw err;
      }
    }
    throw new Error(`Browser Use API failed after ${retries} attempts`);
  }

  // ============================================================================
  // Tasks
  // ============================================================================

  async createTask(request: CreateTaskRequest): Promise<TaskCreatedResponse> {
    return this.request<TaskCreatedResponse>("POST", "/tasks", request);
  }

  async getTask(taskId: string): Promise<TaskView> {
    return this.request<TaskView>("GET", `/tasks/${taskId}`);
  }

  async updateTask(
    taskId: string,
    action: "stop" | "pause" | "resume" | "stop_task_and_session"
  ): Promise<TaskView> {
    return this.request<TaskView>("PATCH", `/tasks/${taskId}`, { action });
  }

  async getTaskLogs(taskId: string): Promise<{ downloadUrl: string }> {
    return this.request<{ downloadUrl: string }>("GET", `/tasks/${taskId}/logs`);
  }

  // ============================================================================
  // Sessions
  // ============================================================================

  async createSession(request?: CreateSessionRequest): Promise<SessionItemView> {
    return this.request<SessionItemView>("POST", "/sessions", request || {});
  }

  async getSession(sessionId: string): Promise<SessionView> {
    return this.request<SessionView>("GET", `/sessions/${sessionId}`);
  }

  async stopSession(sessionId: string): Promise<SessionView> {
    return this.request<SessionView>("PATCH", `/sessions/${sessionId}`, {
      action: "stop",
    });
  }

  async createPublicShare(sessionId: string): Promise<{ shareToken: string; shareUrl: string; viewCount: number }> {
    return this.request("POST", `/sessions/${sessionId}/public-share`);
  }

  // ============================================================================
  // Browser Sessions (standalone browsers without agents)
  // ============================================================================

  async createBrowserSession(request?: CreateBrowserSessionRequest): Promise<BrowserSessionView> {
    return this.request<BrowserSessionView>("POST", "/browsers", request || {});
  }

  async getBrowserSession(sessionId: string): Promise<BrowserSessionView> {
    return this.request<BrowserSessionView>("GET", `/browsers/${sessionId}`);
  }

  async stopBrowserSession(sessionId: string): Promise<BrowserSessionView> {
    return this.request<BrowserSessionView>("PATCH", `/browsers/${sessionId}`, {
      action: "stop",
    });
  }

  // ============================================================================
  // Profiles
  // ============================================================================

  async listProfiles(): Promise<{ items: ProfileView[]; totalItems: number }> {
    return this.request("GET", "/profiles");
  }

  async createProfile(name?: string): Promise<ProfileView> {
    return this.request<ProfileView>("POST", "/profiles", { name });
  }

  async getProfile(profileId: string): Promise<ProfileView> {
    return this.request<ProfileView>("GET", `/profiles/${profileId}`);
  }

  async deleteProfile(profileId: string): Promise<void> {
    await this.request<void>("DELETE", `/profiles/${profileId}`);
  }

  // ============================================================================
  // Files
  // ============================================================================

  async getUploadUrl(
    sessionId: string,
    request: UploadFileRequest
  ): Promise<UploadFilePresignedUrlResponse> {
    return this.request<UploadFilePresignedUrlResponse>(
      "POST",
      `/files/sessions/${sessionId}/presigned-url`,
      request
    );
  }

  async uploadFile(
    sessionId: string,
    file: { name: string; type: string; buffer: Buffer }
  ): Promise<string> {
    // Get presigned URL
    const presigned = await this.getUploadUrl(sessionId, {
      fileName: file.name,
      contentType: file.type,
      sizeBytes: file.buffer.length,
    });

    // Upload file using presigned URL
    const formData = new FormData();
    for (const [key, value] of Object.entries(presigned.fields)) {
      formData.append(key, value);
    }
    formData.append("file", new Blob([file.buffer], { type: file.type }), file.name);

    const uploadResponse = await fetch(presigned.url, {
      method: presigned.method,
      body: formData,
    });

    if (!uploadResponse.ok) {
      throw new Error(`File upload failed: ${uploadResponse.statusText}`);
    }

    return presigned.fileName;
  }

  async getTaskOutputFile(
    taskId: string,
    fileId: string
  ): Promise<{ id: string; fileName: string; downloadUrl: string }> {
    return this.request("GET", `/files/tasks/${taskId}/output-files/${fileId}`);
  }

  // ============================================================================
  // Billing
  // ============================================================================

  async getAccountBilling(): Promise<{
    monthlyCreditsBalanceUsd: number;
    additionalCreditsBalanceUsd: number;
    totalCreditsBalanceUsd: number;
    rateLimit: number;
  }> {
    return this.request("GET", "/billing/account");
  }
}
