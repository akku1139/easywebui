import type { Context } from 'hono';
import type { Env } from '../index';
import { MCPError, createMCPSession } from './mcp-session';

export async function handleMCPToolCall(c: Context<{ Bindings: Env }>) {
  let body;
  try {
    body = await c.req.json();
    if (!body || typeof body !== 'object') throw new Error();
  } catch { return c.json({ error: 'Invalid request body' }, 400); }
  const { serverId, name, arguments: args } = body;
  if (typeof serverId !== 'string' || !serverId || typeof name !== 'string' || !name) {
    return c.json({ error: 'Missing server ID or tool name' }, 400);
  }
  if (args !== undefined && (typeof args !== 'object' || Array.isArray(args) || args === null)) {
    return c.json({ error: 'Tool arguments must be an object' }, 400);
  }
  const server = await c.env.AI_CHAT_DB.prepare('SELECT * FROM mcp_servers WHERE id = ?').bind(serverId).first() as any;
  if (!server) return c.json({ error: 'Server not found' }, 404);
  if (!server.enabled) return c.json({ error: 'Server is disabled' }, 409);
  if (server.oauth_enabled && (!server.oauth_access_token ||
    (server.oauth_token_expires_at && server.oauth_token_expires_at * 1000 <= Date.now()))) {
    return c.json({ error: 'MCP authentication required', authRequired: true }, 401);
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const url = new URL(server.url);
    if (!['http:', 'https:'].includes(url.protocol)) throw new MCPError('Invalid MCP HTTP URL');
    // The URL and OAuth credentials are loaded only from the saved server.
    // Calls are never retried automatically: tools may have side effects.
    const { request, initialized } = await createMCPSession(url, server.oauth_access_token || null, controller.signal);
    if (!initialized.capabilities?.tools) throw new MCPError('MCP server does not support tools');
    const result = await request('tools/call', { name, arguments: args ?? {} });
    if (!Array.isArray(result.content) || (result.isError !== undefined && typeof result.isError !== 'boolean')) {
      throw new MCPError('Invalid MCP tool result');
    }
    const text = result.content.map((part: any) => typeof part?.text === 'string' ? part.text : JSON.stringify(part)).join('\n');
    // Tool-level errors are valid results. Pass them back to the model as such,
    // unlike transport/protocol errors which must be surfaced by the caller.
    return c.json({ content: text, isError: Boolean(result.isError) });
  } catch (error) {
    const authRequired = error instanceof MCPError && error.authRequired;
    const detail = controller.signal.aborted ? 'MCP tool call timed out after 30s; execution may have occurred. Do not automatically retry.'
      : error instanceof Error ? error.message : String(error);
    return c.json({ error: detail, authRequired }, authRequired ? 401 : 502);
  } finally { clearTimeout(timeout); }
}
