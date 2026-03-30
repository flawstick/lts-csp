import {
  BrowserUse,
  type FileInfo,
  type FileListResponse,
  type MessageListResponse,
  type ProxyCountryCode,
  type SessionResponse,
  type StopStrategy,
  type WorkspaceView,
} from "browser-use-sdk/v3";

export type BrowserUseModel = "bu-mini" | "bu-max";
export type BrowserUseSessionStatus =
  | "created"
  | "idle"
  | "running"
  | "stopped"
  | "timed_out"
  | "error";

export class BrowserUseClient {
  private readonly client: BrowserUse;

  constructor(apiKey: string) {
    this.client = new BrowserUse({ apiKey });
  }

  async createSession(request?: {
    proxyCountryCode?: ProxyCountryCode;
  }): Promise<SessionResponse> {
    return this.client.sessions.create(request ?? {});
  }

  async getSession(sessionId: string): Promise<SessionResponse> {
    return this.client.sessions.get(sessionId);
  }

  async stopSession(
    sessionId: string,
    strategy: StopStrategy = "session",
  ): Promise<SessionResponse> {
    return this.client.sessions.stop(sessionId, { strategy });
  }

  async getSessionFiles(sessionId: string): Promise<FileListResponse> {
    return this.client.sessions.files(sessionId, {
      limit: 100,
      includeUrls: true,
    });
  }

  async getMessages(
    sessionId: string,
    after?: string | null,
  ): Promise<MessageListResponse> {
    return this.client.sessions.messages(sessionId, {
      after,
      limit: 100,
    });
  }

  async runTask(
    task: string,
    request: {
      sessionId: string;
      model?: BrowserUseModel;
      timeoutMs?: number;
      proxyCountryCode?: ProxyCountryCode;
      workspaceId?: string;
    },
  ): Promise<SessionResponse> {
    // Call sessions.create directly with snake_case field names.
    // The SDK's client.run() passes camelCase which the API ignores,
    // causing it to create a new session instead of dispatching to
    // the existing one.
    return this.client.sessions.create({
      task,
      session_id: request.sessionId,
      keep_alive: true,
      model: request.model ?? "bu-max",
      proxy_country_code: request.proxyCountryCode,
      workspace_id: request.workspaceId,
    } as any);
  }

  async createWorkspace(name?: string): Promise<WorkspaceView> {
    return this.client.workspaces.create(name ? { name } : {});
  }

  async getWorkspaceFiles(workspaceId: string): Promise<FileListResponse> {
    return this.client.workspaces.files(workspaceId, {
      limit: 100,
      includeUrls: true,
    });
  }

  async getAllSessionFiles(sessionId: string): Promise<FileInfo[]> {
    const files: FileInfo[] = [];
    let cursor: string | null | undefined = null;

    do {
      const response = await this.client.sessions.files(sessionId, {
        limit: 100,
        includeUrls: true,
        cursor,
      });
      files.push(...response.files);
      cursor = response.nextCursor;
    } while (cursor);

    return files;
  }

  async getAllWorkspaceFiles(workspaceId: string): Promise<FileInfo[]> {
    const files: FileInfo[] = [];
    let cursor: string | null | undefined = null;

    do {
      const response = await this.client.workspaces.files(workspaceId, {
        limit: 100,
        includeUrls: true,
        cursor,
      });
      files.push(...response.files);
      cursor = response.nextCursor;
    } while (cursor);

    return files;
  }

  async uploadFileToWorkspace(
    workspaceId: string,
    file: { name: string; type: string; buffer: Buffer },
  ): Promise<{ name: string; path: string }> {
    const upload = await this.client.workspaces.uploadFiles(workspaceId, {
      files: [
        {
          name: file.name,
          contentType: file.type,
          size: file.buffer.length,
        },
      ],
    });

    const uploadedFile = upload.files[0];
    if (!uploadedFile) {
      throw new Error("Browser Use did not return an upload target");
    }

    const response = await fetch(uploadedFile.uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": file.type,
      },
      body: new Uint8Array(file.buffer),
    });

    if (!response.ok) {
      throw new Error(
        `Browser Use file upload failed: ${response.status} ${response.statusText}`,
      );
    }

    return {
      name: uploadedFile.name,
      path: uploadedFile.path,
    };
  }

  async deleteWorkspace(workspaceId: string): Promise<void> {
    await this.client.workspaces.delete(workspaceId);
  }
}
