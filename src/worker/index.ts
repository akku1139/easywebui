import { Hono } from 'hono';
import { basicAuth } from 'hono/basic-auth';
import { cors } from 'hono/cors';
import { chatCompletion } from './api/chat';
import { handleMemoryFacts, handleSummaries } from './api/memory';
import { handleConversations } from './api/conversations';
import { handleMCPServers } from './api/mcp';
import { handleMCPConnect } from './api/mcp-connect';
import { handleMCPToolCall } from './api/mcp-tools';
import { handleMCPOAuth } from './api/mcp-oauth';
import { handleEndpoints } from './api/endpoints';
import { handleSettings } from './api/settings';

export interface Env {
  // Database
  AI_CHAT_DB: D1Database;
  
  // Auth
  BASIC_AUTH_USER: string;
  BASIC_AUTH_PASS: string;
  
  // OpenAI
  OPENAI_API_KEY: string;
  OPENAI_BASE_URL: string;
}

const app = new Hono<{ Bindings: Env }>();

// CORS
app.use('*', cors());

// Basic Auth
app.use(
  '*',
  basicAuth({
    verifyUser: (username, password, c) => {
      return (
        username === c.env.BASIC_AUTH_USER &&
        password === c.env.BASIC_AUTH_PASS
      );
    },
  })
);

// Health check
app.get('/api/health', (c) => c.json({ status: 'ok' }));

// Chat completions
app.post('/api/v1/chat/completions', chatCompletion);

// Memory
app.get('/api/memory/facts', handleMemoryFacts);
app.post('/api/memory/facts', handleMemoryFacts);
app.delete('/api/memory/facts', handleMemoryFacts);
app.get('/api/memory/summaries', handleSummaries);
app.post('/api/memory/summaries', handleSummaries);

// Conversations
app.get('/api/conversations', handleConversations);
app.post('/api/conversations', handleConversations);
app.patch('/api/conversations', handleConversations);
app.delete('/api/conversations', handleConversations);

// MCP
app.get('/api/mcp-servers', handleMCPServers);
app.post('/api/mcp-servers/connect', handleMCPConnect);
app.post('/api/mcp-servers/call', handleMCPToolCall);
app.post('/api/mcp-servers', handleMCPServers);
app.patch('/api/mcp-servers', handleMCPServers);
app.delete('/api/mcp-servers', handleMCPServers);
app.post('/api/mcp-oauth/register', handleMCPOAuth);
app.post('/api/mcp-oauth/initiate', handleMCPOAuth);
app.get('/api/mcp-oauth/callback', handleMCPOAuth);
app.post('/api/mcp-oauth/callback', handleMCPOAuth);
app.post('/api/mcp-oauth/discover', handleMCPOAuth);

// Endpoints
app.get('/api/endpoints', handleEndpoints);
app.post('/api/endpoints', handleEndpoints);
app.patch('/api/endpoints', handleEndpoints);
app.delete('/api/endpoints', handleEndpoints);

// Settings
app.get('/api/settings', handleSettings);
app.post('/api/settings', handleSettings);

// 404
app.notFound((c) => c.json({ error: 'Not Found' }, 404));

// Error handler
app.onError((err, c) => {
  // Handle HTTPException from basicAuth middleware
  if (err instanceof Error && 'status' in err && err.status === 401) {
    return c.text('Unauthorized', 401, {
      'WWW-Authenticate': 'Basic realm="AI Chat"',
    });
  }
  console.error('Unhandled error:', err);
  return c.json({ error: err.message }, 500);
});

export default app;
