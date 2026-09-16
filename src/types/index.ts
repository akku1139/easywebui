// Message types
export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: number;
  toolCalls?: ToolCall[];
  toolResult?: ToolResult;
  model?: string;
}

// MCP Types
export interface MCPServer {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  tools: MCPTool[];
  status: 'connected' | 'disconnected' | 'error';
  lastChecked?: number;
  // OAuth 2.1 fields
  oauthEnabled?: boolean;
  oauthClientId?: string;
  oauthClientSecret?: string;
  oauthTokenEndpoint?: string;
  oauthAuthEndpoint?: string;
  oauthAccessToken?: string;
  oauthRefreshToken?: string;
  oauthTokenExpiresAt?: number;
  oauthScopes?: string;
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  serverId: string;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  serverId: string;
}

export interface ToolResult {
  toolCallId: string;
  content: string;
  isError?: boolean;
}

// Memory Types (based on ChatGPT's 4-layer approach)
export interface MemoryLayer {
  sessionMetadata: SessionMetadata;
  userFacts: UserFact[];
  conversationSummaries: ConversationSummary[];
  currentSession: Message[];
}

export interface SessionMetadata {
  device: string;
  browser: string;
  timezone: string;
  language: string;
  createdAt: number;
}

export interface UserFact {
  id: string;
  content: string;
  category: 'preference' | 'personal' | 'work' | 'project' | 'other';
  createdAt: number;
  updatedAt: number;
  source: 'explicit' | 'auto_detected';
}

export interface ConversationSummary {
  id: string;
  date: string;
  title: string;
  summary: string;
  messageCount: number;
  createdAt: number;
}

// Auth Types
export interface AuthState {
  isAuthenticated: boolean;
  username: string;
  token: string;
}

// Chat Types
export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  model: string;
  pinned?: boolean;
}

// API Endpoint
export interface APIEndpoint {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  enabled: boolean;
  isDefault?: boolean;
  createdAt: number;
}

// API Config (for backward compatibility)
export interface APIConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

// Settings
export interface Settings {
  endpoints: APIEndpoint[];
  activeEndpointId: string | null;
  mcpServers: MCPServer[];
  memoryEnabled: boolean;
  autoMemory: boolean;
  theme: 'light' | 'dark';
  customSystemPrompt?: string;
}
