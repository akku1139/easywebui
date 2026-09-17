import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useChat } from '../hooks/useChat';
import { loadConversations, saveConversations } from '../utils/storage';
import app from '../worker/index';
import { createMockEnv } from '../worker/test-helpers';
import { Settings, Conversation } from '../types';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

const authHeaders = { Authorization: `Basic ${btoa('testuser:testpass')}`, 'Content-Type': 'application/json' };

const baseSettings = {
  endpoints: [{ id: 'prov-1', name: 'P', baseUrl: 'https://api.example.com', apiKey: 'sk', model: 'gpt-4o', enabled: true, isDefault: true, createdAt: 1 }],
  activeEndpointId: 'prov-1',
  mcpServers: [],
  memoryEnabled: true,
  autoMemory: false,
  theme: 'dark',
  customSystemPrompt: '',
} as unknown as Settings;

describe('Conversations API (server-side contract for client sync)', () => {
  let env: ReturnType<typeof createMockEnv>;

  beforeEach(() => { env = createMockEnv(); });

  it('POST accepts a client-generated id and GET returns messages with epoch-ms timestamps', async () => {
    const payload = {
      id: 'conv-client-1', title: 'Chat', model: 'gpt-4o', pinned: false,
      createdAt: 1700000000000, updatedAt: 1700000000001,
      messages: [{ id: 'm1', role: 'user', content: 'hi', timestamp: 1700000000000 }],
    };
    const post = await app.fetch(new Request('http://localhost/api/conversations', {
      method: 'POST', headers: authHeaders, body: JSON.stringify(payload),
    }), env);
    expect(post.status).toBe(200);

    const get = await app.fetch(new Request('http://localhost/api/conversations', { headers: authHeaders }), env);
    const data = await get.json() as any[];
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe('conv-client-1');
    expect(Array.isArray(data[0].messages)).toBe(true);
    expect(data[0].messages[0].content).toBe('hi');
    expect(typeof data[0].createdAt).toBe('number');
    expect(data[0].createdAt).toBe(1700000000000);
  });

  it('re-POSTing the same id is an idempotent upsert, not a duplicate', async () => {
    const payload = { id: 'conv-up-1', title: 'Chat', model: 'm', messages: [{ id: 'm1', role: 'user', content: 'v1', timestamp: 1 }] };
    await app.fetch(new Request('http://localhost/api/conversations', {
      method: 'POST', headers: authHeaders, body: JSON.stringify(payload),
    }), env);
    await app.fetch(new Request('http://localhost/api/conversations', {
      method: 'POST', headers: authHeaders,
      body: JSON.stringify({ ...payload, messages: [
        { id: 'm1', role: 'user', content: 'v1', timestamp: 1 },
        { id: 'm2', role: 'assistant', content: 'v2', timestamp: 2 },
      ], updatedAt: 123000 }),
    }), env);

    const get = await app.fetch(new Request('http://localhost/api/conversations', { headers: authHeaders }), env);
    const data = await get.json() as any[];
    expect(data).toHaveLength(1);
    expect(data[0].messages).toHaveLength(2);
    expect(data[0].updatedAt).toBe(123000);
  });

  it('PATCH updates messages', async () => {
    await app.fetch(new Request('http://localhost/api/conversations', {
      method: 'POST', headers: authHeaders,
      body: JSON.stringify({ id: 'conv-p-1', title: 'T', model: 'm', messages: [] }),
    }), env);
    const res = await app.fetch(new Request('http://localhost/api/conversations?id=conv-p-1', {
      method: 'PATCH', headers: authHeaders,
      body: JSON.stringify({ messages: [{ id: 'm9', role: 'user', content: 'x', timestamp: 9 }] }),
    }), env);
    expect(res.status).toBe(200);
    const get = await app.fetch(new Request('http://localhost/api/conversations', { headers: authHeaders }), env);
    const data = await get.json() as any[];
    expect(data[0].messages[0].content).toBe('x');
  });

  it('memory facts POST honors a client id idempotently; GET uses epoch-ms timestamps', async () => {
    const body = { id: 'fact-1', content: 'likes tea', category: 'preference' };
    await app.fetch(new Request('http://localhost/api/memory/facts', { method: 'POST', headers: authHeaders, body: JSON.stringify(body) }), env);
    await app.fetch(new Request('http://localhost/api/memory/facts', { method: 'POST', headers: authHeaders, body: JSON.stringify({ ...body, content: 'likes coffee' }) }), env);

    const get = await app.fetch(new Request('http://localhost/api/memory/facts', { headers: authHeaders }), env);
    const data = await get.json() as any[];
    expect(data).toHaveLength(1);
    expect(data[0].content).toBe('likes coffee');
    expect(typeof data[0].createdAt).toBe('number');
  });

  it('summaries POST honors a client id and messageCount; GET returns epoch-ms createdAt', async () => {
    const body = { id: 'sum-1', title: 'T', summary: 'S', date: '2024-01-01', messageCount: 3 };
    await app.fetch(new Request('http://localhost/api/memory/summaries', { method: 'POST', headers: authHeaders, body: JSON.stringify(body) }), env);
    const get = await app.fetch(new Request('http://localhost/api/memory/summaries', { headers: authHeaders }), env);
    const data = await get.json() as any[];
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe('sum-1');
    expect(data[0].messageCount).toBe(3);
    expect(typeof data[0].createdAt).toBe('number');
  });
});

describe('useChat server sync', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(fetch).mockReset();
  });

  it('hydrates conversations from the server and merges local-only ones', async () => {
    const localOnly: Conversation = {
      id: 'local-1', title: 'Local', messages: [{ id: 'lm1', role: 'user', content: 'hello', timestamp: 5 }],
      createdAt: 1, updatedAt: 1, model: 'gpt-4o',
    };
    saveConversations([localOnly]);
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/api/conversations')) return json([
        { id: 'srv-1', title: 'Server', messages: [{ id: 'sm1', role: 'user', content: 'from server', timestamp: 1700000000000 }], model: 'gpt-4o', pinned: false, createdAt: 1700000000000, updatedAt: 1700000000000 },
      ]);
      if (url.includes('/api/memory/facts')) return json([]);
      if (url.includes('/api/memory/summaries')) return json([]);
      return json({});
    });

    const { result } = renderHook(() => useChat(baseSettings));
    await waitFor(() => expect(result.current.ready).toBe(true));

    const ids = result.current.conversations.map(c => c.id);
    expect(ids).toContain('srv-1');
    expect(ids).toContain('local-1');
    expect(result.current.conversations.find(c => c.id === 'srv-1')?.messages[0].content).toBe('from server');
    expect(typeof result.current.conversations.find(c => c.id === 'srv-1')?.createdAt).toBe('number');
    expect(result.current.syncError).toBeNull();
  });

  it('persists the assistant reply to the server after sending a message', async () => {
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('/chat/completions')) {
        return new Response('data: {"choices":[{"delta":{"content":"pong"}}]}\n\ndata: [DONE]\n', { status: 200 });
      }
      if (url.includes('/api/conversations')) return json(init?.method === 'POST' ? { ok: true } : []);
      if (url.includes('/api/memory/facts')) return json([]);
      if (url.includes('/api/memory/summaries')) return json([]);
      return json({});
    });

    const { result } = renderHook(() => useChat(baseSettings));
    await waitFor(() => expect(result.current.ready).toBe(true));

    await act(async () => { await result.current.sendMessage('ping'); });
    expect(result.current.activeConversation?.messages.some(m => m.role === 'assistant' && m.content === 'pong')).toBe(true);

    await waitFor(() => {
      const post = vi.mocked(fetch).mock.calls.find(([u, i]) =>
        String(u).includes('/api/conversations') && i?.method === 'POST' && String(i?.body).includes('pong'));
      expect(post).toBeDefined();
    });
    const [, init] = vi.mocked(fetch).mock.calls.find(([u, i]) =>
      String(u).includes('/api/conversations') && i?.method === 'POST' && String(i?.body).includes('pong'))!;
    const body = JSON.parse(String(init?.body));
    expect(body.messages.some((m: any) => m.content === 'pong')).toBe(true);
    expect(result.current.syncError).toBeNull();
  });

  it('surfaces persistence failures as syncError instead of swallowing them', async () => {
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/api/conversations')) return json({ error: 'db down' }, 500);
      if (url.includes('/api/memory/facts') || url.includes('/api/memory/summaries')) return json([]);
      return json({});
    });

    const { result } = renderHook(() => useChat(baseSettings));
    // Hydration failing must be visible, not silent.
    await waitFor(() => expect(result.current.syncError).toBeTruthy());
    expect(result.current.conversations.some(c => c.id === 'local-only')).toBe(false);

    await act(async () => { await result.current.createConversation(); });
    expect(vi.mocked(fetch).mock.calls.some(([, i]) => i?.method === 'POST')).toBe(false);
    expect(result.current.syncError).toBeTruthy();
  });

  it('does not publish a new conversation until the server acknowledges it', async () => {
    let acknowledge!: (response: Response) => void;
    vi.mocked(fetch).mockImplementation(async (_url, init) => {
      if (init?.method === 'POST') return new Promise<Response>(resolve => { acknowledge = resolve; });
      return json([]);
    });
    const { result } = renderHook(() => useChat(baseSettings));
    await waitFor(() => expect(result.current.ready).toBe(true));
    let pending!: ReturnType<typeof result.current.createConversation>;
    act(() => { pending = result.current.createConversation(); });
    await waitFor(() => expect(acknowledge).toBeDefined());
    expect(result.current.conversations).toEqual([]);
    await act(async () => { acknowledge(json({ ok: true })); await pending; });
    expect(result.current.conversations).toHaveLength(1);
    expect(result.current.activeConversation?.title).toBe('New Chat');
  });

  it('syncs pin toggles and deletes to the server', async () => {
    const conv: Conversation = { id: 'c1', title: 'T', messages: [], createdAt: 1, updatedAt: 1, model: 'm' };
    saveConversations([conv]);
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/api/conversations')) return json([]);
      if (url.includes('/api/memory/facts') || url.includes('/api/memory/summaries')) return json([]);
      return json({});
    });

    const { result } = renderHook(() => useChat(baseSettings));
    await waitFor(() => expect(result.current.ready).toBe(true));

    await act(async () => { await result.current.togglePin('c1'); });
    await waitFor(() => {
      expect(vi.mocked(fetch).mock.calls.some(([u, i]) =>
        String(u).includes('/api/conversations?id=c1') && i?.method === 'PATCH')).toBe(true);
    });

    await act(async () => { await result.current.deleteConversation('c1'); });
    await waitFor(() => {
      expect(vi.mocked(fetch).mock.calls.some(([u, i]) =>
        String(u).includes('/api/conversations?id=c1') && i?.method === 'DELETE')).toBe(true);
    });
  });
});
