-- Initial migration: Create base tables
-- This is the initial schema for the AI Chat application

-- User memory facts (Layer 2: permanent knowledge)
CREATE TABLE IF NOT EXISTS user_facts (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other',
  source TEXT NOT NULL DEFAULT 'explicit',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_facts_category ON user_facts(category);
CREATE INDEX IF NOT EXISTS idx_user_facts_updated ON user_facts(updated_at DESC);

-- Conversation summaries (Layer 3: recent conversation context)
CREATE TABLE IF NOT EXISTS conversation_summaries (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  date TEXT NOT NULL,
  message_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_conversation_summaries_created ON conversation_summaries(created_at DESC);

-- Conversations (Layer 4: current session messages)
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  messages_json TEXT NOT NULL DEFAULT '[]',
  model TEXT NOT NULL DEFAULT 'gpt-4o',
  pinned INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_conversations_pinned ON conversations(pinned DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_updated ON conversations(updated_at DESC);

-- MCP Server configurations
CREATE TABLE IF NOT EXISTS mcp_servers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  tools_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'disconnected',
  last_checked INTEGER,
  created_at INTEGER NOT NULL,
  oauth_enabled INTEGER NOT NULL DEFAULT 0,
  oauth_client_id TEXT,
  oauth_client_secret TEXT,
  oauth_token_endpoint TEXT,
  oauth_auth_endpoint TEXT,
  oauth_access_token TEXT,
  oauth_refresh_token TEXT,
  oauth_token_expires_at INTEGER,
  oauth_scopes TEXT
);

CREATE INDEX IF NOT EXISTS idx_mcp_servers_enabled ON mcp_servers(enabled);

-- API Endpoints
CREATE TABLE IF NOT EXISTS api_endpoints (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  base_url TEXT NOT NULL,
  api_key TEXT NOT NULL,
  model TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_api_endpoints_enabled ON api_endpoints(enabled);
CREATE INDEX IF NOT EXISTS idx_api_endpoints_default ON api_endpoints(is_default);

-- Session metadata (Layer 1: temporary session info)
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  device TEXT,
  browser TEXT,
  timezone TEXT,
  language TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

-- Auto-memory extraction log
CREATE TABLE IF NOT EXISTS memory_extraction_log (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  facts_extracted INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_memory_extraction_log_conversation ON memory_extraction_log(conversation_id);

-- OAuth state storage for MCP servers
CREATE TABLE IF NOT EXISTS oauth_states (
  id TEXT PRIMARY KEY,
  server_id TEXT NOT NULL,
  state TEXT NOT NULL,
  code_verifier TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_oauth_states_server ON oauth_states(server_id);
CREATE INDEX IF NOT EXISTS idx_oauth_states_expires ON oauth_states(expires_at);
