import { Message, ToolCall, APIConfig } from '../types';
import { providerHeaders } from './provider-headers';
import { completionUrl, fetchCompletionWithRetry, RateLimitError } from './completion-request';

// OpenAI Compatible API client
export async function chatCompletion(
  config: APIConfig,
  messages: Message[],
  tools?: { name: string; description: string; inputSchema: Record<string, unknown> }[],
  onStream?: (chunk: string) => void,
  onRetry?: (delayMs: number, retry: number) => void,
): Promise<{ content: string; toolCalls?: ToolCall[] }> {
  if (!config.model?.trim() || !config.baseUrl?.trim()) throw new Error('Configure a provider and model in Settings.');
  const formattedMessages = messages.map(m => ({
    role: m.role,
    content: m.content,
    ...(m.toolCalls ? { tool_calls: m.toolCalls.map(tc => ({
      id: tc.id,
      type: 'function',
      function: { name: tc.name, arguments: JSON.stringify(tc.arguments) }
    }))} : {}),
    ...(m.toolResult ? { tool_call_id: m.toolResult.toolCallId, content: m.toolResult.content } : {})
  }));

  const body: Record<string, unknown> = {
    model: config.model,
    messages: formattedMessages,
    stream: !!onStream,
  };

  if (tools && tools.length > 0) {
    body.tools = tools.map(t => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.inputSchema,
      }
    }));
  }

  const response = await fetchCompletionWithRetry(completionUrl(config.baseUrl), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
      ...providerHeaders(config.baseUrl),
    },
    body: JSON.stringify(body),
  }, onRetry);

  if (response.status === 429) {
    await response.body?.cancel();
    throw new RateLimitError(response.headers.get('Retry-After'));
  }
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API Error: ${response.status} - ${error}`);
  }

  if (onStream && response.body) {
    return handleStreamResponse(response, onStream);
  }

  const data = await response.json() as {
    choices: Array<{
      message: {
        content: string | null;
        tool_calls?: Array<{
          id: string;
          function: { name: string; arguments: string };
        }>;
      };
    }>;
  };
  const choice = data.choices[0];
  const message = choice.message;

  const toolCalls: ToolCall[] = message.tool_calls?.map((tc: {
    id: string;
    function: { name: string; arguments: string };
  }) => ({
    id: tc.id,
    name: tc.function.name,
    arguments: JSON.parse(tc.function.arguments),
    serverId: '',
  })) || [];

  return {
    content: message.content || '',
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
  };
}

async function handleStreamResponse(
  response: Response,
  onStream: (chunk: string) => void
): Promise<{ content: string; toolCalls?: ToolCall[] }> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let content = '';
  let buffer = '';
  const calls = new Map<number, { id: string; name: string; args: string }>();
  const finish = () => {
    const toolCalls = [...calls.entries()].sort(([a], [b]) => a - b).map(([, call]) => {
      if (!call.id || !call.name) throw new Error('Incomplete streamed tool call');
      let args: Record<string, unknown>;
      try {
        args = JSON.parse(call.args);
        if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error();
      } catch { throw new Error('Stream contained invalid tool call arguments'); }
      return { id: call.id, name: call.name, arguments: args, serverId: '' };
    });
    if (new Set(toolCalls.map(call => call.id)).size !== toolCalls.length) throw new Error('Duplicate tool call id');
    return { content, toolCalls: toolCalls.length ? toolCalls : undefined };
  };
  const consume = (line: string) => {
    if (!line.startsWith('data:')) return false;
    const data = line.slice(5).trim();
    if (data === '[DONE]') return true;
    if (!data) return false;
    let parsed;
    try { parsed = JSON.parse(data); } catch { throw new Error('Invalid completion stream JSON'); }
    if (parsed.error) throw new Error(parsed.error.message || 'Completion stream failed');
    const choice = parsed.choices?.find((c: { index?: number }) => c.index === undefined || c.index === 0);
    const delta = choice?.delta;
    if (typeof delta?.content === 'string') {
      content += delta.content;
      onStream(delta.content);
    }
    for (const tc of delta?.tool_calls ?? []) {
      if (!Number.isInteger(tc.index) || tc.index < 0) throw new Error('Invalid streamed tool call index');
      const slot = calls.get(tc.index) ?? { id: '', name: '', args: '' };
      if (typeof tc.id === 'string') slot.id += tc.id;
      if (typeof tc.function?.name === 'string') slot.name += tc.function.name;
      if (typeof tc.function?.arguments === 'string') slot.args += tc.function.arguments;
      calls.set(tc.index, slot);
    }
    return false;
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) if (consume(line.replace(/\r$/, ''))) return finish();
      if (done) {
        if (buffer) consume(buffer.replace(/\r$/, ''));
        return finish();
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

// Memory extraction - uses LLM to extract facts from conversation
export async function extractMemoryFacts(
  config: APIConfig,
  messages: Message[]
): Promise<string[]> {
  const systemPrompt = `You are a memory extraction system. Analyze the conversation and extract important facts about the user that should be remembered long-term.
Extract facts like:
- Personal information (name, age, location)
- Preferences (likes, dislikes, habits)
- Work/projects they're working on
- Goals and aspirations
- Technical preferences

Return each fact as a separate line. If no notable facts, return empty.
Focus on information that would be useful in future conversations.`;

  const conversationText = messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => `${m.role}: ${m.content}`)
    .join('\n');

  const response = await chatCompletion(config, [
    { id: '1', role: 'system', content: systemPrompt, timestamp: Date.now() },
    { id: '2', role: 'user', content: conversationText, timestamp: Date.now() }
  ]);

  return response.content
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith('No notable'));
}

// Conversation summarization
export async function summarizeConversation(
  config: APIConfig,
  messages: Message[]
): Promise<{ title: string; summary: string }> {
  const systemPrompt = `Summarize this conversation in two parts:
1. A short title (max 6 words)
2. A brief summary (2-3 bullet points)

Format:
TITLE: [title]
SUMMARY:
- [point 1]
- [point 2]`;

  const conversationText = messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => `${m.role}: ${m.content.slice(0, 200)}`)
    .join('\n');

  const response = await chatCompletion(config, [
    { id: '1', role: 'system', content: systemPrompt, timestamp: Date.now() },
    { id: '2', role: 'user', content: conversationText, timestamp: Date.now() }
  ]);

  const titleMatch = response.content.match(/TITLE:\s*(.+)/);
  const summaryMatch = response.content.match(/SUMMARY:\s*([\s\S]+)/);

  return {
    title: titleMatch?.[1]?.trim() || 'Conversation',
    summary: summaryMatch?.[1]?.trim() || response.content,
  };
}
