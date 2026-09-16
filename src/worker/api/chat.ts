import { Context } from 'hono';
import { Env } from '../index';

export async function chatCompletion(c: Context<{ Bindings: Env }>) {
  const body = await c.req.json();
  const { messages, model, stream } = body;
  
  const db = c.env.AI_CHAT_DB;
  
  // Fetch user memory facts
  const factsResult = await db.prepare(
    'SELECT content FROM user_facts ORDER BY updated_at DESC LIMIT 50'
  ).all();
  
  // Fetch conversation summaries
  const summariesResult = await db.prepare(
    'SELECT title, summary, date FROM conversation_summaries ORDER BY created_at DESC LIMIT 15'
  ).all();
  
  // Build memory context
  const memoryParts: string[] = [];
  
  if (factsResult.results.length > 0) {
    memoryParts.push('## About this user:');
    factsResult.results.forEach((f: any) => memoryParts.push(`- ${f.content}`));
  }
  
  if (summariesResult.results.length > 0) {
    memoryParts.push('\n## Recent conversations:');
    summariesResult.results.forEach((s: any) => {
      memoryParts.push(`- ${s.date}: "${s.title}" - ${s.summary}`);
    });
  }
  
  // Inject memory into system message
  if (memoryParts.length > 0) {
    const memoryContext = memoryParts.join('\n');
    const systemMsg = messages.find((m: any) => m.role === 'system');
    if (systemMsg) {
      systemMsg.content += '\n\n' + memoryContext;
    } else {
      messages.unshift({ role: 'system', content: memoryContext });
    }
  }
  
  // Get endpoint configuration
  let baseUrl = c.env.OPENAI_BASE_URL || 'https://api.openai.com';
  let apiKey = c.env.OPENAI_API_KEY;
  
  if (body.endpoint_id) {
    const endpoint = await db.prepare(
      'SELECT base_url, api_key FROM api_endpoints WHERE id = ? AND enabled = 1'
    ).bind(body.endpoint_id).first() as any;
    
    if (endpoint) {
      baseUrl = endpoint.base_url;
      apiKey = endpoint.api_key;
    }
  }
  
  // Proxy to OpenAI
  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ messages, model, stream }),
  });
  
  // Auto-extract memory (non-blocking)
  if (!stream) {
    const responseClone = response.clone();
    const data = await responseClone.json() as any;
    const assistantContent = data.choices?.[0]?.message?.content;
    
    if (assistantContent && messages.length > 2) {
      extractAndStoreFacts(c.env, messages, assistantContent).catch(() => {});
    }
  }
  
  return new Response(response.body, {
    status: response.status,
    headers: {
      'Content-Type': response.headers.get('Content-Type') || 'application/json',
    },
  });
}

async function extractAndStoreFacts(
  env: Env,
  messages: Array<{ role: string; content: string }>,
  assistantResponse: string
) {
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

  const data = await response.json() as any;
  const facts = data.choices?.[0]?.message?.content
    ?.split('\n')
    .map((l: string) => l.trim())
    .filter((l: string) => l.length > 5) || [];

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
