import { Context } from 'hono';
import { Env } from '../index';

export async function handleConversations(c: Context<{ Bindings: Env }>) {
  const db = c.env.AI_CHAT_DB;
  const method = c.req.method;
  
  if (method === 'GET') {
    const conversations = await db.prepare(
      'SELECT id, title, model, pinned, created_at, updated_at FROM conversations ORDER BY pinned DESC, updated_at DESC'
    ).all();
    return c.json(conversations.results);
  }
  
  if (method === 'POST') {
    const body = await c.req.json();
    const id = crypto.randomUUID();
    await db.prepare(
      'INSERT INTO conversations (id, title, messages_json, model, pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      id,
      body.title,
      JSON.stringify(body.messages || []),
      body.model,
      body.pinned ? 1 : 0,
      Date.now(),
      Date.now()
    ).run();
    return c.json({ id, ...body });
  }
  
  if (method === 'PATCH') {
    const id = new URL(c.req.url).searchParams.get('id');
    if (!id) {
      return c.json({ error: 'Missing conversation ID' }, 400);
    }
    
    const body = await c.req.json();
    
    if (body.pinned !== undefined) {
      await db.prepare(
        'UPDATE conversations SET pinned = ?, updated_at = ? WHERE id = ?'
      ).bind(body.pinned ? 1 : 0, Date.now(), id).run();
    }
    
    if (body.title !== undefined) {
      await db.prepare(
        'UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?'
      ).bind(body.title, Date.now(), id).run();
    }
    
    return c.json({ ok: true });
  }
  
  return c.json({ error: 'Method not allowed' }, 405);
}
