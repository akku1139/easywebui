import { Context } from 'hono';
import { Env } from '../index';
import { drizzle } from 'drizzle-orm/d1';
import { conversations } from '../../db/schema';
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

export async function handleConversations(c: Context<{ Bindings: Env }>) {
  const db = drizzle(c.env.AI_CHAT_DB);
  const method = c.req.method;

  if (method === 'GET') {
    const allConversations = await db.select().from(conversations)
      .orderBy(desc(conversations.pinned), desc(conversations.updatedAt));
    return c.json(allConversations.map(conv => ({
      id: conv.id,
      title: conv.title,
      model: conv.model,
      pinned: Boolean(conv.pinned),
      messages: JSON.parse(conv.messagesJson || '[]'),
      createdAt: toEpochMs(conv.createdAt),
      updatedAt: toEpochMs(conv.updatedAt),
    })));
  }

  if (method === 'POST') {
    const body = await c.req.json();
    // Client-generated ids make writes idempotent: re-POSTing a conversation
    // (e.g. after a failed sync retry) updates instead of duplicating.
    const id = body.id ?? crypto.randomUUID();
    const now = new Date();
    const existing = await db.select().from(conversations).where(eq(conversations.id, id));
    if (existing.length > 0) {
      await db.update(conversations).set({
        title: body.title,
        messagesJson: JSON.stringify(body.messages || []),
        model: body.model,
        pinned: Boolean(body.pinned),
        updatedAt: body.updatedAt ? new Date(toEpochMs(body.updatedAt)) : now,
      }).where(eq(conversations.id, id));
      return c.json({ id, ...body });
    }
    await db.insert(conversations).values({
      id,
      title: body.title,
      messagesJson: JSON.stringify(body.messages || []),
      model: body.model,
      pinned: Boolean(body.pinned || false),
      createdAt: body.createdAt ? new Date(toEpochMs(body.createdAt)) : now,
      updatedAt: body.updatedAt ? new Date(toEpochMs(body.updatedAt)) : now,
    });
    return c.json({ id, ...body });
  }

  if (method === 'DELETE') {
    const id = new URL(c.req.url).searchParams.get('id');
    if (!id) {
      return c.json({ error: 'Missing conversation ID' }, 400);
    }

    await db.delete(conversations).where(eq(conversations.id, id));
    return c.json({ ok: true });
  }

  if (method === 'PATCH') {
    const id = new URL(c.req.url).searchParams.get('id');
    if (!id) {
      return c.json({ error: 'Missing conversation ID' }, 400);
    }

    const body = await c.req.json();
    const updates: any = { updatedAt: new Date() };

    if (body.pinned !== undefined) {
      updates.pinned = body.pinned;
    }

    if (body.title !== undefined) {
      updates.title = body.title;
    }

    if (body.messages !== undefined) {
      updates.messagesJson = JSON.stringify(body.messages);
    }

    if (body.model !== undefined) {
      updates.model = body.model;
    }

    await db.update(conversations).set(updates).where(eq(conversations.id, id));
    return c.json({ ok: true });
  }

  return c.json({ error: 'Method not allowed' }, 405);
}
