import type { Context } from 'hono';
import type { Env } from '../index';
import type { MCPTool } from '../../types';

import { MCPError, createMCPSession } from './mcp-session';

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
    const { request, initialized } = await createMCPSession(url, server.oauth_access_token || null, controller.signal);
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
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    return fail(error instanceof MCPError ? error
      : new MCPError(controller.signal.aborted
        ? `MCP connection timed out after 20s — the MCP server may be unreachable from Cloudflare (e.g. localhost or a firewall). (${detail})`
        : `MCP connection failed: ${detail}`));
  } finally { clearTimeout(timeout); }
}
