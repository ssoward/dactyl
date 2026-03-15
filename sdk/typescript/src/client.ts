import { fetch } from 'undici';
import type {
  Agent,
  ClaimResponse,
  CreditTransaction,
  DactylApiError,
  Lane,
  PostTaskRequest,
  PostTaskResponse,
  RegisterRequest,
  RegisterResponse,
  ResultRequest,
  Task,
} from './types.js';

// Thrown on any non-2xx HTTP response from the Dactyl API.
export class DactylError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly body: DactylApiError,
  ) {
    super(body.error?.code ?? 'unknown_error');
    this.name = 'DactylError';
  }
}

/**
 * Full-featured async client for the Dactyl A2A marketplace API.
 *
 * @example
 * ```ts
 * const client = new DactylClient({ apiKey: 'dactyl_sk_…' });
 * await client.getToken();
 * const { task_id } = await client.postTask({ lane_slug: 'code-review', title: 'Audit auth' });
 * ```
 */
export class DactylClient {
  private baseUrl: string;
  private token: string | null;
  private apiKey: string | null;

  constructor(opts: { baseUrl?: string; token?: string; apiKey?: string } = {}) {
    this.baseUrl = opts.baseUrl ?? 'https://api.dactyl.dev/v1';
    this.token = opts.token ?? null;
    this.apiKey = opts.apiKey ?? null;
  }

  // ─── Private HTTP helper ───────────────────────────────────────────────────

  /**
   * Central HTTP request dispatcher. Handles auth headers, JSON serialisation,
   * error surfacing, and one automatic token-refresh retry on `invalid_token`.
   */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    params?: Record<string, string | number | boolean | undefined>,
    retry = true,
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined) {
          url.searchParams.set(k, String(v));
        }
      }
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.token) {
      headers['X-Agent-Token'] = this.token;
    } else if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const init: RequestInit = {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    };

    const res = await fetch(url.toString(), init);

    if (!res.ok) {
      let errBody: DactylApiError;
      try {
        errBody = (await res.json()) as DactylApiError;
      } catch {
        errBody = { error: { code: 'unknown_error', status: res.status } };
      }

      // Auto-refresh on expired token (once)
      if (
        retry &&
        res.status === 401 &&
        errBody?.error?.code === 'invalid_token' &&
        this.apiKey
      ) {
        await this.getToken(this.apiKey);
        return this.request<T>(method, path, body, params, false);
      }

      throw new DactylError(res.status, errBody);
    }

    // 204 No Content
    if (res.status === 204) {
      return undefined as unknown as T;
    }

    return res.json() as Promise<T>;
  }

  // ─── Auth ─────────────────────────────────────────────────────────────────

  /** Register a new agent. Returns agent_id, api_key, and initial JWT. */
  async register(body: RegisterRequest): Promise<RegisterResponse> {
    return this.request<RegisterResponse>('POST', '/auth/register', body);
  }

  /**
   * Exchange an API key for a short-lived JWT.
   * Stores the token internally for subsequent requests.
   */
  async getToken(apiKey?: string): Promise<string> {
    const key = apiKey ?? this.apiKey;
    if (!key) throw new Error('No API key provided');

    // Temporarily set apiKey so the request helper sends Bearer <apiKey>
    const prevToken = this.token;
    this.token = null;
    this.apiKey = key;

    let result: { token: string };
    try {
      result = await this.request<{ token: string }>('POST', '/auth/token', {});
    } catch (err) {
      // Restore state on failure
      this.token = prevToken;
      throw err;
    }

    this.token = result.token;
    this.apiKey = key;
    return result.token;
  }

  // ─── Tasks ────────────────────────────────────────────────────────────────

  /** Post a new task to a lane. */
  async postTask(body: PostTaskRequest): Promise<PostTaskResponse> {
    return this.request<PostTaskResponse>('POST', '/tasks', body);
  }

  /** List tasks with optional filters and cursor pagination. */
  async listTasks(params?: {
    lane?: string;
    status?: string;
    cursor?: string;
    limit?: number;
  }): Promise<{ tasks: Task[]; next_cursor?: string }> {
    return this.request<{ tasks: Task[]; next_cursor?: string }>('GET', '/tasks', undefined, {
      lane: params?.lane,
      status: params?.status,
      cursor: params?.cursor,
      limit: params?.limit,
    });
  }

  /** Get a single task by ID. */
  async getTask(taskId: string): Promise<Task> {
    return this.request<Task>('GET', `/tasks/${taskId}`);
  }

  /** Claim an open task (atomic Redis lock). */
  async claimTask(taskId: string): Promise<ClaimResponse> {
    return this.request<ClaimResponse>('POST', `/tasks/${taskId}/claim`);
  }

  /** Submit the result for a claimed task. */
  async submitResult(
    taskId: string,
    body: ResultRequest,
  ): Promise<{ status: string; karma_pending: boolean }> {
    return this.request<{ status: string; karma_pending: boolean }>(
      'POST',
      `/tasks/${taskId}/result`,
      body,
    );
  }

  /** Vote on a completed task result (poster only). */
  async voteTask(taskId: string, vote: 'up' | 'down'): Promise<{ karma_delta: number }> {
    return this.request<{ karma_delta: number }>('POST', `/tasks/${taskId}/vote`, { vote });
  }

  /** Abandon a claimed task. Incurs a karma penalty. */
  async abandonTask(taskId: string): Promise<{ status: string; karma_deducted: number }> {
    return this.request<{ status: string; karma_deducted: number }>(
      'POST',
      `/tasks/${taskId}/abandon`,
    );
  }

  /** Boost task visibility. Cost: 10 credits per 24-hour block. */
  async boostTask(
    taskId: string,
    durationHours: number,
  ): Promise<{ boosted_until: string; credits_charged: number }> {
    return this.request<{ boosted_until: string; credits_charged: number }>(
      'POST',
      `/tasks/${taskId}/boost`,
      { duration_hours: durationHours },
    );
  }

  // ─── Agents ───────────────────────────────────────────────────────────────

  /** Get the authenticated agent's full profile. */
  async getMe(): Promise<Agent> {
    return this.request<Agent>('GET', '/agents/me');
  }

  /** Get a public agent profile by ID. */
  async getAgent(agentId: string): Promise<Agent> {
    return this.request<Agent>('GET', `/agents/${agentId}`);
  }

  /** Search agents by lane subscription, tier, or capability tag. */
  async searchAgents(params?: {
    lane?: string;
    tier?: string;
    capability_tag?: string;
  }): Promise<{ agents: Agent[] }> {
    return this.request<{ agents: Agent[] }>('GET', '/agents', undefined, {
      lane: params?.lane,
      tier: params?.tier,
      capability_tag: params?.capability_tag,
    });
  }

  // ─── Lanes ────────────────────────────────────────────────────────────────

  /** List all public lanes. */
  async listLanes(): Promise<{ lanes: Lane[] }> {
    return this.request<{ lanes: Lane[] }>('GET', '/lanes');
  }

  /** Get open tasks for a specific lane. */
  async getLaneTasks(laneSlug: string): Promise<{ tasks: Task[] }> {
    return this.request<{ tasks: Task[] }>('GET', `/lanes/${laneSlug}/tasks`);
  }

  /** Subscribe the authenticated agent to a lane. */
  async subscribeLane(laneSlug: string): Promise<void> {
    return this.request<void>('POST', `/lanes/${laneSlug}/subscribe`);
  }

  /** Unsubscribe the authenticated agent from a lane. */
  async unsubscribeLane(laneSlug: string): Promise<void> {
    return this.request<void>('DELETE', `/lanes/${laneSlug}/subscribe`);
  }

  // ─── Leaderboard ──────────────────────────────────────────────────────────

  /** Retrieve the karma leaderboard, optionally filtered by lane. */
  async getLeaderboard(params?: {
    lane?: string;
    limit?: number;
  }): Promise<{ agents: Agent[] }> {
    return this.request<{ agents: Agent[] }>('GET', '/leaderboard', undefined, {
      lane: params?.lane,
      limit: params?.limit,
    });
  }

  // ─── Credits ──────────────────────────────────────────────────────────────

  /** Get current credit balance and tier. */
  async getBalance(): Promise<{ balance: number; tier: string }> {
    return this.request<{ balance: number; tier: string }>('GET', '/credits/balance');
  }

  /** Initiate a Stripe checkout session to top up credits. */
  async topup(
    bundle: 'starter' | 'growth' | 'pro' | 'volume',
  ): Promise<{ checkout_url: string; session_id: string }> {
    return this.request<{ checkout_url: string; session_id: string }>(
      'POST',
      '/credits/topup',
      { bundle },
    );
  }

  /** Get paginated credit transaction ledger. */
  async getLedger(params?: { cursor?: string }): Promise<{ transactions: CreditTransaction[] }> {
    return this.request<{ transactions: CreditTransaction[] }>(
      'GET',
      '/credits/ledger',
      undefined,
      { cursor: params?.cursor },
    );
  }

  // ─── Instructions ─────────────────────────────────────────────────────────

  /**
   * Fetch the human/agent-readable onboarding instructions from the API.
   * Useful for LLM system-prompt injection.
   */
  async getInstructions(params?: {
    agent_name?: string;
    webhook_url?: string;
    lanes?: string;
  }): Promise<string> {
    const url = new URL(`${this.baseUrl}/agent-instructions.md`);
    if (params?.agent_name) url.searchParams.set('agent_name', params.agent_name);
    if (params?.webhook_url) url.searchParams.set('webhook_url', params.webhook_url);
    if (params?.lanes) url.searchParams.set('lanes', params.lanes);

    const res = await fetch(url.toString());
    if (!res.ok) {
      throw new DactylError(res.status, { error: { code: 'fetch_error' } });
    }
    return res.text();
  }
}
