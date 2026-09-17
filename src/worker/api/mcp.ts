import { Context } from 'hono';
import { Env } from '../index';
import { drizzle } from 'drizzle-orm/d1';
import { mcpServers } from '../../db/schema';
import { eq, desc } from 'drizzle-orm';

export async function handleMCPServers(c: Context<{ Bindings: Env }>) {
  const db = drizzle(c.env.AI_CHAT_DB);
  const method = c.req.method;
  
  if (method === 'GET') {
    const servers = await db.select().from(mcpServers).orderBy(desc(mcpServers.createdAt));
    return c.json(servers.map(server => ({
      id: server.id,
      name: server.name,
      url: server.url,
      enabled: server.enabled,
      tools: JSON.parse(server.toolsJson || '[]'),
      status: server.status,
      lastChecked: server.lastChecked,
      oauthEnabled: server.oauthEnabled,
      oauthClientId: server.oauthClientId,
      oauthTokenEndpoint: server.oauthTokenEndpoint,
      oauthAuthEndpoint: server.oauthAuthEndpoint,
      oauthRegistrationEndpoint: server.oauthRegistrationEndpoint,
      oauthScopes: server.oauthScopes,
    })));
  }
  
  if (method === 'POST') {
    const body = await c.req.json();
    const id = crypto.randomUUID();
    const now = new Date();
    await db.insert(mcpServers).values({
      id,
      name: body.name,
      url: body.url,
      enabled: body.enabled ?? true,
      toolsJson: JSON.stringify(body.tools || []),
      status: body.status || 'disconnected',
      createdAt: now,
      oauthEnabled: body.oauthEnabled || false,
      oauthClientId: body.oauthClientId || null,
      oauthClientSecret: body.oauthClientSecret || null,
      oauthTokenEndpoint: body.oauthTokenEndpoint || null,
      oauthAuthEndpoint: body.oauthAuthEndpoint || null,
      oauthRegistrationEndpoint: body.oauthRegistrationEndpoint || null,
      oauthAccessToken: body.oauthAccessToken || null,
      oauthRefreshToken: body.oauthRefreshToken || null,
      oauthTokenExpiresAt: body.oauthTokenExpiresAt ? new Date(body.oauthTokenExpiresAt) : null,
      oauthScopes: body.oauthScopes || null,
    });
    // Return the persisted id, never the provisional id supplied by the browser.
    return c.json({ ...body, id });
  }
  
  if (method === 'PATCH') {
    const id = new URL(c.req.url).searchParams.get('id');
    if (!id) {
      return c.json({ error: 'Missing server ID' }, 400);
    }
    
    const body = await c.req.json();
    const updates: any = {};
    
    if (body.name !== undefined) updates.name = body.name;
    if (body.url !== undefined) updates.url = body.url;
    if (body.enabled !== undefined) updates.enabled = body.enabled;
    if (body.tools !== undefined) updates.toolsJson = JSON.stringify(body.tools);
    if (body.status !== undefined) updates.status = body.status;
    
    if (Object.keys(updates).length > 0) {
      await db.update(mcpServers).set(updates).where(eq(mcpServers.id, id));
    }
    
    return c.json({ ok: true });
  }
  
  if (method === 'DELETE') {
    const id = new URL(c.req.url).searchParams.get('id');
    if (id) {
      await db.delete(mcpServers).where(eq(mcpServers.id, id));
    }
    return c.json({ ok: true });
  }
  
  return c.json({ error: 'Method not allowed' }, 405);
}
