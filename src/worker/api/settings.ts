import { Context } from 'hono';
import { Env } from '../index';
import { drizzle } from 'drizzle-orm/d1';
import { settings as settingsTable } from '../../db/schema';
import { eq } from 'drizzle-orm';

export async function handleSettings(c: Context<{ Bindings: Env }>) {
  const db = drizzle(c.env.AI_CHAT_DB);
  const method = c.req.method;
  
  if (method === 'GET') {
    const allSettings = await db.select().from(settingsTable).limit(1);
    const settings = allSettings[0];
    
    if (!settings) {
      // Return default settings
      return c.json({
        endpoints: [],
        activeEndpointId: null,
        memoryEnabled: true,
        autoMemory: true,
        theme: 'system',
        customSystemPrompt: '',
      });
    }
    
    return c.json({
      endpoints: JSON.parse(settings.endpointsJson || '[]'),
      activeEndpointId: settings.activeEndpointId,
      memoryEnabled: settings.memoryEnabled,
      autoMemory: settings.autoMemory,
      theme: settings.theme,
      customSystemPrompt: settings.customSystemPrompt,
    });
  }
  
  if (method === 'POST') {
    const body = await c.req.json();
    const allSettings = await db.select().from(settingsTable).limit(1);
    const existing = allSettings[0];
    
    if (existing) {
      // Update existing settings
      await db.update(settingsTable)
        .set({
          endpointsJson: JSON.stringify(body.endpoints || []),
          activeEndpointId: body.activeEndpointId || null,
          memoryEnabled: body.memoryEnabled,
          autoMemory: body.autoMemory,
          theme: body.theme || 'system',
          customSystemPrompt: body.customSystemPrompt || '',
          updatedAt: new Date(),
        })
        .where(eq(settingsTable.id, existing.id));
    } else {
      // Insert new settings
      const id = crypto.randomUUID();
      await db.insert(settingsTable).values({
        id,
        endpointsJson: JSON.stringify(body.endpoints || []),
        activeEndpointId: body.activeEndpointId || null,
        memoryEnabled: body.memoryEnabled,
        autoMemory: body.autoMemory,
        theme: body.theme || 'system',
        customSystemPrompt: body.customSystemPrompt || '',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
    
    return c.json({ ok: true });
  }
  
  return c.json({ error: 'Method not allowed' }, 405);
}
