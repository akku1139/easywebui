import { beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../index';
import { createMockEnv } from '../test-helpers';

const call = (env: ReturnType<typeof createMockEnv>, body: unknown = { serverId: 's1', name: 'search', arguments: { id: 'self' } }) =>
  app.fetch(new Request('http://localhost/api/mcp-servers/call', {
    method: 'POST', headers: { Authorization: `Basic ${btoa('testuser:testpass')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }), env);

describe('POST /api/mcp-servers/call', () => {
  let env: ReturnType<typeof createMockEnv>;
  beforeEach(() => {
    env = createMockEnv();
    env.AI_CHAT_DB._addData('mcp_servers', { id: 's1', name: 'MCP', url: 'https://mcp.example.com/mcp', created_at: 1 });
    vi.mocked(fetch).mockReset();
  });
  const rpc = (id: number, result: unknown) => new Response(JSON.stringify({ jsonrpc: '2.0', id, result }),
    { headers: { 'Content-Type': 'application/json' } });

  it('executes tools/call with a fresh session and returns the text content', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(rpc(1, { protocolVersion: '2025-03-26', capabilities: { tools: {} } }))
      .mockResolvedValueOnce(new Response(null, { status: 202 }))
      .mockResolvedValueOnce(rpc(2, { content: [{ type: 'text', text: 'Notion page body' }], isError: false }));
    const response = await call(env);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ content: 'Notion page body', isError: false });
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[2][1]?.body)).params).toEqual({ name: 'search', arguments: { id: 'self' } });
  });

  it('propagates JSON-RPC tool errors and unknown tools', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(rpc(1, { protocolVersion: '2025-03-26', capabilities: { tools: {} } }))
      .mockResolvedValueOnce(new Response(null, { status: 202 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ jsonrpc: '2.0', id: 2, error: { message: 'Unknown tool' } }), { headers: { 'Content-Type': 'application/json' } }));
    const response = await call(env, { serverId: 's1', name: 'missing', arguments: {} });
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ error: 'MCP error: Unknown tool' });
  });

  it('rejects calls without a server or invalid body', async () => {
    expect((await call(env, {})).status).toBe(400);
    expect((await call(env, null)).status).toBe(400);
    expect((await call(env, { serverId: 's1', name: 'x', arguments: [] })).status).toBe(400);
    expect((await call(env, { serverId: 'nope', name: 'x', arguments: {} })).status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects disabled servers and missing/expired OAuth tokens before any request', async () => {
    const saved = env.AI_CHAT_DB._getData('mcp_servers')[0];
    saved.enabled = 0;
    expect((await call(env)).status).toBe(409);
    Object.assign(saved, { enabled: 1, oauth_enabled: 1 });
    expect((await call(env)).status).toBe(401);
    Object.assign(saved, { oauth_access_token: 'expired', oauth_token_expires_at: 1 });
    expect((await call(env)).status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns tool-level errors as paired results, not transport failures', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(rpc(1, { protocolVersion: '2025-03-26', capabilities: { tools: {} } }))
      .mockResolvedValueOnce(new Response(null, { status: 202 }))
      .mockResolvedValueOnce(rpc(2, { content: [{ type: 'text', text: 'No access to page' }], isError: true }));
    const response = await call(env);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ content: 'No access to page', isError: true });
  });
});
