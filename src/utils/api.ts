import { Message, ToolCall, APIConfig } from '../types';

// OpenAI Compatible API client
export async function chatCompletion(
  config: APIConfig,
  messages: Message[],
  tools?: { name: string; description: string; inputSchema: Record<string, unknown> }[],
  onStream?: (chunk: string) => void
): Promise<{ content: string; toolCalls?: ToolCall[] }> {
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

  // Smart path construction to avoid double /v1/ and handle relative paths
  let url: string;
  
  // Check if baseUrl is a relative path (starts with /)
  if (config.baseUrl.startsWith('/')) {
    // Relative path - use as-is to avoid mixed-content issues
    if (config.baseUrl.endsWith('/v1')) {
      url = `${config.baseUrl}/chat/completions`;
    } else if (config.baseUrl.endsWith('/v1/')) {
      url = `${config.baseUrl}chat/completions`;
    } else {
      const baseUrl = config.baseUrl.replace(/\/$/, '');
      url = `${baseUrl}/v1/chat/completions`;
    }
  } else {
    // Absolute URL (external API)
    if (config.baseUrl.endsWith('/v1')) {
      url = `${config.baseUrl}/chat/completions`;
    } else if (config.baseUrl.endsWith('/v1/')) {
      url = `${config.baseUrl}chat/completions`;
    } else {
      const baseUrl = config.baseUrl.replace(/\/$/, '');
      url = `${baseUrl}/v1/chat/completions`;
    }
  }
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API Error: ${response.status} - ${error}`);
  }

  if (onStream) {
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

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') break;
        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices[0]?.delta;
          if (delta?.content) {
            content += delta.content;
            onStream(delta.content);
          }
        } catch {
          // skip parse errors
        }
      }
    }
  }

  return { content };
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
