import { Context } from 'hono';
import { Env } from '../index';

export async function handleSettings(c: Context<{ Bindings: Env }>) {
  const db = c.env.AI_CHAT_DB;
  const method = c.req.method;
  
  if (method === 'GET') {
    const settings = await db.prepare('SELECT * FROM settings LIMIT 1').first() as any;
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
      endpoints: JSON.parse(settings.endpoints_json || '[]'),
      activeEndpointId: settings.active_endpoint_id,
      memoryEnabled: settings.memory_enabled === 1,
      autoMemory: settings.auto_memory === 1,
      theme: settings.theme,
      customSystemPrompt: settings.custom_system_prompt,
    });
  }
  
  if (method === 'POST') {
    const body = await c.req.json();
    const existing = await db.prepare('SELECT id FROM settings LIMIT 1').first() as any;
    
    if (existing) {
      // Update existing settings
      await db.prepare(
        'UPDATE settings SET endpoints_json = ?, active_endpoint_id = ?, memory_enabled = ?, auto_memory = ?, theme = ?, custom_system_prompt = ?, updated_at = ? WHERE id = ?'
      ).bind(
        JSON.stringify(body.endpoints || []),
        body.activeEndpointId || null,
        body.memoryEnabled ? 1 : 0,
        body.autoMemory ? 1 : 0,
        body.theme || 'system',
        body.customSystemPrompt || '',
        Date.now(),
        existing.id
      ).run();
    } else {
      // Insert new settings
      const id = crypto.randomUUID();
      await db.prepare(
        'INSERT INTO settings (id, endpoints_json, active_endpoint_id, memory_enabled, auto_memory, theme, custom_system_prompt, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(
        id,
        JSON.stringify(body.endpoints || []),
        body.activeEndpointId || null,
        body.memoryEnabled ? 1 : 0,
        body.autoMemory ? 1 : 0,
        body.theme || 'system',
        body.customSystemPrompt || '',
        Date.now(),
        Date.now()
      ).run();
    }
    
    return c.json({ ok: true });
  }
  
  return c.json({ error: 'Method not allowed' }, 405);
}
