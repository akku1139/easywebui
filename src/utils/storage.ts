import { Conversation, Message, Settings, UserFact, ConversationSummary, MCPServer, AIProvider, ProviderModel, APIConfig } from '../types';

const STORAGE_KEYS = {
  conversations: 'ai-chat-conversations',
  settings: 'ai-chat-settings',
  memory: 'ai-chat-memory',
  summaries: 'ai-chat-summaries',
  mcpServers: 'ai-chat-mcp-servers',
};

// Conversations
export function loadConversations(): Conversation[] {
  const data = localStorage.getItem(STORAGE_KEYS.conversations);
  return data ? JSON.parse(data) : [];
}

export function saveConversations(conversations: Conversation[]) {
  localStorage.setItem(STORAGE_KEYS.conversations, JSON.stringify(conversations));
}

// Settings
export function loadSettings(): Settings {
  const data = localStorage.getItem(STORAGE_KEYS.settings);
  if (data) {
    const parsed = JSON.parse(data);
    // Migrate from old format
    if (parsed.apiConfig && !parsed.endpoints) {
      return migrateLegacyEndpoints({
        endpoints: [{
          id: generateId(),
          name: 'Default',
          baseUrl: parsed.apiConfig.baseUrl,
          apiKey: parsed.apiConfig.apiKey,
          model: parsed.apiConfig.model,
          enabled: true,
          isDefault: true,
          createdAt: Date.now(),
        }],
        activeEndpointId: null,
        mcpServers: parsed.mcpServers || [],
        memoryEnabled: parsed.memoryEnabled ?? true,
        autoMemory: parsed.autoMemory ?? true,
        theme: parsed.theme || 'dark',
        customSystemPrompt: parsed.customSystemPrompt || '',
      });
    }
    // Legacy endpoints are migrated to provider/model on load so the
    // provider/model UI works without re-entering credentials.
    const migrated = migrateLegacyEndpoints(parsed);
    return migrated;
  }
  return {
    endpoints: [],
    activeEndpointId: null,
    mcpServers: [],
    memoryEnabled: true,
    autoMemory: true,
    theme: 'system',
    customSystemPrompt: '',
  };
}

/** Normalize old endpoints once; explicit empty model lists stay empty. */
export function migrateLegacyEndpoints(settings: Settings): Settings {
  if (Array.isArray(settings.providers) && Array.isArray(settings.models)) {
    return { ...settings, endpoints: [], activeEndpointId: null };
  }
  const providers: AIProvider[] = [];
  const models: ProviderModel[] = [];
  const enabled = (settings.endpoints ?? []).filter(e => e.enabled);
  const activeEndpoint = enabled.find(e => e.id === settings.activeEndpointId)
    ?? enabled.find(e => e.isDefault) ?? enabled[0];
  let activeModelId: string | null = null;
  for (const endpoint of enabled) {
    const baseUrl = endpoint.baseUrl.trim().replace(/\/+$/, '');
    let provider = providers.find(p => p.baseUrl === baseUrl && p.apiKey === endpoint.apiKey);
    if (!provider) {
      provider = {
        id: endpoint.id, name: endpoint.name, baseUrl,
        apiKey: endpoint.apiKey, createdAt: endpoint.createdAt,
      };
      providers.push(provider);
    }
    // Keep endpoint ids stable, even when several endpoints share a provider.
    const model = { id: endpoint.id, providerId: provider.id,
      name: endpoint.model, label: endpoint.name, createdAt: endpoint.createdAt };
    models.push(model);
    if (endpoint.id === activeEndpoint?.id) activeModelId = model.id;
  }
  return { ...settings, endpoints: [], activeEndpointId: null, providers, models, activeModelId };
}

/** One resolver shared by chat and the header; never borrow another provider's key. */
export function resolveModel(settings: Settings): (APIConfig & { name: string; id: string }) | null {
  const normalized = migrateLegacyEndpoints(settings);
  const models = normalized.models ?? [];
  const model = models.find(m => m.id === normalized.activeModelId) ?? models[0];
  if (!model) return null;
  const provider = normalized.providers?.find(p => p.id === model.providerId);
  if (!provider) return null;
  return { id: model.id, name: provider.name, model: model.name,
    baseUrl: provider.baseUrl, apiKey: provider.apiKey };
}

export function saveSettings(settings: Settings) {
  localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings));
}

// Memory (User Facts)
export function loadUserFacts(): UserFact[] {
  const data = localStorage.getItem(STORAGE_KEYS.memory);
  return data ? JSON.parse(data) : [];
}

export function saveUserFacts(facts: UserFact[]) {
  localStorage.setItem(STORAGE_KEYS.memory, JSON.stringify(facts));
}

// Conversation Summaries
export function loadSummaries(): ConversationSummary[] {
  const data = localStorage.getItem(STORAGE_KEYS.summaries);
  return data ? JSON.parse(data) : [];
}

export function saveSummaries(summaries: ConversationSummary[]) {
  localStorage.setItem(STORAGE_KEYS.summaries, JSON.stringify(summaries));
}

// MCP Servers
export function loadMCPServers(): MCPServer[] {
  const data = localStorage.getItem(STORAGE_KEYS.mcpServers);
  return data ? JSON.parse(data) : [];
}

export function saveMCPServers(servers: MCPServer[]) {
  localStorage.setItem(STORAGE_KEYS.mcpServers, JSON.stringify(servers));
}

// Helper to generate IDs
export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}
