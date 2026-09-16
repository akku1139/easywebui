import { Context } from 'hono';
import { Env } from '../index';

export async function handleMemoryFacts(c: Context<{ Bindings: Env }>) {
  const db = c.env.AI_CHAT_DB;
  const method = c.req.method;
  
  if (method === 'GET') {
    const facts = await db.prepare('SELECT * FROM user_facts ORDER BY updated_at DESC').all();
    return c.json(facts.results);
  }
  
  if (method === 'POST') {
    const body = await c.req.json();
    const id = crypto.randomUUID();
    await db.prepare(
      'INSERT INTO user_facts (id, content, category, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(
      id,
      body.content,
      body.category || 'other',
      'explicit',
      Date.now(),
      Date.now()
    ).run();
    return c.json({ id, ...body });
  }
  
  if (method === 'DELETE') {
    const id = new URL(c.req.url).searchParams.get('id');
    if (id) {
      await db.prepare('DELETE FROM user_facts WHERE id = ?').bind(id).run();
    }
    return c.json({ ok: true });
  }
  
  return c.json({ error: 'Method not allowed' }, 405);
}

export async function handleSummaries(c: Context<{ Bindings: Env }>) {
  const db = c.env.AI_CHAT_DB;
  const method = c.req.method;
  
  if (method === 'GET') {
    const summaries = await db.prepare(
      'SELECT * FROM conversation_summaries ORDER BY created_at DESC LIMIT 50'
    ).all();
    return c.json(summaries.results);
  }
  
  if (method === 'POST') {
    const body = await c.req.json();
    const id = crypto.randomUUID();
    await db.prepare(
      'INSERT INTO conversation_summaries (id, title, summary, date, message_count, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(
      id,
      body.title,
      body.summary,
      body.date,
      body.message_count,
      Date.now()
    ).run();
    return c.json({ id, ...body });
  }
  
  return c.json({ error: 'Method not allowed' }, 405);
}
