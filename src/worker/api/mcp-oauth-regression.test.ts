import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import app from '../index';
import { createMockEnv } from '../test-helpers';

// Regression tests for the MCP OAuth flow, exercised through the real Hono app
// (src/worker/index.ts) so routing + auth middleware are covered.

function authHeader(): Record<string, string> {
  return { Authorization: 'Basic ' + btoa('testuser:testpass') };
}

function oauthServer(overrides: Record<string, any> = {}) {
  return {
    id: 'srv-1',
    name: 'Test MCP',
    url: 'https://mcp.example.com',
    enabled: 1,
    status: 'disconnected',
    oauth_enabled: 1,
    oauth_client_id: 'client-abc',
    oauth_client_secret: null,
    oauth_auth_endpoint: 'https://auth.example.com/authorize',
    oauth_token_endpoint: 'https://auth.example.com/token',
    oauth_registration_endpoint: 'https://auth.example.com/register',
    oauth_access_token: null,
    oauth_refresh_token: null,
    oauth_token_expires_at: null,
    oauth_scopes: 'read write',
    ...overrides,
  };
}

async function postJson(app: any, env: any, path: string, body: any) {
  return app.fetch(
    new Request(`http://localhost${path}`, {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    env
  );
}

describe('MCP OAuth regression', () => {
  let env: any;

  beforeEach(() => {
    env = createMockEnv();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('register returns 404 when server id does not exist', async () => {
    const res = await postJson(app, env, '/api/mcp-oauth/register', {
      serverId: 'nope',
      registrationEndpoint: 'https://auth.example.com/register',
    });
    expect(res.status).toBe(404);
    const data = await res.json() as any;
    expect(data.error).toMatch(/not found/i);
  });

  it('register registers a client and stores client_id', async () => {
    env.AI_CHAT_DB._addData('mcp_servers', oauthServer({ oauth_client_id: null }));

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ client_id: 'new-client' }), { status: 200 })
    ));

    const res = await postJson(app, env, '/api/mcp-oauth/register', {
      serverId: 'srv-1',
      registrationEndpoint: 'https://auth.example.com/register',
    });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.success).toBe(true);
    expect(data.clientId).toBe('new-client');

    const stored = env.AI_CHAT_DB._getData('mcp_servers')[0];
    expect(stored.oauth_client_id).toBe('new-client');
  });

  it('initiate builds authorization URL including scope as separate query param', async () => {
    env.AI_CHAT_DB._addData('mcp_servers', oauthServer({
      oauth_auth_endpoint: 'https://auth.example.com/authorize?audience=mcp',
    }));

    const res = await postJson(app, env, '/api/mcp-oauth/initiate', { serverId: 'srv-1' });
    expect(res.status).toBe(200);
    const data = await res.json() as any;

    const url = new URL(data.authorizationUrl);
    expect(url.origin + url.pathname).toBe('https://auth.example.com/authorize');
    expect(url.searchParams.get('scope')).toBe('read write');
    expect(url.searchParams.get('audience')).toBe('mcp');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe('client-abc');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(data.state).toBeTruthy();
  });

  it('initiate returns 404 when OAuth is not enabled', async () => {
    env.AI_CHAT_DB._addData('mcp_servers', oauthServer({ oauth_enabled: 0 }));

    const res = await postJson(app, env, '/api/mcp-oauth/initiate', { serverId: 'srv-1' });
    expect(res.status).toBe(404);
  });

  it('callback POST exchanges code for tokens, returns serverId, and stores tokens', async () => {
    const now = Date.now();
    env.AI_CHAT_DB._addData('mcp_servers', oauthServer());
    env.AI_CHAT_DB._addData('oauth_states', {
      id: 'state-1',
      server_id: 'srv-1',
      state: 'st-123',
      code_verifier: 'ver-123',
      created_at: now,
      expires_at: now + 60_000,
    });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: 'at-1',
          refresh_token: 'rt-1',
          expires_in: 3600,
          scope: 'read write',
        }),
        { status: 200 }
      )
    ));

    const res = await postJson(app, env, '/api/mcp-oauth/callback', {
      code: 'auth-code-1',
      state: 'st-123',
    });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    // Frontend OAuthCallback relies on serverId to notify the panel
    expect(data.success).toBe(true);
    expect(data.serverId).toBe('srv-1');

    const stored = env.AI_CHAT_DB._getData('mcp_servers')[0];
    expect(stored.oauth_access_token).toBe('at-1');
    expect(stored.oauth_refresh_token).toBe('rt-1');
    expect(stored.oauth_token_expires_at).toBeGreaterThanOrEqual(Math.floor(now / 1000) + 3600);
    expect(stored.oauth_token_expires_at).toBeLessThanOrEqual(Math.floor(Date.now() / 1000) + 3600);

    // State must be single-use
    expect(env.AI_CHAT_DB._getData('oauth_states')).toHaveLength(0);
  });

  it('callback POST rejects expired state', async () => {
    const now = Date.now();
    env.AI_CHAT_DB._addData('oauth_states', {
      id: 'state-2',
      server_id: 'srv-1',
      state: 'st-expired',
      code_verifier: 'ver-123',
      created_at: now - 1000,
      expires_at: now - 1,
    });

    const res = await postJson(app, env, '/api/mcp-oauth/callback', {
      code: 'c',
      state: 'st-expired',
    });
    expect(res.status).toBe(400);
  });

  it('GET callback redirects to the frontend callback route', async () => {
    // The API redirect (GET /api/mcp-oauth/callback) sends the browser to /oauth-callback.
    // This only asserts the API side redirects; the SPA route is owned by frontend tests.
    const res = await app.fetch(
      new Request('http://localhost/api/mcp-oauth/callback?code=c&state=s', {
        headers: authHeader(),
      }),
      env
    );
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toContain('/oauth-callback');
  });
});
