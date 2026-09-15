import { Conversation, Message, Settings, UserFact, ConversationSummary, MCPServer } from '../types';

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
  if (data) return JSON.parse(data);
  return {
    apiConfig: {
      baseUrl: '',
      apiKey: '',
      model: 'gpt-4o',
    },
    mcpServers: [],
    memoryEnabled: true,
    autoMemory: true,
    theme: 'dark',
  };
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
