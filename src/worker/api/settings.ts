import { Context } from 'hono';
import { Env } from '../index';
import { drizzle } from 'drizzle-orm/d1';
import { settings as settingsTable } from '../../db/schema';
import { eq } from 'drizzle-orm';
import { migrateLegacyEndpoints } from '../../utils/storage';
import type { Settings } from '../../types';

export async function handleSettings(c: Context<{ Bindings: Env }>) {
  const db = drizzle(c.env.AI_CHAT_DB);
  const method = c.req.method;
  
  if (method === 'GET') {
    const allSettings = await db.select().from(settingsTable).limit(1);
    const settings = allSettings[0];
    
    if (!settings) {
      // Return default settings
      return c.json({
        initialized: false,
        endpoints: [],
        activeEndpointId: null,
        providers: [],
        models: [],
        activeModelId: null,
        memoryEnabled: true,
        autoMemory: true,
        theme: 'system',
        customSystemPrompt: '',
      });
    }
    
    const endpoints = JSON.parse(settings.endpointsJson || '[]');
    const providers = JSON.parse(settings.providersJson || '[]');
    const models = JSON.parse(settings.modelsJson || '[]');
    const normalized = migrateLegacyEndpoints({
      endpoints, activeEndpointId: settings.activeEndpointId,
      ...(providers.length || models.length || !endpoints.length ? { providers, models } : {}),
      activeModelId: settings.activeModelId,
    } as Settings);
    return c.json({
      initialized: true,
      endpoints: JSON.parse(settings.endpointsJson || '[]'),
      activeEndpointId: settings.activeEndpointId,
      providers: normalized.providers,
      models: normalized.models,
      activeModelId: normalized.activeModelId,
      memoryEnabled: settings.memoryEnabled,
      autoMemory: settings.autoMemory,
      theme: settings.theme,
      customSystemPrompt: settings.customSystemPrompt,
    });
  }
  
  if (method === 'POST') {
    const body = migrateLegacyEndpoints(await c.req.json());
    if (!Array.isArray(body.providers) || !Array.isArray(body.models)
      || body.models.some(m => !body.providers?.some(p => p.id === m.providerId))
      || (body.activeModelId && !body.models.some(m => m.id === body.activeModelId))) {
      return c.json({ error: 'Invalid provider or model selection' }, 400);
    }
    const allSettings = await db.select().from(settingsTable).limit(1);
    const existing = allSettings[0];
    
    if (existing) {
      // Update existing settings
      await db.update(settingsTable)
        .set({
          endpointsJson: JSON.stringify(body.endpoints || []),
          activeEndpointId: body.activeEndpointId || null,
          providersJson: JSON.stringify(body.providers || []),
          modelsJson: JSON.stringify(body.models || []),
          activeModelId: body.activeModelId || null,
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
        providersJson: JSON.stringify(body.providers || []),
        modelsJson: JSON.stringify(body.models || []),
        activeModelId: body.activeModelId || null,
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
