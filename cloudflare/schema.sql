-- D1 Database Schema for AI Chat
-- Run: npx wrangler d1 execute ai-chat-db --file=schema.sql

-- User memory facts (Layer 2: permanent knowledge)
CREATE TABLE IF NOT EXISTS user_facts (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other',  -- preference, personal, work, project, other
  source TEXT NOT NULL DEFAULT 'explicit', -- explicit, auto_detected
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_facts_category ON user_facts(category);
CREATE INDEX IF NOT EXISTS idx_facts_updated ON user_facts(updated_at DESC);

-- Conversation summaries (Layer 3: recent conversation context)
CREATE TABLE IF NOT EXISTS conversation_summaries (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  date TEXT NOT NULL,
  message_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_summaries_created ON conversation_summaries(created_at DESC);

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

CREATE INDEX IF NOT EXISTS idx_conv_pinned ON conversations(pinned DESC);
CREATE INDEX IF NOT EXISTS idx_conv_updated ON conversations(updated_at DESC);

-- MCP Server configurations
CREATE TABLE IF NOT EXISTS mcp_servers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  tools_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'disconnected',
  last_checked INTEGER,
  created_at INTEGER NOT NULL
);

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

-- Auto-memory extraction log
CREATE TABLE IF NOT EXISTS memory_extraction_log (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  facts_extracted INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);

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

CREATE INDEX IF NOT EXISTS idx_endpoints_enabled ON api_endpoints(enabled);
CREATE INDEX IF NOT EXISTS idx_endpoints_default ON api_endpoints(is_default);
