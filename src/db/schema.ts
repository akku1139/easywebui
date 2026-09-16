import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

// User memory facts (Layer 2: permanent knowledge)
export const userFacts = sqliteTable('user_facts', {
  id: text('id').primaryKey(),
  content: text('content').notNull(),
  category: text('category').notNull().default('other'), // preference, personal, work, project, other
  source: text('source').notNull().default('explicit'), // explicit, auto_detected
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

// Conversation summaries (Layer 3: recent conversation context)
export const conversationSummaries = sqliteTable('conversation_summaries', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  summary: text('summary').notNull(),
  date: text('date').notNull(),
  messageCount: integer('message_count').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

// Conversations (Layer 4: current session messages)
export const conversations = sqliteTable('conversations', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  messagesJson: text('messages_json').notNull().default('[]'),
  model: text('model').notNull().default('gpt-4o'),
  pinned: integer('pinned', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

// MCP Server configurations
export const mcpServers = sqliteTable('mcp_servers', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  url: text('url').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  toolsJson: text('tools_json').notNull().default('[]'),
  status: text('status').notNull().default('disconnected'),
  lastChecked: integer('last_checked', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  // OAuth 2.1 fields
  oauthEnabled: integer('oauth_enabled', { mode: 'boolean' }).notNull().default(false),
  oauthClientId: text('oauth_client_id'),
  oauthClientSecret: text('oauth_client_secret'),
  oauthTokenEndpoint: text('oauth_token_endpoint'),
  oauthAuthEndpoint: text('oauth_auth_endpoint'),
  oauthAccessToken: text('oauth_access_token'),
  oauthRefreshToken: text('oauth_refresh_token'),
  oauthTokenExpiresAt: integer('oauth_token_expires_at', { mode: 'timestamp' }),
  oauthScopes: text('oauth_scopes'),
});

// API Endpoints
export const apiEndpoints = sqliteTable('api_endpoints', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  baseUrl: text('base_url').notNull(),
  apiKey: text('api_key').notNull(),
  model: text('model').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

// Session metadata (Layer 1: temporary session info)
export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  device: text('device'),
  browser: text('browser'),
  timezone: text('timezone'),
  language: text('language'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
});

// Auto-memory extraction log
export const memoryExtractionLog = sqliteTable('memory_extraction_log', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id').notNull(),
  factsExtracted: integer('facts_extracted').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

// OAuth state storage for MCP servers
export const oauthStates = sqliteTable('oauth_states', {
  id: text('id').primaryKey(),
  serverId: text('server_id').notNull(),
  state: text('state').notNull(),
  codeVerifier: text('code_verifier').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
});
