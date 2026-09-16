// Cloudflare Pages Functions - API Handler
// This replaces the separate Worker with Pages Functions
// Note: Basic Auth is handled by _middleware.ts for all routes

export interface Env {
  AI_CHAT_DB: D1Database;
  BASIC_AUTH_USER: string;
  BASIC_AUTH_PASS: string;
  OPENAI_API_KEY: string;
  OPENAI_BASE_URL: string;
}

// Catch-all API route handler
export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);
  const pathname = url.pathname;

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Route handling
  try {
    if (pathname === '/api/health') {
      return jsonResponse({ status: 'ok' });
    }

    // OpenAI Compatible API proxy
    if (pathname === '/api/v1/chat/completions') {
      return await handleChatCompletion(request, env);
    }

    // Memory API
    if (pathname === '/api/memory/facts') {
      return await handleMemoryFacts(request, env);
    }
    if (pathname === '/api/memory/summaries') {
      return await handleSummaries(request, env);
    }

    // Conversations API
    if (pathname === '/api/conversations') {
      return await handleConversations(request, env);
    }

    // MCP Server proxy
    if (pathname.startsWith('/api/mcp/')) {
      return await handleMCP(request, env);
    }

    // MCP OAuth endpoints
    if (pathname === '/api/mcp-oauth/initiate') {
      return await handleMCPOAuthInitiate(request, env);
    }
    if (pathname === '/api/mcp-oauth/callback') {
      return await handleMCPOAuthCallback(request, env);
    }
    if (pathname === '/api/mcp-oauth/discover') {
      return await handleMCPOAuthDiscover(request, env);
    }

    // API Endpoints management
    if (pathname === '/api/endpoints') {
      return await handleEndpoints(request, env);
    }

    return new Response('Not Found', { status: 404, headers: corsHeaders });
  } catch (error) {
    return jsonResponse({ error: String(error) }, 500);
  }
};

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Helper functions
function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

// OpenAI Compatible Chat Completions with Memory Injection
async function handleChatCompletion(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as {
    messages: Array<{ role: string; content: string }>;
    model?: string;
    stream?: boolean;
    tools?: unknown[];
    endpoint_id?: string;
  };

  // Get endpoint configuration
  let endpointConfig = {
    baseUrl: env.OPENAI_BASE_URL || 'https://api.openai.com',
    apiKey: env.OPENAI_API_KEY,
    model: body.model || 'gpt-4o',
  };

  // If endpoint_id is provided, use that endpoint from DB
  if (body.endpoint_id) {
    const endpoint = await env.AI_CHAT_DB
      .prepare('SELECT * FROM api_endpoints WHERE id = ? AND enabled = 1')
      .bind(body.endpoint_id)
      .first<{ base_url: string; api_key: string; model: string }>();
    
    if (endpoint) {
      endpointConfig = {
        baseUrl: endpoint.base_url,
        apiKey: endpoint.api_key,
        model: endpoint.model,
      };
    }
  } else {
    // Use default endpoint from DB if available
    const defaultEndpoint = await env.AI_CHAT_DB
      .prepare('SELECT * FROM api_endpoints WHERE is_default = 1 AND enabled = 1 LIMIT 1')
      .first<{ base_url: string; api_key: string; model: string }>();
    
    if (defaultEndpoint) {
      endpointConfig = {
        baseUrl: defaultEndpoint.base_url,
        apiKey: defaultEndpoint.api_key,
        model: defaultEndpoint.model,
      };
    }
  }

  // Fetch user memory facts from D1
  const facts = await env.AI_CHAT_DB
    .prepare('SELECT content FROM user_facts ORDER BY updated_at DESC LIMIT 50')
    .all<{ content: string }>();

  // Fetch recent conversation summaries
  const summaries = await env.AI_CHAT_DB
    .prepare('SELECT title, summary, date FROM conversation_summaries ORDER BY created_at DESC LIMIT 15')
    .all<{ title: string; summary: string; date: string }>();

  // Build memory-enhanced system prompt (ChatGPT 4-layer approach)
  const memoryParts: string[] = [];

  // Layer 2: User Facts (sorted for prefix cache stability)
  if (facts.results.length > 0) {
    memoryParts.push('## About this user:');
    facts.results.forEach(f => memoryParts.push(`- ${f.content}`));
  }

  // Layer 3: Conversation Summaries (sorted for prefix cache stability)
  if (summaries.results.length > 0) {
    memoryParts.push('\n## Recent conversations:');
    summaries.results.forEach(s => {
      memoryParts.push(`- ${s.date}: "${s.title}" - ${s.summary}`);
    });
  }

  // Inject memory into system message
  if (memoryParts.length > 0) {
    const memoryContext = memoryParts.join('\n');
    const systemMsg = body.messages.find(m => m.role === 'system');
    if (systemMsg) {
      systemMsg.content += '\n\n' + memoryContext;
    } else {
      body.messages.unshift({
        role: 'system',
        content: memoryContext,
      });
    }
  }

  // Proxy to OpenAI-compatible endpoint
  const response = await fetch(`${endpointConfig.baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${endpointConfig.apiKey}`,
    },
    body: JSON.stringify({
      ...body,
      model: endpointConfig.model,
    }),
  });

  // Auto-extract memory after response (non-blocking)
  if (!body.stream) {
    const responseClone = response.clone();
    const data = await responseClone.json() as { choices: Array<{ message: { content: string } }> };
    const assistantContent = data.choices?.[0]?.message?.content;
    
    if (assistantContent && body.messages.length > 2) {
      extractAndStoreFacts(env, endpointConfig, body.messages, assistantContent).catch(() => {});
    }
  }

  return new Response(response.body, {
    status: response.status,
    headers: {
      'Content-Type': response.headers.get('Content-Type') || 'application/json',
      ...corsHeaders,
    },
  });
}

// Extract facts from conversation using LLM
async function extractAndStoreFacts(
  env: Env,
  endpointConfig: { baseUrl: string; apiKey: string; model: string },
  messages: Array<{ role: string; content: string }>,
  assistantResponse: string
): Promise<void> {
  const userMessages = messages.filter(m => m.role === 'user').map(m => m.content).join('\n');
  
  const extractionPrompt = `Extract important facts about the user from this conversation. Return one fact per line. Only include genuinely useful long-term information like preferences, personal details, projects, or goals. If nothing notable, return nothing.

User said: ${userMessages.slice(0, 2000)}
Assistant responded: ${assistantResponse.slice(0, 1000)}`;

  const response = await fetch(`${endpointConfig.baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${endpointConfig.apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a memory extraction system. Be concise and factual.' },
        { role: 'user', content: extractionPrompt },
      ],
      max_tokens: 500,
    }),
  });

  const data = await response.json() as { choices: Array<{ message: { content: string } }> };
  const facts = data.choices?.[0]?.message?.content
    ?.split('\n')
    .map((l: string) => l.trim())
    .filter((l: string) => l.length > 5) || [];

  // Store new facts in D1
  for (const fact of facts) {
    const existing = await env.AI_CHAT_DB
      .prepare('SELECT id FROM user_facts WHERE content = ?')
      .bind(fact)
      .first();

    if (!existing) {
      await env.AI_CHAT_DB
        .prepare('INSERT INTO user_facts (id, content, category, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(
          crypto.randomUUID(),
          fact,
          'auto_detected',
          'auto',
          Date.now(),
          Date.now()
        )
        .run();
    }
  }
}

// Memory Facts API
async function handleMemoryFacts(request: Request, env: Env): Promise<Response> {
  if (request.method === 'GET') {
    const facts = await env.AI_CHAT_DB
      .prepare('SELECT * FROM user_facts ORDER BY updated_at DESC')
      .all();
    return jsonResponse(facts.results);
  }

  if (request.method === 'POST') {
    const body = await request.json() as { content: string; category: string };
    const id = crypto.randomUUID();
    await env.AI_CHAT_DB
      .prepare('INSERT INTO user_facts (id, content, category, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(id, body.content, body.category || 'other', 'explicit', Date.now(), Date.now())
      .run();
    return jsonResponse({ id, ...body });
  }

  if (request.method === 'DELETE') {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (id) {
      await env.AI_CHAT_DB.prepare('DELETE FROM user_facts WHERE id = ?').bind(id).run();
    }
    return jsonResponse({ ok: true });
  }

  return new Response('Method not allowed', { status: 405, headers: corsHeaders });
}

// MCP OAuth 2.1 Handlers
// Based on MCP Authorization Specification (2025-06-18)

// Initiate OAuth flow for MCP server
async function handleMCPOAuthInitiate(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  const body = await request.json() as {
    serverId: string;
    redirectUri?: string;
  };

  const { serverId, redirectUri } = body;

  // Get MCP server configuration
  const server = await env.AI_CHAT_DB
    .prepare('SELECT * FROM mcp_servers WHERE id = ?')
    .bind(serverId)
    .first<{
      id: string;
      url: string;
      oauth_enabled: number;
      oauth_client_id: string;
      oauth_auth_endpoint: string;
      oauth_scopes: string;
    }>();

  if (!server) {
    return jsonResponse({ error: 'MCP server not found' }, 404);
  }

  if (!server.oauth_enabled) {
    return jsonResponse({ error: 'OAuth is not enabled for this server' }, 400);
  }

  if (!server.oauth_auth_endpoint || !server.oauth_client_id) {
    return jsonResponse({ error: 'OAuth configuration incomplete' }, 400);
  }

  // Generate PKCE parameters
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const state = generateState();

  // Store state for validation
  const now = Date.now();
  const expiresAt = now + 10 * 60 * 1000; // 10 minutes

  await env.AI_CHAT_DB
    .prepare('INSERT INTO oauth_states (id, server_id, state, code_verifier, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), serverId, state, codeVerifier, now, expiresAt)
    .run();

  // Build authorization URL
  const finalRedirectUri = redirectUri || `${new URL(request.url).origin}/mcp-oauth-callback`;
  const authUrl = buildAuthorizationUrl(
    server.oauth_auth_endpoint,
    server.oauth_client_id,
    finalRedirectUri,
    state,
    codeChallenge,
    server.oauth_scopes || undefined
  );

  return jsonResponse({
    authorizationUrl: authUrl,
    state,
  });
}

// Handle OAuth callback
async function handleMCPOAuthCallback(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  if (error) {
    return jsonResponse({ error: `OAuth error: ${error}` }, 400);
  }

  if (!code || !state) {
    return jsonResponse({ error: 'Missing code or state parameter' }, 400);
  }

  // Retrieve and validate state
  const now = Date.now();
  const stateData = await env.AI_CHAT_DB
    .prepare('SELECT * FROM oauth_states WHERE state = ? AND expires_at > ?')
    .bind(state, now)
    .first<{
      id: string;
      server_id: string;
      code_verifier: string;
    }>();

  if (!stateData) {
    return jsonResponse({ error: 'Invalid or expired state' }, 400);
  }

  // Delete used state
  await env.AI_CHAT_DB
    .prepare('DELETE FROM oauth_states WHERE id = ?')
    .bind(stateData.id)
    .run();

  // Get MCP server configuration
  const server = await env.AI_CHAT_DB
    .prepare('SELECT * FROM mcp_servers WHERE id = ?')
    .bind(stateData.server_id)
    .first<{
      id: string;
      oauth_client_id: string;
      oauth_client_secret: string;
      oauth_token_endpoint: string;
    }>();

  if (!server || !server.oauth_token_endpoint) {
    return jsonResponse({ error: 'Server configuration not found' }, 404);
  }

  // Exchange code for tokens
  try {
    const tokenResponse = await fetch(server.oauth_token_endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        code_verifier: stateData.code_verifier,
        client_id: server.oauth_client_id,
        ...(server.oauth_client_secret ? { client_secret: server.oauth_client_secret } : {}),
      }).toString(),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      return jsonResponse({ error: `Token exchange failed: ${errorText}` }, 400);
    }

    const tokens = await tokenResponse.json() as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
    };

    const expiresAt = tokens.expires_in
      ? Date.now() + tokens.expires_in * 1000
      : null;

    // Update MCP server with tokens
    await env.AI_CHAT_DB
      .prepare('UPDATE mcp_servers SET oauth_access_token = ?, oauth_refresh_token = ?, oauth_token_expires_at = ?, oauth_scopes = ? WHERE id = ?')
      .bind(
        tokens.access_token,
        tokens.refresh_token || null,
        expiresAt,
        tokens.scope || null,
        stateData.server_id
      )
      .run();

    return jsonResponse({
      success: true,
      message: 'OAuth authentication successful',
    });
  } catch (error) {
    return jsonResponse({ error: `Token exchange failed: ${String(error)}` }, 500);
  }
}

// Discover OAuth metadata from MCP server
async function handleMCPOAuthDiscover(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  const body = await request.json() as { serverUrl: string };

  if (!body.serverUrl) {
    return jsonResponse({ error: 'Missing serverUrl' }, 400);
  }

  try {
    // Try well-known OAuth metadata endpoint
    const metadataUrl = new URL('/.well-known/oauth-authorization-server', body.serverUrl);
    const response = await fetch(metadataUrl.toString());

    if (response.ok) {
      const metadata = await response.json() as {
        authorization_endpoint?: string;
        token_endpoint?: string;
      };

      if (metadata.authorization_endpoint && metadata.token_endpoint) {
        return jsonResponse({
          authorizationEndpoint: metadata.authorization_endpoint,
          tokenEndpoint: metadata.token_endpoint,
        });
      }
    }

    // Fallback: try OpenID Connect discovery
    const oidcUrl = new URL('/.well-known/openid-configuration', body.serverUrl);
    const oidcResponse = await fetch(oidcUrl.toString());

    if (oidcResponse.ok) {
      const oidcMetadata = await oidcResponse.json() as {
        authorization_endpoint?: string;
        token_endpoint?: string;
      };

      if (oidcMetadata.authorization_endpoint && oidcMetadata.token_endpoint) {
        return jsonResponse({
          authorizationEndpoint: oidcMetadata.authorization_endpoint,
          tokenEndpoint: oidcMetadata.token_endpoint,
        });
      }
    }

    return jsonResponse({ error: 'OAuth metadata not found' }, 404);
  } catch (error) {
    return jsonResponse({ error: `Discovery failed: ${String(error)}` }, 500);
  }
}

// PKCE utility functions
function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64UrlEncode(array);
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(new Uint8Array(digest));
}

function generateState(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return base64UrlEncode(array);
}

function base64UrlEncode(buffer: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...buffer));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function buildAuthorizationUrl(
  authEndpoint: string,
  clientId: string,
  redirectUri: string,
  state: string,
  codeChallenge: string,
  scopes?: string
): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  if (scopes) {
    params.append('scope', scopes);
  }

  return `${authEndpoint}?${params.toString()}`;
}

// Conversation Summaries API
async function handleSummaries(request: Request, env: Env): Promise<Response> {
  if (request.method === 'GET') {
    const summaries = await env.AI_CHAT_DB
      .prepare('SELECT * FROM conversation_summaries ORDER BY created_at DESC LIMIT 50')
      .all();
    return jsonResponse(summaries.results);
  }

  if (request.method === 'POST') {
    const body = await request.json() as { title: string; summary: string; date: string; message_count: number };
    const id = crypto.randomUUID();
    await env.AI_CHAT_DB
      .prepare('INSERT INTO conversation_summaries (id, title, summary, date, message_count, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(id, body.title, body.summary, body.date, body.message_count, Date.now())
      .run();
    return jsonResponse({ id, ...body });
  }

  return new Response('Method not allowed', { status: 405, headers: corsHeaders });
}

// Conversations API
async function handleConversations(request: Request, env: Env): Promise<Response> {
  if (request.method === 'GET') {
    const conversations = await env.AI_CHAT_DB
      .prepare('SELECT id, title, model, pinned, created_at, updated_at FROM conversations ORDER BY pinned DESC, updated_at DESC')
      .all();
    return jsonResponse(conversations.results);
  }

  if (request.method === 'POST') {
    const body = await request.json() as { title: string; messages: unknown[]; model: string; pinned?: boolean };
    const id = crypto.randomUUID();
    await env.AI_CHAT_DB
      .prepare('INSERT INTO conversations (id, title, messages_json, model, pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(id, body.title, JSON.stringify(body.messages), body.model, body.pinned ? 1 : 0, Date.now(), Date.now())
      .run();
    return jsonResponse({ id, ...body });
  }

  if (request.method === 'PATCH') {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (!id) {
      return jsonResponse({ error: 'Missing conversation ID' }, 400);
    }
    
    const body = await request.json() as { pinned?: boolean; title?: string };
    
    if (body.pinned !== undefined) {
      await env.AI_CHAT_DB
        .prepare('UPDATE conversations SET pinned = ?, updated_at = ? WHERE id = ?')
        .bind(body.pinned ? 1 : 0, Date.now(), id)
        .run();
    }
    
    if (body.title !== undefined) {
      await env.AI_CHAT_DB
        .prepare('UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?')
        .bind(body.title, Date.now(), id)
        .run();
    }
    
    return jsonResponse({ ok: true });
  }

  return new Response('Method not allowed', { status: 405, headers: corsHeaders });
}

// MCP Server proxy
async function handleMCP(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const serverUrl = url.searchParams.get('url');
  
  if (!serverUrl) {
    return jsonResponse({ error: 'Missing server URL' }, 400);
  }

  const mcpResponse = await fetch(serverUrl, {
    method: request.method,
    headers: {
      'Content-Type': 'application/json',
    },
    body: request.method !== 'GET' ? await request.text() : undefined,
  });

  return new Response(mcpResponse.body, {
    status: mcpResponse.status,
    headers: {
      'Content-Type': mcpResponse.headers.get('Content-Type') || 'application/json',
      ...corsHeaders,
    },
  });
}

// API Endpoints management
async function handleEndpoints(request: Request, env: Env): Promise<Response> {
  if (request.method === 'GET') {
    const endpoints = await env.AI_CHAT_DB
      .prepare('SELECT * FROM api_endpoints ORDER BY is_default DESC, created_at ASC')
      .all();
    return jsonResponse(endpoints.results);
  }

  if (request.method === 'POST') {
    const body = await request.json() as {
      name: string;
      base_url: string;
      api_key: string;
      model: string;
      enabled?: boolean;
      is_default?: boolean;
    };
    const id = crypto.randomUUID();
    
    // If this is set as default, unset other defaults
    if (body.is_default) {
      await env.AI_CHAT_DB
        .prepare('UPDATE api_endpoints SET is_default = 0')
        .run();
    }
    
    await env.AI_CHAT_DB
      .prepare('INSERT INTO api_endpoints (id, name, base_url, api_key, model, enabled, is_default, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(
        id,
        body.name,
        body.base_url,
        body.api_key,
        body.model,
        body.enabled ? 1 : 0,
        body.is_default ? 1 : 0,
        Date.now()
      )
      .run();
    return jsonResponse({ id, ...body });
  }

  if (request.method === 'PATCH') {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (!id) {
      return jsonResponse({ error: 'Missing endpoint ID' }, 400);
    }
    
    const body = await request.json() as {
      name?: string;
      base_url?: string;
      api_key?: string;
      model?: string;
      enabled?: boolean;
      is_default?: boolean;
    };
    
    // If setting as default, unset other defaults
    if (body.is_default) {
      await env.AI_CHAT_DB
        .prepare('UPDATE api_endpoints SET is_default = 0')
        .run();
    }
    
    const updates: string[] = [];
    const values: unknown[] = [];
    
    if (body.name !== undefined) { updates.push('name = ?'); values.push(body.name); }
    if (body.base_url !== undefined) { updates.push('base_url = ?'); values.push(body.base_url); }
    if (body.api_key !== undefined) { updates.push('api_key = ?'); values.push(body.api_key); }
    if (body.model !== undefined) { updates.push('model = ?'); values.push(body.model); }
    if (body.enabled !== undefined) { updates.push('enabled = ?'); values.push(body.enabled ? 1 : 0); }
    if (body.is_default !== undefined) { updates.push('is_default = ?'); values.push(body.is_default ? 1 : 0); }
    
    if (updates.length > 0) {
      values.push(id);
      await env.AI_CHAT_DB
        .prepare(`UPDATE api_endpoints SET ${updates.join(', ')} WHERE id = ?`)
        .bind(...values as string[])
        .run();
    }
    
    return jsonResponse({ ok: true });
  }

  if (request.method === 'DELETE') {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (id) {
      await env.AI_CHAT_DB.prepare('DELETE FROM api_endpoints WHERE id = ?').bind(id).run();
    }
    return jsonResponse({ ok: true });
  }

  return new Response('Method not allowed', { status: 405, headers: corsHeaders });
}
