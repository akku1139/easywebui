import { expect, it, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';
import worker from '../worker/index';
import { createMockEnv } from '../worker/test-helpers';
import { saveSettings, loadSettings } from '../utils/storage';

it.each([false, true])('continues after 429 without repeating MCP and saves final answer (lazy=%s)', async (lazy) => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  const env = createMockEnv();
  env.AI_CHAT_DB._addData('mcp_servers', { id: 'notion', name: 'Notion', url: 'https://mcp.example.com/mcp',
    status: 'connected', enabled: 1, oauth_enabled: 1, oauth_access_token: 'server-only-token', created_at: 1,
    tools_json: JSON.stringify([{ name: 'notion-fetch', description: 'Fetch a page', inputSchema: { type: 'object' }, serverId: 'notion' }, ...(lazy ? Array.from({ length: 1000 }, (_, i) => ({ name: `unrelated_${i}`, description: 'UNRELATED_SCHEMA', inputSchema: { type: 'object' }, serverId: 'notion' })) : [])]),
  });
  saveSettings({ ...loadSettings(), theme: 'dark', autoMemory: false,
    providers: [{ id: 'p', name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api', apiKey: 'shared', createdAt: 1 }],
    models: [{ id: 'm', providerId: 'p', name: 'test-model', createdAt: 1 }], activeModelId: 'm' });
  const completions: any[] = [];
  let limited = false;
  const methods: string[] = [];
  const sse = (value: unknown) => `data: ${JSON.stringify(value)}\n\n`;
  vi.mocked(fetch).mockImplementation(async (url, init) => {
    if (String(url).startsWith('https://openrouter.ai')) {
      const body = JSON.parse(String(init?.body));
      if (body.messages.some((m: any) => m.role === 'tool') && !limited) {
        limited = true;
        return new Response('Rate limited', { status: 429, headers: { 'Retry-After': '0' } });
      }
      if (lazy) {
        expect(body.tools).toHaveLength(2);
        expect(JSON.stringify(body)).not.toContain('UNRELATED_SCHEMA');
      }
      completions.push(body);
      if (lazy && completions.length === 1) return new Response(sse({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'search-1', type: 'function', function: { name: 'easywebui_search_tools', arguments: '{"query":"notion-fetch"}' } }] } }] }) + 'data: [DONE]\n\n');
      if (lazy && completions.length === 2) {
        const found = JSON.parse(body.messages.at(-1).content);
        expect(found.tools).toHaveLength(1);
        return new Response(sse({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call-1', type: 'function', function: { name: 'easywebui_execute_tool', arguments: JSON.stringify({ tool_id: found.tools[0].tool_id, arguments: { id: 'self' } }) } }] } }] }) + 'data: [DONE]\n\n');
      }
      if (completions.length === 1) return new Response(': OPENROUTER PROCESSING\n\n' +
        sse({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call-1', type: 'function', function: { name: 'notion-fetch', arguments: '' } }] } }] }) +
        sse({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{"id":"self"}' } }] } }] }) +
        sse({ choices: [{ delta: {}, finish_reason: 'tool_calls' }] }) + 'data: [DONE]\n\n');
      expect(body.messages.slice(-2)).toEqual([
        expect.objectContaining({ role: 'assistant', tool_calls: [{ id: 'call-1', type: 'function', function: lazy ? expect.objectContaining({ name: 'easywebui_execute_tool' }) : { name: 'notion-fetch', arguments: '{"id":"self"}' } }] }),
        expect.objectContaining({ role: 'tool', tool_call_id: 'call-1', content: 'Notion page body' }),
      ]);
      return new Response(sse({ choices: [{ delta: { content: 'Here is your Notion page.' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 11, completion_tokens: 7 } }) + 'data: [DONE]\n\n');
    }
    if (String(url) === 'https://mcp.example.com/mcp') {
      const rpc = JSON.parse(String(init?.body));
      methods.push(rpc.method);
      expect(init?.redirect).toBe('manual');
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer server-only-token');
      if (rpc.method === 'notifications/initialized') return new Response(null, { status: 202 });
      if (rpc.method === 'tools/call') expect(rpc.params).toEqual({ name: 'notion-fetch', arguments: { id: 'self' } });
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: rpc.id, result: rpc.method === 'initialize'
        ? { protocolVersion: '2025-03-26', capabilities: { tools: {} } }
        : { content: [{ type: 'text', text: 'Notion page body' }], isError: false } }), { headers: { 'Content-Type': 'application/json' } });
    }
    return worker.fetch(new Request(new URL(String(url), 'http://localhost'), { ...init,
      headers: { Authorization: `Basic ${btoa('testuser:testpass')}`, 'Content-Type': 'application/json' } }), env);
  });
  render(<MemoryRouter><App /></MemoryRouter>);
  const input = await screen.findByPlaceholderText(/Type a message/);
  await waitFor(() => expect(screen.getByLabelText('Active model')).toBeEnabled());
  await waitFor(() => expect(input).toBeEnabled());
  fireEvent.change(input, { target: { value: 'Fetch my Notion page' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  await screen.findByText('Here is your Notion page.');
  await waitFor(() => expect(JSON.parse(env.AI_CHAT_DB._getData('conversations')[0].messages_json)).toHaveLength(lazy ? 6 : 4));
  const messages = JSON.parse(env.AI_CHAT_DB._getData('conversations')[0].messages_json);
  expect(messages.map((m: any) => m.role)).toEqual(lazy ? ['user', 'assistant', 'tool', 'assistant', 'tool', 'assistant'] : ['user', 'assistant', 'tool', 'assistant']);
  expect(messages[lazy ? 4 : 2].toolResult).toMatchObject({ toolCallId: 'call-1', content: 'Notion page body' });
  expect(messages.at(-1).usage).toEqual({ prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 });
  expect(methods).toEqual(['initialize', 'notifications/initialized', 'tools/call']);
  expect(completions).toHaveLength(lazy ? 3 : 2);
  expect(limited).toBe(true);
});
