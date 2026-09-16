import { Context } from 'hono';
import { Env } from '../index';

export async function handleEndpoints(c: Context<{ Bindings: Env }>) {
  const db = c.env.AI_CHAT_DB;
  const method = c.req.method;
  
  if (method === 'GET') {
    const endpoints = await db.prepare(
      'SELECT * FROM api_endpoints ORDER BY is_default DESC, created_at ASC'
    ).all();
    return c.json(endpoints.results);
  }
  
  if (method === 'POST') {
    const body = await c.req.json();
    const id = crypto.randomUUID();
    
    if (body.is_default) {
      await db.prepare('UPDATE api_endpoints SET is_default = 0').run();
    }
    
    await db.prepare(
      'INSERT INTO api_endpoints (id, name, base_url, api_key, model, enabled, is_default, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      id,
      body.name,
      body.base_url,
      body.api_key,
      body.model,
      body.enabled ? 1 : 0,
      body.is_default ? 1 : 0,
      Date.now()
    ).run();
    
    return c.json({ id, ...body });
  }
  
  if (method === 'PATCH') {
    const id = new URL(c.req.url).searchParams.get('id');
    if (!id) {
      return c.json({ error: 'Missing endpoint ID' }, 400);
    }
    
    const body = await c.req.json();
    
    if (body.is_default) {
      await db.prepare('UPDATE api_endpoints SET is_default = 0').run();
    }
    
    const updates: string[] = [];
    const values: any[] = [];
    
    if (body.name !== undefined) { updates.push('name = ?'); values.push(body.name); }
    if (body.base_url !== undefined) { updates.push('base_url = ?'); values.push(body.base_url); }
    if (body.api_key !== undefined) { updates.push('api_key = ?'); values.push(body.api_key); }
    if (body.model !== undefined) { updates.push('model = ?'); values.push(body.model); }
    if (body.enabled !== undefined) { updates.push('enabled = ?'); values.push(body.enabled ? 1 : 0); }
    if (body.is_default !== undefined) { updates.push('is_default = ?'); values.push(body.is_default ? 1 : 0); }
    
    if (updates.length > 0) {
      values.push(id);
      await db.prepare(`UPDATE api_endpoints SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
    }
    
    return c.json({ ok: true });
  }
  
  if (method === 'DELETE') {
    const id = new URL(c.req.url).searchParams.get('id');
    if (id) {
      await db.prepare('DELETE FROM api_endpoints WHERE id = ?').bind(id).run();
    }
    return c.json({ ok: true });
  }
  
  return c.json({ error: 'Method not allowed' }, 405);
}
