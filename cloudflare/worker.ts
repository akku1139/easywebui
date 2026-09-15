// Cloudflare Worker - AI Chat Backend
// Deploy with: npx wrangler deploy
// 
// Required bindings in wrangler.toml:
// - D1_DATABASE: AI_CHAT_DB
// - Environment variables: BASIC_AUTH_USER, BASIC_AUTH_PASS, OPENAI_API_KEY

export interface Env {
  AI_CHAT_DB: D1Database;
  BASIC_AUTH_USER: string;
  BASIC_AUTH_PASS: string;
  OPENAI_API_KEY: string;
  OPENAI_BASE_URL: string;
}

// Basic Auth middleware
function basicAuth(request: Request, env: Env): boolean {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Basic ')) return false;
  
  const decoded = atob(authHeader.slice(6));
  const [user, pass] = decoded.split(':');
  return user === env.BASIC_AUTH_USER && pass === env.BASIC_AUTH_PASS;
}

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Basic Auth check (skip for health check)
    const url = new URL(request.url);
    if (url.pathname !== '/health' && !basicAuth(request, env)) {
      return new Response('Unauthorized', {
        status: 401,
        headers: {
          'WWW-Authenticate': 'Basic realm="AI Chat"',
          ...corsHeaders,
        },
      });
    }

    // Route handling
    try {
      if (url.pathname === '/health') {
        return new Response(JSON.stringify({ status: 'ok' }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }

      // OpenAI Compatible API proxy
      if (url.pathname === '/v1/chat/completions') {
        return await handleChatCompletion(request, env);
      }

      // Memory API
      if (url.pathname === '/api/memory/facts') {
        return await handleMemoryFacts(request, env);
      }
      if (url.pathname === '/api/memory/summaries') {
        return await handleSummaries(request, env);
      }

      // Conversations API
      if (url.pathname === '/api/conversations') {
        return await handleConversations(request, env);
      }

      // MCP Server proxy
      if (url.pathname.startsWith('/api/mcp/')) {
        return await handleMCP(request, env);
      }

      return new Response('Not Found', { status: 404, headers: corsHeaders });
    } catch (error) {
      return new Response(JSON.stringify({ error: String(error) }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }
  },
};

// OpenAI Compatible Chat Completions with Memory Injection
async function handleChatCompletion(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as {
    messages: Array<{ role: string; content: string }>;
    model?: string;
    stream?: boolean;
    tools?: unknown[];
  };

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

  // Layer 2: User Facts
  if (facts.results.length > 0) {
    memoryParts.push('## About this user:');
    facts.results.forEach(f => memoryParts.push(`- ${f.content}`));
  }

  // Layer 3: Conversation Summaries
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
  const baseUrl = env.OPENAI_BASE_URL || 'https://api.openai.com';
  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  // Auto-extract memory after response (non-blocking)
  if (!body.stream) {
    const responseClone = response.clone();
    const data = await responseClone.json() as { choices: Array<{ message: { content: string } }> };
    const assistantContent = data.choices?.[0]?.message?.content;
    
    if (assistantContent && body.messages.length > 2) {
      // Extract and store new facts (fire-and-forget)
      extractAndStoreFacts(env, body.messages, assistantContent).catch(() => {});
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
  messages: Array<{ role: string; content: string }>,
  assistantResponse: string
): Promise<void> {
  const userMessages = messages.filter(m => m.role === 'user').map(m => m.content).join('\n');
  
  const extractionPrompt = `Extract important facts about the user from this conversation. Return one fact per line. Only include genuinely useful long-term information like preferences, personal details, projects, or goals. If nothing notable, return nothing.

User said: ${userMessages.slice(0, 2000)}
Assistant responded: ${assistantResponse.slice(0, 1000)}`;

  const baseUrl = env.OPENAI_BASE_URL || 'https://api.openai.com';
  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
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
    // Check if fact already exists
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
    return new Response(JSON.stringify(facts.results), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  if (request.method === 'POST') {
    const body = await request.json() as { content: string; category: string };
    const id = crypto.randomUUID();
    await env.AI_CHAT_DB
      .prepare('INSERT INTO user_facts (id, content, category, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(id, body.content, body.category || 'other', 'explicit', Date.now(), Date.now())
      .run();
    return new Response(JSON.stringify({ id, ...body }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  if (request.method === 'DELETE') {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (id) {
      await env.AI_CHAT_DB.prepare('DELETE FROM user_facts WHERE id = ?').bind(id).run();
    }
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  return new Response('Method not allowed', { status: 405, headers: corsHeaders });
}

// Conversation Summaries API
async function handleSummaries(request: Request, env: Env): Promise<Response> {
  if (request.method === 'GET') {
    const summaries = await env.AI_CHAT_DB
      .prepare('SELECT * FROM conversation_summaries ORDER BY created_at DESC LIMIT 50')
      .all();
    return new Response(JSON.stringify(summaries.results), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  if (request.method === 'POST') {
    const body = await request.json() as { title: string; summary: string; date: string; message_count: number };
    const id = crypto.randomUUID();
    await env.AI_CHAT_DB
      .prepare('INSERT INTO conversation_summaries (id, title, summary, date, message_count, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(id, body.title, body.summary, body.date, body.message_count, Date.now())
      .run();
    return new Response(JSON.stringify({ id, ...body }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  return new Response('Method not allowed', { status: 405, headers: corsHeaders });
}

// Conversations API
async function handleConversations(request: Request, env: Env): Promise<Response> {
  if (request.method === 'GET') {
    const conversations = await env.AI_CHAT_DB
      .prepare('SELECT id, title, model, created_at, updated_at FROM conversations ORDER BY updated_at DESC')
      .all();
    return new Response(JSON.stringify(conversations.results), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  if (request.method === 'POST') {
    const body = await request.json() as { title: string; messages: unknown[]; model: string };
    const id = crypto.randomUUID();
    await env.AI_CHAT_DB
      .prepare('INSERT INTO conversations (id, title, messages_json, model, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(id, body.title, JSON.stringify(body.messages), body.model, Date.now(), Date.now())
      .run();
    return new Response(JSON.stringify({ id, ...body }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  return new Response('Method not allowed', { status: 405, headers: corsHeaders });
}

// MCP Server proxy
async function handleMCP(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const serverUrl = url.searchParams.get('url');
  
  if (!serverUrl) {
    return new Response(JSON.stringify({ error: 'Missing server URL' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  // Proxy MCP requests to the actual server
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
