import { describe, it, vi, expect } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import worker from './worker/index';
import { createMockEnv } from './worker/test-helpers';
import { saveSettings, loadSettings } from './utils/storage';

it('restores server models in the main UI, changes selection, and sends/persists the selected model', async () => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  const env = createMockEnv();
  saveSettings({ ...loadSettings(), theme: 'dark', autoMemory: false,
    providers: [{ id: 'p', name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api', apiKey: 'shared', createdAt: 1 }],
    models: [{ id: 'a', providerId: 'p', name: 'model-a', createdAt: 1 }, { id: 'b', providerId: 'p', name: 'model-b', createdAt: 1 }], activeModelId: 'a' });
  vi.mocked(fetch).mockImplementation(async (url, init) => {
    if (String(url).startsWith('https://openrouter.ai')) return new Response('data: {"choices":[{"delta":{"content":"Reply"}}]}\n\ndata: [DONE]\n');
    return worker.fetch(new Request(new URL(String(url), 'http://localhost'), { ...init,
      headers: { Authorization: `Basic ${btoa('testuser:testpass')}`, 'Content-Type': 'application/json' } }), env);
  });
  render(<MemoryRouter><App /></MemoryRouter>);
  await waitFor(() => expect(screen.getByLabelText('Active model')).toBeEnabled());
  fireEvent.change(screen.getByLabelText('Active model'), { target: { value: 'b' } });
  await waitFor(() => expect(screen.getByLabelText('Active model')).toHaveValue('b'));
  const input = screen.getByPlaceholderText(/Type a message/);
  await waitFor(() => expect(input).toBeEnabled());
  fireEvent.change(input, { target: { value: 'Hello' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  await screen.findByText('Reply');
  const call = vi.mocked(fetch).mock.calls.find(([url]) => String(url).startsWith('https://openrouter.ai'));
  expect(JSON.parse(String(call?.[1]?.body)).model).toBe('model-b');
  expect(new Headers(call?.[1]?.headers).get('Authorization')).toBe('Bearer shared');
  const saved = env.AI_CHAT_DB._getData('conversations');
  expect(saved).toHaveLength(1);
  expect(JSON.parse(saved[0].messages_json)).toHaveLength(2);
  expect(saved[0].model).toBe('model-b');
});
