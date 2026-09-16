import { Context } from 'hono';
import { Env } from '../index';
import { drizzle } from 'drizzle-orm/d1';
import { apiEndpoints } from '../../db/schema';
import { eq, desc, asc } from 'drizzle-orm';

export async function handleEndpoints(c: Context<{ Bindings: Env }>) {
  const db = drizzle(c.env.AI_CHAT_DB);
  const method = c.req.method;
  
  if (method === 'GET') {
    const endpoints = await db.select().from(apiEndpoints)
      .orderBy(desc(apiEndpoints.isDefault), asc(apiEndpoints.createdAt));
    return c.json(endpoints);
  }
  
  if (method === 'POST') {
    const body = await c.req.json();
    const id = crypto.randomUUID();
    
    if (body.is_default) {
      await db.update(apiEndpoints).set({ isDefault: false });
    }
    
    await db.insert(apiEndpoints).values({
      id,
      name: body.name,
      baseUrl: body.base_url,
      apiKey: body.api_key,
      model: body.model,
      enabled: body.enabled ?? true,
      isDefault: body.is_default || false,
      createdAt: new Date(),
    });
    
    return c.json({ id, ...body });
  }
  
  if (method === 'PATCH') {
    const id = new URL(c.req.url).searchParams.get('id');
    if (!id) {
      return c.json({ error: 'Missing endpoint ID' }, 400);
    }
    
    const body = await c.req.json();
    
    if (body.is_default) {
      await db.update(apiEndpoints).set({ isDefault: false });
    }
    
    const updates: any = {};
    
    if (body.name !== undefined) updates.name = body.name;
    if (body.base_url !== undefined) updates.baseUrl = body.base_url;
    if (body.api_key !== undefined) updates.apiKey = body.api_key;
    if (body.model !== undefined) updates.model = body.model;
    if (body.enabled !== undefined) updates.enabled = body.enabled;
    if (body.is_default !== undefined) updates.isDefault = body.is_default;
    
    if (Object.keys(updates).length > 0) {
      await db.update(apiEndpoints).set(updates).where(eq(apiEndpoints.id, id));
    }
    
    return c.json({ ok: true });
  }
  
  if (method === 'DELETE') {
    const id = new URL(c.req.url).searchParams.get('id');
    if (id) {
      await db.delete(apiEndpoints).where(eq(apiEndpoints.id, id));
    }
    return c.json({ ok: true });
  }
  
  return c.json({ error: 'Method not allowed' }, 405);
}
