import { Context } from 'hono';
import { Env } from '../index';
import { drizzle } from 'drizzle-orm/d1';
import { userFacts, conversationSummaries } from '../../db/schema';
import { eq, desc } from 'drizzle-orm';

function toEpochMs(value: unknown): number {
  if (typeof value === 'number') return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return Date.now();
}

export async function handleMemoryFacts(c: Context<{ Bindings: Env }>) {
  const db = drizzle(c.env.AI_CHAT_DB);
  const method = c.req.method;

  if (method === 'GET') {
    const facts = await db.select().from(userFacts).orderBy(desc(userFacts.updatedAt));
    return c.json(facts.map(fact => ({
      id: fact.id,
      content: fact.content,
      category: fact.category,
      source: fact.source,
      createdAt: toEpochMs(fact.createdAt),
      updatedAt: toEpochMs(fact.updatedAt),
    })));
  }

  if (method === 'POST') {
    const body = await c.req.json();
    // Client ids keep fact writes idempotent across retries/devices.
    const id = body.id ?? crypto.randomUUID();
    const now = new Date();
    const existing = await db.select().from(userFacts).where(eq(userFacts.id, id));
    if (existing.length > 0) {
      await db.update(userFacts).set({
        content: body.content,
        category: body.category || 'other',
        updatedAt: now,
      }).where(eq(userFacts.id, id));
      return c.json({ id, ...body });
    }
    await db.insert(userFacts).values({
      id,
      content: body.content,
      category: body.category || 'other',
      source: body.source || 'explicit',
      createdAt: body.createdAt ? new Date(toEpochMs(body.createdAt)) : now,
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
    return c.json(summaries.map(s => ({
      id: s.id,
      title: s.title,
      summary: s.summary,
      date: s.date,
      messageCount: s.messageCount,
      createdAt: toEpochMs(s.createdAt),
    })));
  }

  if (method === 'POST') {
    const body = await c.req.json();
    const id = body.id ?? crypto.randomUUID();
    const existing = await db.select().from(conversationSummaries).where(eq(conversationSummaries.id, id));
    if (existing.length > 0) {
      return c.json({ id, ...body });
    }
    await db.insert(conversationSummaries).values({
      id,
      title: body.title,
      summary: body.summary,
      date: body.date,
      messageCount: body.messageCount ?? body.message_count ?? 0,
      createdAt: body.createdAt ? new Date(toEpochMs(body.createdAt)) : new Date(),
    });
    return c.json({ id, ...body });
  }

  return c.json({ error: 'Method not allowed' }, 405);
}
