import { beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../index';
import { createMockEnv } from '../test-helpers';

describe('MCP creation → OAuth registration (routed API)', () => {
  let env: ReturnType<typeof createMockEnv>;
  const headers = {
    Authorization: `Basic ${btoa('testuser:testpass')}`,
    'Content-Type': 'application/json',
  };
  const post = (path: string, body: unknown) => app.fetch(new Request(`http://localhost${path}`, {
    method: 'POST', headers, body: JSON.stringify(body),
  }), env);

  beforeEach(() => {
    env = createMockEnv();
    vi.mocked(fetch).mockReset();
  });

  it('returns the persisted id, not the provisional browser id', async () => {
    const response = await post('/api/mcp-servers', {
      id: 'browser-provisional-id', name: 'MCP', url: 'https://mcp.example.com',
    });
    expect(response.status).toBe(200);
    const created = await response.json() as { id: string };
    expect(created.id).not.toBe('browser-provisional-id');
    expect(created.id).toBe(env.AI_CHAT_DB._getData('mcp_servers')[0].id);
  });

  it('registers the newly created server using exactly the id returned to the browser', async () => {
    const response = await post('/api/mcp-servers', {
      id: 'browser-provisional-id', name: 'MCP', url: 'https://mcp.example.com',
      oauthEnabled: true, oauthRegistrationEndpoint: 'https://auth.example.com/register',
    });
    const created = await response.json() as { id: string };
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ client_id: 'registered-client' }), { status: 201 }));
    const registered = await post('/api/mcp-oauth/register', {
      serverId: created.id, registrationEndpoint: 'https://auth.example.com/register',
    });
    expect(registered.status).toBe(200);
    expect(await registered.json()).toEqual({ success: true, clientId: 'registered-client' });
    expect(env.AI_CHAT_DB._getData('mcp_servers')[0].oauth_client_id).toBe('registered-client');
  });

  it('still reports a missing server even when another server exists', async () => {
    await post('/api/mcp-servers', { name: 'Other', url: 'https://other.example.com' });
    const registered = await post('/api/mcp-oauth/register', {
      serverId: 'not-persisted', registrationEndpoint: 'https://auth.example.com/register',
    });
    expect(registered.status).toBe(404);
    expect(await registered.json()).toEqual({ error: 'Server not found' });
    expect(fetch).not.toHaveBeenCalled();
  });
});
