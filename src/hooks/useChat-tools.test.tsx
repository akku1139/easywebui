import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useChat } from './useChat';
import { Settings } from '../types';

vi.mock('../utils/api', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  chatCompletion: vi.fn(),
  extractMemoryFacts: vi.fn().mockResolvedValue([]),
  summarizeConversation: vi.fn().mockResolvedValue(undefined),
}));

import { chatCompletion } from '../utils/api';

const chatMock = vi.mocked(chatCompletion);

const baseSettings: Settings = {
  endpoints: [], activeEndpointId: null, mcpServers: [], memoryEnabled: false, autoMemory: false,
  theme: 'dark', customSystemPrompt: '', oauthClients: {},
};

function settingsWithTools() {
  return {
    ...baseSettings,
    providers: [{ id: 'p1', name: 'P', baseUrl: 'https://api.example.com/v1', apiKey: 'k', createdAt: 1 }],
    models: [{ id: 'm1', providerId: 'p1', name: 'gpt-test', createdAt: 1 }],
    activeModelId: 'm1',
    mcpServers: [{
      id: 'srv-1', name: 'Notion', url: 'https://mcp.example.com', enabled: true,
      status: 'connected' as const, tools: [
        { name: 'notion-fetch', description: 'Fetch a page', inputSchema: { type: 'object' }, serverId: 'srv-1' },
      ],
    }],
  } as Settings;
}

let toolCallBodies: unknown[] = [];

/** Route fetch by URL: hydration GETs return [], conversation POSTs ok, MCP call recorded. */
function mockFetch(toolResult: { content: string; isError?: boolean } | Error) {
  vi.mocked(fetch).mockImplementation(async (url, init) => {
    const u = String(url);
    if (u.includes('/api/mcp-servers/call')) {
      toolCallBodies.push(JSON.parse(String(init?.body)));
      if (toolResult instanceof Error) return new Response(JSON.stringify({ error: toolResult.message }), { status: 502 });
      return new Response(JSON.stringify({ content: toolResult.content, isError: !!toolResult.isError }));
    }
    if (init?.method === 'POST' || init?.method === 'PATCH') return new Response('{"ok":true}');
    return new Response('[]');
  });
}

describe('useChat tool loop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chatMock.mockReset();
    localStorage.clear();
    localStorage.setItem('ai-chat-data-imported', 'true');
    toolCallBodies = [];
  });

  it('executes streamed tool calls via MCP and re-queries with tool results', async () => {
    mockFetch({ content: 'page body' });
    chatMock
      .mockResolvedValueOnce({ content: '', toolCalls: [{ id: 'call-1', name: 'notion-fetch', arguments: { id: 'self' }, serverId: '' }] })
      .mockResolvedValueOnce({ content: 'Here is your page' });
    const { result } = renderHook(() => useChat(settingsWithTools()));
    await waitFor(() => expect(result.current.ready).toBe(true));
    await act(async () => { await result.current.sendMessage('fetch my page'); });

    expect(toolCallBodies).toEqual([{ serverId: 'srv-1', name: 'notion-fetch', arguments: { id: 'self' } }]);
    // The re-query carries the assistant tool_calls plus the tool result message.
    const second = chatMock.mock.calls[1][1];
    const toolMsg = second.find(m => m.role === 'tool');
    expect(toolMsg?.toolResult).toEqual({ toolCallId: 'call-1', content: 'page body', isError: false });
    const roles = result.current.activeConversation?.messages.map(m => m.role);
    expect(roles).toEqual(['user', 'assistant', 'tool', 'assistant']);
    expect(result.current.activeConversation?.messages[3].content).toBe('Here is your page');
  });

  it('surfaces MCP failures as paired error tool results and aborts the round', async () => {
    mockFetch(new Error('MCP tool call failed: boom'));
    chatMock
      .mockResolvedValueOnce({ content: '', toolCalls: [{ id: 'call-1', name: 'notion-fetch', arguments: {}, serverId: '' }] });
    const { result } = renderHook(() => useChat(settingsWithTools()));
    await waitFor(() => expect(result.current.ready).toBe(true));
    await act(async () => {
      await expect(result.current.sendMessage('fetch')).rejects.toThrow(/boom/);
    });
    // Failure is stored as a paired error tool result, never a dangling assistant tool_calls.
    const toolMsg = result.current.activeConversation?.messages.find(m => m.role === 'tool');
    expect(toolMsg?.toolResult).toMatchObject({ toolCallId: 'call-1', isError: true });
    // No second model query after a failed tool execution.
    expect(chatMock).toHaveBeenCalledTimes(1);
  });

  it('stops after the round limit and reports it instead of looping forever', async () => {
    mockFetch({ content: 'still working' });
    chatMock.mockImplementation(async () => ({
      content: '', toolCalls: [{ id: `call-${Math.random()}`, name: 'notion-fetch', arguments: {}, serverId: '' }],
    }));
    const { result } = renderHook(() => useChat(settingsWithTools()));
    await waitFor(() => expect(result.current.ready).toBe(true));
    await act(async () => {
      await expect(result.current.sendMessage('loop')).rejects.toThrow(/Tool execution did not finish/);
    });
    expect(chatMock.mock.calls.length).toBe(5);
  });

  it('rejects ambiguous duplicate tool names across servers', async () => {
    const s = settingsWithTools();
    s.mcpServers = [...s.mcpServers, {
      ...s.mcpServers[0], id: 'srv-2', name: 'Other',
      tools: [{ ...s.mcpServers[0].tools[0], serverId: 'srv-2' }],
    }] as Settings['mcpServers'];
    mockFetch({ content: 'x' });
    chatMock.mockResolvedValueOnce({ content: '', toolCalls: [{ id: 'c', name: 'notion-fetch', arguments: {}, serverId: '' }] });
    const { result } = renderHook(() => useChat(s));
    await waitFor(() => expect(result.current.ready).toBe(true));
    await act(async () => {
      await expect(result.current.sendMessage('ambiguous')).rejects.toThrow(/notion-fetch/);
    });
    expect(toolCallBodies).toEqual([]);
  });

  it('does not execute a tool if persisting its intent fails', async () => {
    mockFetch({ content: 'x' });
    const routedFetch = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (url, init) => {
      if (String(url) === '/api/conversations' && init?.method === 'POST' &&
        JSON.parse(String(init.body)).messages?.some((m: any) => m.toolCalls?.length)) {
        return new Response('{}', { status: 500 });
      }
      return routedFetch(url, init);
    });
    chatMock.mockResolvedValueOnce({ content: '', toolCalls: [{ id: 'c', name: 'notion-fetch', arguments: {}, serverId: '' }] });
    const { result } = renderHook(() => useChat(settingsWithTools()));
    await waitFor(() => expect(result.current.ready).toBe(true));
    await act(async () => { await expect(result.current.sendMessage('fetch')).rejects.toThrow('no tools were executed'); });
    expect(toolCallBodies).toEqual([]);
    expect(result.current.activeConversation?.messages.map(m => m.role)).toEqual(['user']);
  });

  it('searches a 1250-tool catalog then executes only the discovered tool without leaking the catalog', async () => {
    const settings = settingsWithTools();
    settings.mcpServers[0].tools.push(...Array.from({ length: 1249 }, (_, i) => ({
      name: `unused_${i}`, description: 'UNRELATED_CATALOG_METADATA', serverId: 'srv-1', inputSchema: { type: 'object' },
    })));
    mockFetch({ content: 'page body' });
    chatMock.mockResolvedValueOnce({ content: '', toolCalls: [{ id: 'search', name: 'easywebui_search_tools', arguments: { query: 'notion-fetch' }, serverId: '' }] })
      .mockImplementationOnce(async (_config, messages, tools) => {
        const found = JSON.parse(messages.find(m => m.toolResult?.toolCallId === 'search')!.content);
        expect(found.tools).toHaveLength(1);
        expect(tools).toHaveLength(2);
        return { content: '', toolCalls: [{ id: 'exec', name: 'easywebui_execute_tool', arguments: { tool_id: found.tools[0].tool_id, arguments: { id: 'self' } }, serverId: '' }] };
      }).mockResolvedValueOnce({ content: 'Page found' });
    const { result } = renderHook(() => useChat(settings));
    await waitFor(() => expect(result.current.ready).toBe(true));
    await act(async () => { await result.current.sendMessage('Fetch notion page'); });
    expect(toolCallBodies).toEqual([{ serverId: 'srv-1', name: 'notion-fetch', arguments: { id: 'self' } }]);
    expect(result.current.activeConversation?.messages.at(-1)?.content).toBe('Page found');
    for (const [, messages, tools] of chatMock.mock.calls) {
      expect(tools).toHaveLength(2);
      expect(JSON.stringify({ messages, tools })).not.toContain('UNRELATED_CATALOG_METADATA');
    }
    // Keep persisted audit history, but omit old schema results on the next turn.
    chatMock.mockResolvedValueOnce({ content: 'Next answer' });
    await act(async () => { await result.current.sendMessage('Next question'); });
    const nextMessages = chatMock.mock.calls[3][1];
    expect(nextMessages.find(m => m.toolResult?.toolCallId === 'search')?.content).toContain('omitted');
  });
});
