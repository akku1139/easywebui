import { Context } from 'hono';
import { Env } from '../index';
import { drizzle } from 'drizzle-orm/d1';
import { conversations } from '../../db/schema';
import { eq, desc } from 'drizzle-orm';

export async function handleConversations(c: Context<{ Bindings: Env }>) {
  const db = drizzle(c.env.AI_CHAT_DB);
  const method = c.req.method;
  
  if (method === 'GET') {
    const allConversations = await db.select({
      id: conversations.id,
      title: conversations.title,
      model: conversations.model,
      pinned: conversations.pinned,
      createdAt: conversations.createdAt,
      updatedAt: conversations.updatedAt,
    }).from(conversations)
      .orderBy(desc(conversations.pinned), desc(conversations.updatedAt));
    return c.json(allConversations);
  }
  
  if (method === 'POST') {
    const body = await c.req.json();
    const id = crypto.randomUUID();
    const now = new Date();
    await db.insert(conversations).values({
      id,
      title: body.title,
      messagesJson: JSON.stringify(body.messages || []),
      model: body.model,
      pinned: body.pinned || false,
      createdAt: now,
      updatedAt: now,
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
    
    await db.update(conversations).set(updates).where(eq(conversations.id, id));
    return c.json({ ok: true });
  }
  
  return c.json({ error: 'Method not allowed' }, 405);
}
