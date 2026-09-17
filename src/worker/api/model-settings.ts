import type { Context } from 'hono';
import type { Env } from '../index';
import { settings as settingsTable } from '../../db/schema';
import { drizzle } from 'drizzle-orm/d1';
import { migrateLegacyEndpoints, resolveModel } from '../../utils/storage';
import type { Settings } from '../../types';

/** Same legacy normalization and selection as the browser, from D1 only. */
export async function loadModelSettings(c: Context<{ Bindings: Env }>) {
  const [row] = await drizzle(c.env.AI_CHAT_DB).select().from(settingsTable).limit(1);
  if (!row) throw new Error('No model configured. Configure a provider and model in Settings.');
  const endpoints = JSON.parse(row.endpointsJson || '[]');
  const providers = JSON.parse(row.providersJson || '[]');
  const models = JSON.parse(row.modelsJson || '[]');
  const settings = migrateLegacyEndpoints({
    endpoints, activeEndpointId: row.activeEndpointId,
    ...(providers.length || models.length || !endpoints.length ? { providers, models } : {}),
    activeModelId: row.activeModelId, memoryEnabled: row.memoryEnabled, autoMemory: row.autoMemory,
    customSystemPrompt: row.customSystemPrompt, mcpServers: [], theme: row.theme,
  } as Settings);
  const config = resolveModel(settings);
  if (!config?.model?.trim() || !config.baseUrl?.trim() || !config.apiKey?.trim()) {
    throw new Error('No valid provider and model configured. Check Settings.');
  }
  return { settings, config };
}
