import { expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import worker from './worker/index';
import { createMockEnv } from './worker/test-helpers';
import { saveSettings, loadSettings } from './utils/storage';

it('keeps the header when a conversation finishes loading', async () => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  const env = createMockEnv();
  env.AI_CHAT_DB._addData('conversations', { id: 'load-test', title: 'Old chat', messages_json: JSON.stringify([
    { id: 'u', role: 'user', content: 'Earlier question', timestamp: 1 },
    { id: 'a', role: 'assistant', content: 'Earlier answer', timestamp: 2 },
  ]), created_at: 1, updated_at: 2 });
  saveSettings({ ...loadSettings(), theme: 'dark', autoMemory: false,
    providers: [{ id: 'p', name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api', apiKey: 'k', createdAt: 1 }],
    models: [{ id: 'm', providerId: 'p', name: 'test-model', createdAt: 1 }], activeModelId: 'm' });
  vi.mocked(fetch).mockImplementation(async (url, init) => {
    if (String(url).startsWith('https://openrouter.ai')) return new Response('data: {"choices":[{"delta":{"content":"Reply"}}]}\n\ndata: [DONE]\n');
    return worker.fetch(new Request(new URL(String(url), 'http://localhost'), { ...init,
      headers: { Authorization: `Basic ${btoa('testuser:testpass')}`, 'Content-Type': 'application/json' } }), env);
  });
  render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>);
  await screen.findByText('Old chat');
  expect(screen.getByRole('heading', { name: 'AI Chat' })).toBeInTheDocument();
  // Reproduce "load a chat" exactly: click it in the sidebar list.
  fireEvent.click(screen.getByText('Old chat'));
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Old chat' })).toBeInTheDocument());
  expect(screen.getAllByRole('heading')).toHaveLength(1);
  expect(screen.getByRole('heading', { name: 'Old chat' })).toBeInTheDocument();
  expect(screen.getByText('Earlier question')).toBeInTheDocument();
  expect(screen.getByLabelText('Active model')).toBeEnabled();
  expect(screen.getByText('2 messages')).toBeInTheDocument();
  expect(document.title).toBe('Old chat - easywebui');
  // Without an active conversation the app name alone is shown.
  fireEvent.click(screen.getByRole('button', { name: 'New Chat' }));
  await waitFor(() => expect(document.title).toBe('New Chat - easywebui'));
});
