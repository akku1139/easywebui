import { Context } from 'hono';
import { Env } from '../index';
import type { APIConfig } from '../../types';
import { loadModelSettings } from './model-settings';
import { completionUrl, fetchCompletionWithRetry } from '../../utils/completion-request';

export async function chatCompletion(c: Context<{ Bindings: Env }>) {
  const body = await c.req.json();
  if (!Array.isArray(body?.messages)) return c.json({ error: 'Messages must be an array' }, 400);
  const { messages, stream } = body;
  let saved;
  try { saved = await loadModelSettings(c); completionUrl(saved.config.baseUrl); }
  catch (error) { return c.json({ error: error instanceof Error ? error.message : 'Invalid saved model settings' }, 400); }
  const { settings, config } = saved;
  
  const db = c.env.AI_CHAT_DB;
  
  // Fetch user memory facts
  const factsResult = settings.memoryEnabled ? await db.prepare(
    'SELECT content FROM user_facts ORDER BY updated_at DESC LIMIT 50'
  ).all() : { results: [] };
  
  // Fetch conversation summaries
  const summariesResult = settings.memoryEnabled ? await db.prepare(
    'SELECT title, summary, date FROM conversation_summaries ORDER BY created_at DESC LIMIT 15'
  ).all() : { results: [] };
  
  // Build memory context
  const memoryParts: string[] = [];
  if (settings.customSystemPrompt?.trim()) {
    const system = messages.find((m: any) => m.role === 'system');
    if (system) system.content = settings.customSystemPrompt.trim();
    else messages.unshift({ role: 'system', content: settings.customSystemPrompt.trim() });
  }
  
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
  
  // Caller model/endpoint_id cannot bypass the saved active provider/model.
  const { model: _model, endpoint_id: _endpoint, ...options } = body;
  const response = await fetchCompletionWithRetry(completionUrl(config.baseUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}`, ...providerHeaders(config.baseUrl) },
    body: JSON.stringify({ ...options, messages, model: config.model, stream }),
  });

  // Auto-extract memory (non-blocking)
  if (!stream && response.ok && settings.memoryEnabled && settings.autoMemory) {
    const data = await response.clone().json().catch(() => null) as any;
    const assistantContent = data?.choices?.[0]?.message?.content;

    if (assistantContent && messages.some((m: any) => m.role === 'user')) {
      const extraction = extractAndStoreFacts(c.env, config, messages, assistantContent)
        .catch(error => { console.error('Automatic memory extraction failed:', error instanceof Error ? error.message : String(error)); });
      let ctx;
      try { ctx = c.executionCtx; } catch { /* Tests and non-Worker runtimes. */ }
      if (ctx) ctx.waitUntil(extraction); else await extraction;
    }
  }
  
  return new Response(response.body, {
    status: response.status,
    headers: {
      'Content-Type': response.headers.get('Content-Type') || 'application/json',
      ...(response.headers.get('Retry-After') ? { 'Retry-After': response.headers.get('Retry-After')! } : {}),
    },
  });
}

async function extractAndStoreFacts(
  env: Env,
  config: APIConfig,
  messages: Array<{ role: string; content: string }>,
  assistantResponse: string
) {
  const userMessages = messages.filter(m => m.role === 'user').map(m => m.content).join('\n');
  
  const extractionPrompt = `Extract important facts about the user from this conversation. Return one fact per line. Only include genuinely useful long-term information like preferences, personal details, projects, or goals. If nothing notable, return nothing.

User said: ${userMessages.slice(0, 2000)}
Assistant responded: ${assistantResponse.slice(0, 1000)}`;

  const response = await fetchCompletionWithRetry(completionUrl(config.baseUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}`, ...providerHeaders(config.baseUrl) },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: 'You are a memory extraction system. Be concise and factual.' },
        { role: 'user', content: extractionPrompt },
      ],
      max_tokens: 500,
    }),
  });
  if (!response.ok) { await response.body?.cancel(); throw new Error(`Memory extraction API returned HTTP ${response.status}`); }

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
          'other',
          'auto_detected',
          Math.floor(Date.now() / 1000),
          Math.floor(Date.now() / 1000)
        )
        .run();
    }
  }
}
import { providerHeaders } from '../../utils/provider-headers';
