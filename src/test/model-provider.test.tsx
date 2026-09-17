import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { renderHook, act } from '@testing-library/react';
import SettingsPanel from '../components/SettingsPanel';
import { useChat } from '../hooks/useChat';
import app from '../worker/index';
import { createMockEnv } from '../worker/test-helpers';
import { Settings } from '../types';

// Focused reproduction of the reported bug: adding/selecting a model in the
// settings panel must (1) reach the server, (2) become the model used by the
// next chat request, and (3) share one API key across models of a provider.

const legacyEndpointSettings = () => ({
  endpoints: [{
    id: 'prov-1', name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api',
    apiKey: 'sk-shared', model: 'gpt-4o', enabled: true, isDefault: true,
    createdAt: 1,
  }],
  activeEndpointId: 'prov-1',
  mcpServers: [],
  memoryEnabled: true,
  autoMemory: true,
  theme: 'dark' as const,
  customSystemPrompt: '',
});

const streamResponse = () => new Response(
  'data: {"choices":[{"delta":{"content":"ok"}}]}\n\ndata: [DONE]\n',
  { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
);

describe('model/provider selection reaches server and chat', () => {
  beforeEach(() => {
    vi.mocked(fetch).mockReset();
  });

  it('saving the panel posts providers/models (shared key) to /api/settings', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
    render(<SettingsPanel settings={legacyEndpointSettings() as unknown as Settings} onUpdate={vi.fn()} onClose={vi.fn()} theme="dark" />);

    fireEvent.click(screen.getByText('+ Add Model'));
    fireEvent.change(screen.getByLabelText('Model ID'), { target: { value: 'anthropic/claude-3.5-sonnet' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    fireEvent.click(screen.getByText('Save Settings'));

    await waitFor(() => {
      const call = vi.mocked(fetch).mock.calls.find(([, init]) =>
        init?.method === 'POST' && String(init?.body).includes('claude-3.5-sonnet'));
      expect(call).toBeDefined();
    });
    const [, init] = vi.mocked(fetch).mock.calls.find(([, i]) =>
      i?.method === 'POST' && String(i?.body).includes('claude-3.5-sonnet'))!;
    const body = JSON.parse(String(init?.body));
    expect(body.models).toHaveLength(2); // gpt-4o + added model
    expect(body.providers).toHaveLength(1); // same provider, one key
    expect(body.providers[0].apiKey).toBe('sk-shared');
  });

  it('chat after switching models uses the selected model with the shared key', async () => {
    const settings = {
      ...legacyEndpointSettings(),
      providers: [{ id: 'prov-1', name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api', apiKey: 'sk-test', createdAt: 1 }],
      models: [
        { id: 'prov-1:gpt-4o', providerId: 'prov-1', name: 'gpt-4o', createdAt: 1 },
        { id: 'prov-1:claude-3.5-sonnet', providerId: 'prov-1', name: 'claude-3.5-sonnet', createdAt: 2 },
      ],
      activeModelId: 'prov-1:claude-3.5-sonnet',
      autoMemory: false,
    } as unknown as Settings;

    vi.mocked(fetch).mockImplementation(async (url, init) => {
      if (String(url).includes('/chat/completions')) return streamResponse();
      return new Response(JSON.stringify(init?.method === 'POST' ? { ok: true } : []));
    });
    const { result } = renderHook(() => useChat(settings));
    await waitFor(() => expect(result.current.ready).toBe(true));
    await act(async () => { await result.current.sendMessage('hello'); });

    const chatCall = vi.mocked(fetch).mock.calls.find(([url]) => String(url).includes('/chat/completions'))!;
    const sent = JSON.parse(String(chatCall[1]?.body));
    expect(sent.model).toBe('claude-3.5-sonnet');
    const headers = new Headers(chatCall[1]?.headers);
    expect(headers.get('Authorization')).toBe('Bearer sk-test');
    // OpenRouter attribution headers
    expect(headers.get('HTTP-Referer')).toBe('https://github.com/akku1139/easywebui');
    expect(headers.get('X-Title')).toBe('easywebui');
  });

  it('worker persists and returns providers/models/activeModelId', async () => {
    const env = createMockEnv();
    const headers = { Authorization: `Basic ${btoa('testuser:testpass')}`, 'Content-Type': 'application/json' };
    const payload = {
      providers: [{ id: 'p1', name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api', apiKey: 'k', createdAt: 1 }],
      models: [{ id: 'p1:gpt-4o', providerId: 'p1', name: 'gpt-4o', createdAt: 1 }],
      activeModelId: 'p1:gpt-4o',
      memoryEnabled: true, autoMemory: true, theme: 'dark', customSystemPrompt: '',
    };
    const post = await app.fetch(new Request('http://localhost/api/settings', {
      method: 'POST', headers, body: JSON.stringify(payload),
    }), env);
    expect(post.status).toBe(200);

    const get = await app.fetch(new Request('http://localhost/api/settings', { headers }), env);
    const data = await get.json() as Record<string, unknown>;
    expect(data.providers).toEqual(payload.providers);
    expect(data.models).toEqual(payload.models);
    expect(data.activeModelId).toBe('p1:gpt-4o');
  });
});
