import { describe, it, expect, beforeEach, vi } from 'vitest';
import app from '../index';
import { createMockEnv } from '../test-helpers';

describe('Chat API', () => {
  let env: ReturnType<typeof createMockEnv>;

  beforeEach(() => {
    env = createMockEnv();
    vi.clearAllMocks();
    env.AI_CHAT_DB._addData('settings', {
      id: 's', providers_json: JSON.stringify([{ id: 'p', baseUrl: 'https://api.openai.com', apiKey: 'test-api-key' }]),
      models_json: JSON.stringify([{ id: 'm', providerId: 'p', name: 'configured-model' }]),
      active_model_id: 'm', memory_enabled: 1, auto_memory: 0,
    });
  });

  describe('POST /api/v1/chat/completions', () => {
    it('should proxy request to OpenAI API', async () => {
      // Mock fetch for OpenAI API
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(JSON.stringify({
              choices: [{ message: { content: 'Hello!' } }]
            })));
            controller.close();
          }
        }),
        clone: function() { return this; },
        json: () => Promise.resolve({
          choices: [{ message: { content: 'Hello!' } }]
        }),
      });
      global.fetch = mockFetch;

      const req = new Request('http://localhost/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa('testuser:testpass'),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [
            { role: 'user', content: 'Hi' }
          ],
          model: 'gpt-4o',
          stream: false,
        }),
      });
      const res = await app.fetch(req, env);
      
      expect(res.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-api-key',
          }),
        })
      );
    });

    it('should inject memory facts into system message', async () => {
      // Add user facts to database
      const db = env.AI_CHAT_DB as any;
      db._addData('user_facts', {
        id: 'fact-1',
        content: 'User likes TypeScript',
        category: 'preference',
        source: 'explicit',
        created_at: Date.now(),
        updated_at: Date.now(),
      });
      db._addData('user_facts', {
        id: 'fact-2',
        content: 'User prefers dark mode',
        category: 'preference',
        source: 'auto_detected',
        created_at: Date.now(),
        updated_at: Date.now(),
      });

      // Mock fetch for OpenAI API
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(JSON.stringify({
              choices: [{ message: { content: 'Got it!' } }]
            })));
            controller.close();
          }
        }),
        clone: function() { return this; },
        json: () => Promise.resolve({
          choices: [{ message: { content: 'Got it!' } }]
        }),
      });
      global.fetch = mockFetch;

      const req = new Request('http://localhost/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa('testuser:testpass'),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [
            { role: 'user', content: 'Hi' }
          ],
          model: 'gpt-4o',
          stream: false,
        }),
      });
      await app.fetch(req, env);
      
      // Verify that memory was injected
      expect(mockFetch).toHaveBeenCalled();
      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      
      // Should have system message with memory
      const systemMsg = body.messages.find((m: any) => m.role === 'system');
      expect(systemMsg).toBeDefined();
      expect(systemMsg.content).toContain('User likes TypeScript');
      expect(systemMsg.content).toContain('User prefers dark mode');
    });

    it('should inject conversation summaries into system message', async () => {
      // Add conversation summaries to database
      const db = env.AI_CHAT_DB as any;
      db._addData('conversation_summaries', {
        id: 'summary-1',
        title: 'Previous Chat',
        summary: 'Discussed TypeScript features',
        date: '2024-01-15',
        message_count: 10,
        created_at: Date.now(),
      });

      // Mock fetch for OpenAI API
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(JSON.stringify({
              choices: [{ message: { content: 'Got it!' } }]
            })));
            controller.close();
          }
        }),
        clone: function() { return this; },
        json: () => Promise.resolve({
          choices: [{ message: { content: 'Got it!' } }]
        }),
      });
      global.fetch = mockFetch;

      const req = new Request('http://localhost/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa('testuser:testpass'),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [
            { role: 'user', content: 'Hi' }
          ],
          model: 'gpt-4o',
          stream: false,
        }),
      });
      await app.fetch(req, env);
      
      // Verify that summaries were injected
      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      
      const systemMsg = body.messages.find((m: any) => m.role === 'system');
      expect(systemMsg).toBeDefined();
      expect(systemMsg.content).toContain('Previous Chat');
      expect(systemMsg.content).toContain('Discussed TypeScript features');
    });

    it('ignores endpoint_id and uses the saved provider instead', async () => {
      // Add custom endpoint to database
      const db = env.AI_CHAT_DB as any;
      db._addData('api_endpoints', {
        id: 'ep-1',
        name: 'Custom Endpoint',
        base_url: 'https://custom.api.com',
        api_key: 'custom-key',
        model: 'custom-model',
        enabled: 1,
        is_default: 0,
        created_at: Date.now(),
      });

      // Mock fetch for custom API
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(JSON.stringify({
              choices: [{ message: { content: 'Hello!' } }]
            })));
            controller.close();
          }
        }),
        clone: function() { return this; },
        json: () => Promise.resolve({
          choices: [{ message: { content: 'Hello!' } }]
        }),
      });
      global.fetch = mockFetch;

      const req = new Request('http://localhost/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa('testuser:testpass'),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [
            { role: 'user', content: 'Hi' }
          ],
          model: 'custom-model',
          stream: false,
          endpoint_id: 'ep-1',
        }),
      });
      await app.fetch(req, env);
      
      // Verify that custom endpoint was used
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/chat/completions',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-api-key',
          }),
        })
      );
    });

    it('should handle thinking content in response', async () => {
      // Mock fetch for OpenAI API with thinking content
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(JSON.stringify({
              choices: [{ 
                message: { 
                  content: 'Hello!',
                  thinking: 'Let me think about this...'
                } 
              }]
            })));
            controller.close();
          }
        }),
        clone: function() { return this; },
        json: () => Promise.resolve({
          choices: [{ 
            message: { 
              content: 'Hello!',
              thinking: 'Let me think about this...'
            } 
          }]
        }),
      });
      global.fetch = mockFetch;

      const req = new Request('http://localhost/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa('testuser:testpass'),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [
            { role: 'user', content: 'Hi' }
          ],
          model: 'gpt-4o',
          stream: false,
        }),
      });

      const res = await app.fetch(req, env);
      
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.choices[0].message.content).toBe('Hello!');
      expect(data.choices[0].message.thinking).toBe('Let me think about this...');
    });

    it('should handle tool calls in response', async () => {
      // Mock fetch for OpenAI API with tool calls
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(JSON.stringify({
              choices: [{ 
                message: { 
                  content: null,
                  tool_calls: [
                    {
                      id: 'call_123',
                      type: 'function',
                      function: {
                        name: 'search',
                        arguments: '{"query": "test"}'
                      }
                    }
                  ]
                } 
              }]
            })));
            controller.close();
          }
        }),
        clone: function() { return this; },
        json: () => Promise.resolve({
          choices: [{ 
            message: { 
              content: null,
              tool_calls: [
                {
                  id: 'call_123',
                  type: 'function',
                  function: {
                    name: 'search',
                    arguments: '{"query": "test"}'
                  }
                }
              ]
            } 
          }]
        }),
      });
      global.fetch = mockFetch;

      const req = new Request('http://localhost/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa('testuser:testpass'),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [
            { role: 'user', content: 'Search for something' }
          ],
          model: 'gpt-4o',
          stream: false,
          tools: [
            {
              type: 'function',
              function: {
                name: 'search',
                description: 'Search the web',
                parameters: {
                  type: 'object',
                  properties: {
                    query: { type: 'string' }
                  },
                  required: ['query']
                }
              }
            }
          ]
        }),
      });

      const res = await app.fetch(req, env);
      
      expect(res.status).toBe(200);
      const data = await res.json() as any;
      expect(data.choices[0].message.tool_calls).toBeDefined();
      expect(data.choices[0].message.tool_calls).toHaveLength(1);
      expect(data.choices[0].message.tool_calls[0].function.name).toBe('search');
      expect(data.choices[0].message.tool_calls[0].function.arguments).toBe('{"query": "test"}');
    });

    it('should handle streaming response with thinking', async () => {
      // Mock fetch for OpenAI API with streaming thinking
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'Content-Type': 'text/event-stream' }),
        body: new ReadableStream({
          start(controller) {
            const encoder = new TextEncoder();
            controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"thinking":"Let me think"}}]}\n\n'));
            controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"thinking":" about this..."}}]}\n\n'));
            controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Hello!"}}]}\n\n'));
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
          }
        }),
      });
      global.fetch = mockFetch;

      const req = new Request('http://localhost/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa('testuser:testpass'),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [
            { role: 'user', content: 'Hi' }
          ],
          model: 'gpt-4o',
          stream: true,
        }),
      });

      const res = await app.fetch(req, env);
      
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('text/event-stream');
    });

    it('should handle streaming response with tool calls', async () => {
      // Mock fetch for OpenAI API with streaming tool calls
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'Content-Type': 'text/event-stream' }),
        body: new ReadableStream({
          start(controller) {
            const encoder = new TextEncoder();
            controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_123","type":"function","function":{"name":"search","arguments":""}}]}}]}\n\n'));
            controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"query\\""}}]}}]}\n\n'));
            controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":": \\"test\\"}"}}]}}]}\n\n'));
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
          }
        }),
      });
      global.fetch = mockFetch;

      const req = new Request('http://localhost/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa('testuser:testpass'),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [
            { role: 'user', content: 'Search for something' }
          ],
          model: 'gpt-4o',
          stream: true,
          tools: [
            {
              type: 'function',
              function: {
                name: 'search',
                description: 'Search the web',
                parameters: {
                  type: 'object',
                  properties: {
                    query: { type: 'string' }
                  },
                  required: ['query']
                }
              }
            }
          ]
        }),
      });

      const res = await app.fetch(req, env);
      
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('text/event-stream');
    });
  });
});
