import { describe, it, expect, vi, beforeEach } from 'vitest';
import { chatCompletion, extractMemoryFacts, summarizeConversation } from '../utils/api';
import { Message, APIConfig } from '../types';

describe('API Utils', () => {
  const mockConfig: APIConfig = {
    baseUrl: 'https://api.openai.com/v1',
    apiKey: 'test-key',
    model: 'gpt-4o',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('chatCompletion', () => {
    it('accumulates streamed tool_calls deltas into executable calls', async () => {
      const chunks = [
        { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call-1', type: 'function', function: { name: 'notion-fetch', arguments: '' } }] } }] },
        { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: JSON.stringify({ id: 'self' }) } }] } }] },
        { choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
      ];
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(new Response(
        chunks.map(c => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n',
        { headers: { 'Content-Type': 'text/event-stream' } },
      ));
      const result = await chatCompletion(mockConfig, [], undefined, () => {});
      expect(result.toolCalls).toEqual([{ id: 'call-1', name: 'notion-fetch', arguments: { id: 'self' }, serverId: '' }]);
      expect(result.content).toBe('');
    });

    it('keeps streamed content and tool calls in the same response', async () => {
      const chunks = [
        { choices: [{ delta: { content: 'Looking' } }] },
        { choices: [{ delta: { tool_calls: [{ index: 0, id: 'c2', type: 'function', function: { name: 'search', arguments: '{}' } }] } }] },
      ];
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(new Response(
        chunks.map(c => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n'));
      const result = await chatCompletion(mockConfig, [], undefined, () => {});
      expect(result.content).toBe('Looking');
      expect(result.toolCalls?.[0]).toMatchObject({ name: 'search', arguments: {} });
    });

    it('reassembles tool arguments split across SSE chunks and partial reads', async () => {
      const events = [
        { choices: [{ delta: { tool_calls: [{ index: 0, id: 'c9', type: 'function', function: { name: 'notion-fetch', arguments: '' } }] } }] },
        { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{"id": "se' } }] } }] },
        { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'lf"}' } }] } }] },
      ].map(event => `data: ${JSON.stringify(event)}\n\n`);
      events.push('data: [DONE]\n');
      // Split the raw SSE text at arbitrary byte offsets, like a real stream.
      const payload = events.join('');
      const raw = new TextEncoder().encode(payload);
      const split = Math.floor(raw.length / 3);
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(raw.slice(0, split));
            controller.enqueue(raw.slice(split, split * 2));
            controller.enqueue(raw.slice(split * 2));
            controller.close();
          },
        })));
      const result = await chatCompletion(mockConfig, [], undefined, () => {});
      expect(result.toolCalls).toEqual([{ id: 'c9', name: 'notion-fetch', arguments: { id: 'self' }, serverId: '' }]);
    });

    it('accumulates parallel tool calls by index and preserves order', async () => {
      const events = [
        { choices: [{ delta: { tool_calls: [{ index: 1, id: 'b', type: 'function', function: { name: 'second', arguments: '{}' } }] } }] },
        { choices: [{ delta: { tool_calls: [{ index: 0, id: 'a', type: 'function', function: { name: 'first', arguments: '{"x":1' } }] } }] },
        { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: ',"y":2}' } }] } }] },
      ];

      vi.mocked(globalThis.fetch).mockResolvedValueOnce(new Response(
        events.map(e => `data: ${JSON.stringify(e)}\n\n`).join('') + 'data: [DONE]\n'));
      const result = await chatCompletion(mockConfig, [], undefined, () => {});
      expect(result.toolCalls?.map(t => t.name)).toEqual(['first', 'second']);
      expect(result.toolCalls?.[0].arguments).toEqual({ x: 1, y: 2 });
    });

    it('surfaces malformed streamed tool arguments instead of returning them silently', async () => {
      const events = [
        { choices: [{ delta: { tool_calls: [{ index: 0, id: 'bad', type: 'function', function: { name: 'x', arguments: 'not-json' } }] } }] },
      ];
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(new Response(
        events.map(e => `data: ${JSON.stringify(e)}\n\n`).join('') + 'data: [DONE]\n'));
      await expect(chatCompletion(mockConfig, [], undefined, () => {}))
        .rejects.toThrow(/invalid tool call arguments/i);
    });

    it('treats SSE comment lines as separators, not data', async () => {
      const events = [
        ': OPENROUTER PROCESSING\n\n',
        { choices: [{ delta: { content: 'ok' } }] },
      ];
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(new Response(
        events.map(e => typeof e === 'string' ? e : `data: ${JSON.stringify(e)}\n\n`).join('') + 'data: [DONE]\n'));
      const result = await chatCompletion(mockConfig, [], undefined, () => {});
      expect(result.content).toBe('ok');
    });

    it('should format messages correctly for OpenAI API', async () => {
      const messages: Message[] = [
        { id: '1', role: 'user', content: 'Hello', timestamp: Date.now() },
        { id: '2', role: 'assistant', content: 'Hi there!', timestamp: Date.now() },
      ];

      const mockResponse = {
        choices: [{
          message: {
            content: 'How can I help?',
            tool_calls: null,
          }
        }]
      };

      vi.mocked(globalThis.fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      } as Response);

      const result = await chatCompletion(mockConfig, messages);

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Authorization': 'Bearer test-key',
          }),
        })
      );

      const callArgs = vi.mocked(globalThis.fetch).mock.calls[0];
      const body = JSON.parse(callArgs[1]?.body as string);
      
      expect(body.model).toBe('gpt-4o');
      expect(body.messages).toHaveLength(2);
      expect(body.messages[0].role).toBe('user');
      expect(body.messages[0].content).toBe('Hello');
      expect(body.messages[1].role).toBe('assistant');
      expect(body.messages[1].content).toBe('Hi there!');
      
      expect(result.content).toBe('How can I help?');
    });

    it('should handle tool calls in response', async () => {
      const messages: Message[] = [
        { id: '1', role: 'user', content: 'Search for something', timestamp: Date.now() },
      ];

      const mockResponse = {
        choices: [{
          message: {
            content: null,
            tool_calls: [{
              id: 'call_123',
              function: {
                name: 'search',
                arguments: '{"query": "test"}'
              }
            }]
          }
        }]
      };

      vi.mocked(globalThis.fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      } as Response);

      const result = await chatCompletion(mockConfig, messages);

      expect(result.toolCalls).toBeDefined();
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls![0].name).toBe('search');
      expect(result.toolCalls![0].arguments).toEqual({ query: 'test' });
    });

    it('should include tools in request when provided', async () => {
      const messages: Message[] = [
        { id: '1', role: 'user', content: 'Use a tool', timestamp: Date.now() },
      ];

      const tools = [
        {
          name: 'search',
          description: 'Search the web',
          inputSchema: { type: 'object', properties: { query: { type: 'string' } } }
        }
      ];

      vi.mocked(globalThis.fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ choices: [{ message: { content: 'Done' } }] }),
      } as Response);

      await chatCompletion(mockConfig, messages, tools);

      const callArgs = vi.mocked(globalThis.fetch).mock.calls[0];
      const body = JSON.parse(callArgs[1]?.body as string);
      
      expect(body.tools).toBeDefined();
      expect(body.tools).toHaveLength(1);
      expect(body.tools[0].type).toBe('function');
      expect(body.tools[0].function.name).toBe('search');
    });

    it('should throw error on API failure', async () => {
      const messages: Message[] = [
        { id: '1', role: 'user', content: 'Hello', timestamp: Date.now() },
      ];

      vi.mocked(globalThis.fetch).mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Invalid API key'),
      } as Response);

      await expect(chatCompletion(mockConfig, messages)).rejects.toThrow('API Error: 401');
    });
  });

  describe('extractMemoryFacts', () => {
    it('should extract facts from conversation', async () => {
      const messages: Message[] = [
        { id: '1', role: 'user', content: 'My name is John and I live in Tokyo', timestamp: Date.now() },
        { id: '2', role: 'assistant', content: 'Nice to meet you, John!', timestamp: Date.now() },
      ];

      vi.mocked(globalThis.fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          choices: [{
            message: {
              content: 'User name is John\nUser lives in Tokyo'
            }
          }]
        }),
      } as Response);

      const facts = await extractMemoryFacts(mockConfig, messages);

      expect(facts).toHaveLength(2);
      expect(facts[0]).toBe('User name is John');
      expect(facts[1]).toBe('User lives in Tokyo');
    });

    it('should filter out empty lines and "no notable" responses', async () => {
      const messages: Message[] = [
        { id: '1', role: 'user', content: 'Hello', timestamp: Date.now() },
      ];

      vi.mocked(globalThis.fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          choices: [{
            message: {
              content: 'No notable facts\n\n\n'
            }
          }]
        }),
      } as Response);

      const facts = await extractMemoryFacts(mockConfig, messages);

      expect(facts).toHaveLength(0);
    });
  });

  describe('summarizeConversation', () => {
    it('should extract title and summary', async () => {
      const messages: Message[] = [
        { id: '1', role: 'user', content: 'How do I build a website?', timestamp: Date.now() },
        { id: '2', role: 'assistant', content: 'You can use React...', timestamp: Date.now() },
      ];

      vi.mocked(globalThis.fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          choices: [{
            message: {
              content: 'TITLE: Building a website\nSUMMARY:\n- Asked about website development\n- Discussed React framework'
            }
          }]
        }),
      } as Response);

      const result = await summarizeConversation(mockConfig, messages);

      expect(result.title).toBe('Building a website');
      expect(result.summary).toContain('Asked about website development');
    });
  });
});
