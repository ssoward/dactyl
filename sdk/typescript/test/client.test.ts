import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DactylClient, DactylError } from '../src/client.js';
import { verifyDactylWebhook } from '../src/webhook.js';

// ─── Mock undici fetch ─────────────────────────────────────────────────────

vi.mock('undici', () => ({
  fetch: vi.fn(),
}));

import { fetch } from 'undici';
const mockFetch = vi.mocked(fetch);

/** Build a minimal Response-like object for the mock. */
function mockResponse(
  body: unknown,
  status = 200,
): ReturnType<typeof fetch> {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
  }) as ReturnType<typeof fetch>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function captureUrl(): string {
  const call = mockFetch.mock.calls[0];
  return call ? String(call[0]) : '';
}

function captureBody(): unknown {
  const call = mockFetch.mock.calls[0];
  const init = call?.[1] as RequestInit | undefined;
  return init?.body ? JSON.parse(String(init.body)) : undefined;
}

function captureMethod(): string {
  const call = mockFetch.mock.calls[0];
  const init = call?.[1] as RequestInit | undefined;
  return (init?.method ?? 'GET').toUpperCase();
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('DactylClient', () => {
  let client: DactylClient;

  beforeEach(() => {
    client = new DactylClient({
      baseUrl: 'https://api.dactyl.dev/v1',
      token: 'test-token',
    });
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── Auth ────────────────────────────────────────────────────────────────

  it('register() sends POST /auth/register and returns agent_id', async () => {
    const responseBody = {
      agent_id: 'agt_123',
      api_key: 'dactyl_sk_abc',
      token: 'jwt-token',
      onboarding_complete: true,
    };
    mockFetch.mockReturnValueOnce(mockResponse(responseBody, 201));

    const result = await client.register({
      display_name: 'TestBot',
      description: 'A test agent',
    });

    expect(captureMethod()).toBe('POST');
    expect(captureUrl()).toContain('/auth/register');
    expect(captureBody()).toMatchObject({ display_name: 'TestBot' });
    expect(result.agent_id).toBe('agt_123');
    expect(result.api_key).toBe('dactyl_sk_abc');
  });

  it('getToken() sends POST /auth/token with Bearer api_key header', async () => {
    const c = new DactylClient({
      baseUrl: 'https://api.dactyl.dev/v1',
      apiKey: 'dactyl_sk_mykey',
    });
    mockFetch.mockReturnValueOnce(mockResponse({ token: 'new-jwt', expires_in: 3600 }));

    const token = await c.getToken();

    expect(captureMethod()).toBe('POST');
    expect(captureUrl()).toContain('/auth/token');

    // Verify Authorization header was set to the api key
    const call = mockFetch.mock.calls[0];
    const headers = (call?.[1] as RequestInit)?.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer dactyl_sk_mykey');
    expect(token).toBe('new-jwt');
  });

  // ─── Tasks ───────────────────────────────────────────────────────────────

  it('postTask() sends POST /tasks with correct body', async () => {
    mockFetch.mockReturnValueOnce(
      mockResponse(
        { task_id: 'tsk_abc', status: 'open', credits_charged: 0, created_at: '2026-01-01' },
        201,
      ),
    );

    const result = await client.postTask({
      lane_slug: 'code-review',
      title: 'Review auth module',
      description: 'Check for timing issues',
    });

    expect(captureMethod()).toBe('POST');
    expect(captureUrl()).toContain('/tasks');
    expect(captureBody()).toMatchObject({ lane_slug: 'code-review', title: 'Review auth module' });
    expect(result.task_id).toBe('tsk_abc');
  });

  it('listTasks() with filters builds correct query string', async () => {
    mockFetch.mockReturnValueOnce(mockResponse({ tasks: [], next_cursor: null }));

    await client.listTasks({ lane: 'code-review', status: 'open', limit: 10 });

    const url = captureUrl();
    expect(url).toContain('lane=code-review');
    expect(url).toContain('status=open');
    expect(url).toContain('limit=10');
  });

  it('claimTask() sends POST /tasks/:id/claim', async () => {
    mockFetch.mockReturnValueOnce(
      mockResponse({ status: 'claimed', claim_expires_at: '2026-01-01T15:00:00Z' }),
    );

    const result = await client.claimTask('tsk_xyz');

    expect(captureMethod()).toBe('POST');
    expect(captureUrl()).toContain('/tasks/tsk_xyz/claim');
    expect(result.status).toBe('claimed');
  });

  it('submitResult() sends POST /tasks/:id/result', async () => {
    mockFetch.mockReturnValueOnce(
      mockResponse({ status: 'completed', karma_pending: true }),
    );

    const result = await client.submitResult('tsk_xyz', {
      result_payload: { verdict: 'pass' },
    });

    expect(captureMethod()).toBe('POST');
    expect(captureUrl()).toContain('/tasks/tsk_xyz/result');
    expect(captureBody()).toMatchObject({ result_payload: { verdict: 'pass' } });
    expect(result.status).toBe('completed');
    expect(result.karma_pending).toBe(true);
  });

  it('voteTask() sends correct body { vote: "up" }', async () => {
    mockFetch.mockReturnValueOnce(mockResponse({ karma_delta: 10 }));

    const result = await client.voteTask('tsk_xyz', 'up');

    expect(captureMethod()).toBe('POST');
    expect(captureUrl()).toContain('/tasks/tsk_xyz/vote');
    expect(captureBody()).toEqual({ vote: 'up' });
    expect(result.karma_delta).toBe(10);
  });

  // ─── Agents ──────────────────────────────────────────────────────────────

  it('getMe() sends GET /agents/me', async () => {
    const agentBody = {
      id: 'agt_me',
      display_name: 'Me',
      description: '',
      capability_tags: [],
      webhook_url: null,
      karma: 100,
      tier: 'reliable',
      credits: 50,
      tasks_completed: 5,
      tasks_failed: 0,
      tasks_abandoned: 0,
      rate_limit_tier: 'free',
      registered_at: '2026-01-01',
      last_active_at: '2026-01-02',
    };
    mockFetch.mockReturnValueOnce(mockResponse(agentBody));

    const agent = await client.getMe();

    expect(captureMethod()).toBe('GET');
    expect(captureUrl()).toContain('/agents/me');
    expect(agent.id).toBe('agt_me');
  });

  // ─── Error handling ───────────────────────────────────────────────────────

  it('non-2xx response throws DactylError with code', async () => {
    mockFetch.mockReturnValueOnce(
      mockResponse({ error: { code: 'task_not_found', task_id: 'tsk_missing' } }, 404),
    );

    await expect(client.getTask('tsk_missing')).rejects.toThrow(DactylError);
  });

  it('DactylError has statusCode and body', async () => {
    mockFetch.mockReturnValueOnce(
      mockResponse({ error: { code: 'insufficient_karma', required: 50 } }, 402),
    );

    let caught: DactylError | null = null;
    try {
      await client.claimTask('tsk_guarded');
    } catch (err) {
      caught = err as DactylError;
    }

    expect(caught).not.toBeNull();
    expect(caught?.statusCode).toBe(402);
    expect(caught?.body.error.code).toBe('insufficient_karma');
  });
});

// ─── Webhook verification (delegated to webhook.test.ts but also spot-checked here) ──

describe('verifyDactylWebhook (quick check)', () => {
  it('returns true for a valid HMAC signature', () => {
    const { createHmac } = require('crypto') as typeof import('crypto');
    const secret = 'mysecret';
    const body = '{"event":"task.claimed"}';
    const sig = createHmac('sha256', secret).update(Buffer.from(body)).digest('hex');

    expect(verifyDactylWebhook(secret, body, sig)).toBe(true);
  });

  it('returns false for a tampered body', () => {
    const { createHmac } = require('crypto') as typeof import('crypto');
    const secret = 'mysecret';
    const body = '{"event":"task.claimed"}';
    const sig = createHmac('sha256', secret).update(Buffer.from(body)).digest('hex');

    expect(verifyDactylWebhook(secret, 'tampered', sig)).toBe(false);
  });
});
