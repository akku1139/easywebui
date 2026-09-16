import { Hono } from 'hono';
import { basicAuth } from 'hono/basic-auth';
import { cors } from 'hono/cors';
import { chatCompletion } from './api/chat';
import { handleMemoryFacts, handleSummaries } from './api/memory';
import { handleConversations } from './api/conversations';
import { handleMCPServers, handleMCPOAuth } from './api/mcp';
import { handleEndpoints } from './api/endpoints';

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

// Basic Auth (skip for health check)
app.use('*', async (c, next) => {
  const path = c.req.path;
  
  // Skip auth for health check
  if (path === '/api/health') {
    await next();
    return;
  }
  
  const authHeader = c.req.header('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return c.text('Unauthorized', 401, {
      'WWW-Authenticate': 'Basic realm="AI Chat"',
    });
  }
  
  const decoded = atob(authHeader.slice(6));
  const [user, pass] = decoded.split(':');
  
  if (user !== c.env.BASIC_AUTH_USER || pass !== c.env.BASIC_AUTH_PASS) {
    return c.text('Unauthorized', 401, {
      'WWW-Authenticate': 'Basic realm="AI Chat"',
    });
  }
  
  await next();
});

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

// MCP
app.get('/api/mcp-servers', handleMCPServers);
app.post('/api/mcp-servers', handleMCPServers);
app.patch('/api/mcp-servers', handleMCPServers);
app.delete('/api/mcp-servers', handleMCPServers);
app.post('/api/mcp-oauth/initiate', handleMCPOAuth);
app.get('/api/mcp-oauth/callback', handleMCPOAuth);
app.post('/api/mcp-oauth/discover', handleMCPOAuth);

// Endpoints
app.get('/api/endpoints', handleEndpoints);
app.post('/api/endpoints', handleEndpoints);
app.patch('/api/endpoints', handleEndpoints);
app.delete('/api/endpoints', handleEndpoints);

// 404
app.notFound((c) => c.json({ error: 'Not Found' }, 404));

// Error handler
app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return c.json({ error: err.message }, 500);
});

export default app;
