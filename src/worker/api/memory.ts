import { Context } from 'hono';
import { Env } from '../index';
import { drizzle } from 'drizzle-orm/d1';
import { userFacts, conversationSummaries } from '../../db/schema';
import { eq, desc } from 'drizzle-orm';

export async function handleMemoryFacts(c: Context<{ Bindings: Env }>) {
  const db = drizzle(c.env.AI_CHAT_DB);
  const method = c.req.method;
  
  if (method === 'GET') {
    const facts = await db.select().from(userFacts).orderBy(desc(userFacts.updatedAt));
    return c.json(facts);
  }
  
  if (method === 'POST') {
    const body = await c.req.json();
    const id = crypto.randomUUID();
    const now = new Date();
    await db.insert(userFacts).values({
      id,
      content: body.content,
      category: body.category || 'other',
      source: 'explicit',
      createdAt: now,
      updatedAt: now,
    });
    return c.json({ id, ...body });
  }
  
  if (method === 'DELETE') {
    const id = new URL(c.req.url).searchParams.get('id');
    if (id) {
      await db.delete(userFacts).where(eq(userFacts.id, id));
    }
    return c.json({ ok: true });
  }
  
  return c.json({ error: 'Method not allowed' }, 405);
}

export async function handleSummaries(c: Context<{ Bindings: Env }>) {
  const db = drizzle(c.env.AI_CHAT_DB);
  const method = c.req.method;
  
  if (method === 'GET') {
    const summaries = await db.select().from(conversationSummaries)
      .orderBy(desc(conversationSummaries.createdAt))
      .limit(50);
    return c.json(summaries);
  }
  
  if (method === 'POST') {
    const body = await c.req.json();
    const id = crypto.randomUUID();
    await db.insert(conversationSummaries).values({
      id,
      title: body.title,
      summary: body.summary,
      date: body.date,
      messageCount: body.message_count,
      createdAt: new Date(),
    });
    return c.json({ id, ...body });
  }
  
  return c.json({ error: 'Method not allowed' }, 405);
}
