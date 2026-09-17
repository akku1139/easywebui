import { beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../index';
import { createMockEnv } from '../test-helpers';

const tool = { name: 'search', description: 'Search documents', inputSchema: { type: 'object', properties: {} } };
const rpc = (id: number, result: unknown, headers = {}) => new Response(JSON.stringify({ jsonrpc: '2.0', id, result }), {
  headers: { 'Content-Type': 'application/json', ...headers },
});

describe('POST /api/mcp-servers/connect', () => {
  let env: ReturnType<typeof createMockEnv>;
  const connect = () => app.fetch(new Request('http://localhost/api/mcp-servers/connect', {
    method: 'POST', headers: { Authorization: `Basic ${btoa('testuser:testpass')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ serverId: 's1' }),
  }), env);
  beforeEach(() => {
    env = createMockEnv();
    env.AI_CHAT_DB._addData('mcp_servers', { id: 's1', name: 'MCP', url: 'https://mcp.example.com/mcp', created_at: 1 });
    vi.mocked(fetch).mockReset();
  });

  it('initializes a session, notifies initialized, paginates tools and persists the actual list', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(rpc(1, { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'Test', version: '1' } }, { 'Mcp-Session-Id': 'session' }))
      .mockResolvedValueOnce(new Response(null, { status: 202 }))
      .mockResolvedValueOnce(rpc(2, { tools: [tool], nextCursor: 'page2' }))
      .mockResolvedValueOnce(rpc(3, { tools: [{ ...tool, name: 'read' }] }));
    const response = await connect();
    expect(response.status).toBe(200);
    const data = await response.json() as any;
    expect(data.status).toBe('connected');
    expect(data.tools.map((t: any) => t.name)).toEqual(['search', 'read']);
    expect(data.tools[0].serverId).toBe('s1');
    const calls = vi.mocked(fetch).mock.calls;
    expect(calls.map(([, init]) => JSON.parse(String(init?.body)).method)).toEqual(['initialize', 'notifications/initialized', 'tools/list', 'tools/list']);
    expect(JSON.parse(String(calls[3][1]?.body)).params).toEqual({ cursor: 'page2' });
    expect(new Headers(calls[2][1]?.headers).get('Mcp-Session-Id')).toBe('session');
    expect(new Headers(calls[2][1]?.headers).get('MCP-Protocol-Version')).toBe('2025-03-26');
    const stored = env.AI_CHAT_DB._getData('mcp_servers')[0];
    expect(JSON.parse(stored.tools_json)).toHaveLength(2);
    expect(stored.status).toBe('connected');
    expect(stored.last_checked).toBeGreaterThan(0);
  });

  it('uses the server-side OAuth token without returning it to the browser', async () => {
    Object.assign(env.AI_CHAT_DB._getData('mcp_servers')[0], { oauth_enabled: 1, oauth_access_token: 'stored-token' });
    vi.mocked(fetch)
      .mockResolvedValueOnce(rpc(1, { protocolVersion: '2025-03-26', capabilities: { tools: {} } }))
      .mockResolvedValueOnce(new Response(null, { status: 202 }))
      .mockResolvedValueOnce(rpc(2, { tools: [tool] }));
    const response = await connect();
    expect(response.status).toBe(200);
    expect(new Headers(vi.mocked(fetch).mock.calls[0][1]?.headers).get('Authorization')).toBe('Bearer stored-token');
    expect(await response.text()).not.toContain('stored-token');
  });

  it('reads an SSE tools response and distinguishes a legitimate empty list', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(rpc(1, { protocolVersion: '2025-03-26', capabilities: { tools: {} } }))
      .mockResolvedValueOnce(new Response(null, { status: 202 }))
      .mockResolvedValueOnce(new Response(': keepalive\n\nevent: message\ndata: {"jsonrpc":"2.0","method":"notifications/progress"}\n\nevent: message\ndata: {"jsonrpc":"2.0","id":2,"result":{"tools":[]}}\n\n', { headers: { 'Content-Type': 'text/event-stream' } }));
    const response = await connect();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'connected', tools: [] });
  });

  it('reports a redirecting MCP endpoint instead of following or crashing', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 302, headers: { Location: 'https://sso.example.com/login' } }));
    const response = await connect();
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining('redirected') });
  });

  it('reports upstream failures instead of claiming connected with zero tools', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('Unavailable', { status: 503 }));
    const response = await connect();
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining('503') });
    expect(env.AI_CHAT_DB._getData('mcp_servers')[0].status).toBe('error');
  });

  it('surfaces the underlying network failure instead of a generic message', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError('fetch failed'));
    const response = await connect();
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining('fetch failed') });
  });

  it('explains a 405 as a Streamable HTTP transport mismatch', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('Method Not Allowed', { status: 405 }));
    const response = await connect();
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining('Streamable HTTP') });
  });

  it('includes the upstream error body for HTTP failures', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('{"detail":"bad path"}', { status: 404 }));
    const response = await connect();
    expect(await response.json()).toMatchObject({ error: expect.stringContaining('bad path') });
  });

  it('reports invalid JSON bodies instead of failing opaquely', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response('<html>not json</html>', { headers: { 'Content-Type': 'application/json' } }));
    const response = await connect();
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining('invalid JSON') });
  });

  it('reports authentication required when the stored OAuth token is missing', async () => {
    env.AI_CHAT_DB._getData('mcp_servers')[0].oauth_enabled = 1;
    const response = await connect();
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ authRequired: true });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not mistake a JSON-RPC error for an empty tool list', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(rpc(1, { protocolVersion: '2025-03-26', capabilities: { tools: {} } }))
      .mockResolvedValueOnce(new Response(null, { status: 202 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ jsonrpc: '2.0', id: 2, error: { code: -32603, message: 'Tool registry unavailable' } }), { headers: { 'Content-Type': 'application/json' } }));
    const response = await connect();
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ error: 'MCP error: Tool registry unavailable' });
    expect(env.AI_CHAT_DB._getData('mcp_servers')[0].status).toBe('error');
  });

  it('does not fetch anything when the saved server does not exist', async () => {
    env.AI_CHAT_DB._clear();
    expect((await connect()).status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });
});
