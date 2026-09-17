import type { Context } from 'hono';
import type { Env } from '../index';
import type { MCPTool } from '../../types';

class MCPError extends Error {
  constructor(message: string, readonly authRequired = false) { super(message); }
}

type RPC = { jsonrpc?: string; id?: number; result?: any; error?: { message?: string } };

// Streamable HTTP may reply with JSON or a long-lived SSE stream. Stop when
// the matching result arrives rather than awaiting the end of the SSE stream.
async function readResult(response: Response, id: number): Promise<any> {
  const type = response.headers.get('content-type') || '';
  const reader = response.body?.getReader();
  if (!reader) throw new MCPError('MCP server returned an empty response');
  const decoder = new TextDecoder();
  let text = '';
  let size = 0;
  const result = (rpc: RPC) => {
    if (rpc.jsonrpc !== '2.0' || rpc.id !== id) throw new MCPError('Invalid MCP response');
    if (rpc.error) throw new MCPError(`MCP error: ${rpc.error.message || 'Request failed'}`);
    if (!rpc.result || typeof rpc.result !== 'object') throw new MCPError('MCP result is missing');
    return rpc.result;
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (value) {
        size += value.byteLength;
        if (size > 2_000_000) throw new MCPError('MCP response is too large');
      }
      text += decoder.decode(value, { stream: !done });
      if (type.includes('text/event-stream')) {
        // Normalize CRLF after decoding, including CRLF split across chunks.
        text = text.replace(/\r\n/g, '\n');
        let end: number;
        while ((end = text.indexOf('\n\n')) !== -1 || (done && text.length > 0)) {
          if (end === -1) end = text.length;
          const event = text.slice(0, end);
          text = text.slice(end + 2);
          const data = event.split('\n').filter(line => line.startsWith('data:'))
            .map(line => line.slice(5).replace(/^ /, '')).join('\n');
          if (!data) continue;
          const rpc = JSON.parse(data) as RPC;
          if (rpc.id === id) return result(rpc);
        }
      } else if (done) {
        if (!type.includes('application/json')) throw new MCPError('MCP endpoint must support Streamable HTTP (JSON or SSE replies)');
        return result(JSON.parse(text));
      }
      if (done) throw new MCPError('MCP stream ended without a matching response');
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export async function handleMCPConnect(c: Context<{ Bindings: Env }>) {
  let serverId: string;
  try {
    const body = await c.req.json();
    if (typeof body.serverId !== 'string' || !body.serverId) throw new Error();
    serverId = body.serverId;
  } catch { return c.json({ error: 'Missing server ID' }, 400); }
  const db = c.env.AI_CHAT_DB;
  const server = await db.prepare('SELECT * FROM mcp_servers WHERE id = ?').bind(serverId).first() as any;
  if (!server) return c.json({ error: 'Server not found' }, 404);
  const checkedAt = () => Math.floor(Date.now() / 1000);
  const fail = async (error: MCPError) => {
    await db.prepare('UPDATE mcp_servers SET status = ?, last_checked = ? WHERE id = ?')
      .bind(error.authRequired ? 'authenticating' : 'error', checkedAt(), serverId).run();
    return c.json({ error: error.message, authRequired: error.authRequired }, error.authRequired ? 401 : 502);
  };
  if (server.oauth_enabled && (!server.oauth_access_token ||
    (server.oauth_token_expires_at && server.oauth_token_expires_at * 1000 <= Date.now()))) {
    return fail(new MCPError('MCP authentication required', true));
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const url = new URL(server.url);
    if (!['http:', 'https:'].includes(url.protocol)) throw new MCPError('Invalid MCP HTTP URL');
    let sessionId: string | null = null;
    let version: string | null = null;
    let id = 0;
    const request = async (method: string, params?: unknown, notification = false) => {
      const requestId = notification ? undefined : ++id;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json', Accept: 'application/json, text/event-stream',
      };
      if (sessionId) headers['Mcp-Session-Id'] = sessionId;
      if (version) headers['MCP-Protocol-Version'] = version;
      if (server.oauth_access_token) headers.Authorization = `Bearer ${server.oauth_access_token}`;
      const response = await fetch(url.toString(), {
        method: 'POST', headers, redirect: 'error', signal: controller.signal,
        body: JSON.stringify({ jsonrpc: '2.0', ...(notification ? {} : { id: requestId }), method, ...(params === undefined ? {} : { params }) }),
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new MCPError(`MCP server returned HTTP ${response.status}`, response.status === 401);
      }
      if (notification) { await response.body?.cancel(); return; }
      if (method === 'initialize') sessionId = response.headers.get('Mcp-Session-Id');
      return readResult(response, requestId!);
    };
    const initialized = await request('initialize', {
      protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'easywebui', version: '1.0.0' },
    });
    if (!['2024-11-05', '2025-03-26', '2025-06-18', '2025-11-25'].includes(initialized.protocolVersion)) {
      throw new MCPError('Unsupported MCP protocol version');
    }
    version = initialized.protocolVersion;
    await request('notifications/initialized', undefined, true);
    const tools: MCPTool[] = [];
    if (initialized.capabilities?.tools) {
      let cursor: string | undefined;
      const seen = new Set<string>();
      do {
        const page = await request('tools/list', cursor ? { cursor } : {});
        if (!Array.isArray(page.tools)) throw new MCPError('MCP tools/list did not return a tools array');
        for (const tool of page.tools) {
          if (typeof tool.name !== 'string' || !tool.name || !tool.inputSchema ||
            typeof tool.inputSchema !== 'object' || Array.isArray(tool.inputSchema)) throw new MCPError('Invalid MCP tool definition');
          tools.push({ name: tool.name, description: tool.description ?? '', inputSchema: tool.inputSchema, serverId });
        }
        if (page.nextCursor !== undefined && typeof page.nextCursor !== 'string') throw new MCPError('Invalid MCP tools cursor');
        cursor = page.nextCursor;
        if (cursor) {
          if (seen.has(cursor) || seen.size >= 50) throw new MCPError('MCP tool pagination did not finish');
          seen.add(cursor);
        }
      } while (cursor);
    }
    const lastChecked = checkedAt();
    await db.prepare('UPDATE mcp_servers SET tools_json = ?, status = ?, last_checked = ? WHERE id = ?')
      .bind(JSON.stringify(tools), 'connected', lastChecked, serverId).run();
    return c.json({ status: 'connected', tools, lastChecked: lastChecked * 1000 });
  } catch (error) {
    return fail(error instanceof MCPError ? error : new MCPError(controller.signal.aborted ? 'MCP connection timed out' : 'MCP connection or response failed'));
  } finally { clearTimeout(timeout); }
}
