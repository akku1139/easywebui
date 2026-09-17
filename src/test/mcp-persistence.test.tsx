import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import MCPPanel from '../components/MCPPanel';
import { useServerSettings } from '../hooks/useServerSettings';
import worker from '../worker/index';
import { createMockEnv } from '../worker/test-helpers';

function Panel() {
  const state = useServerSettings();
  if (!state.ready) return <p>Loading</p>;
  return <MCPPanel servers={state.settings.mcpServers} settings={state.settings}
    onUpdateServers={servers => state.update({ ...state.settings, mcpServers: servers })}
    onUpdateSettings={state.update} onClose={() => {}} theme="dark" />;
}

it('persists MCP panel additions through the dedicated API and restores them in a fresh browser', async () => {
  const env = createMockEnv();
  vi.mocked(fetch).mockImplementation(async (url, init) => {
    if (String(url) === '/api/mcp-oauth/discover') return new Response('{}', { status: 404 });
    return worker.fetch(new Request(new URL(String(url), 'http://localhost'), { ...init,
      headers: { Authorization: `Basic ${btoa('testuser:testpass')}`, 'Content-Type': 'application/json' },
    }), env);
  });
  const first = render(<Panel />);
  await screen.findByPlaceholderText('Server name (optional)');
  fireEvent.change(screen.getByPlaceholderText('Server name (optional)'), { target: { value: 'Persisted MCP' } });
  fireEvent.change(screen.getByPlaceholderText(/MCP Server URL/), { target: { value: 'https://mcp.example.com' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add' }));
  await screen.findByText('Persisted MCP');
  const request = vi.mocked(fetch).mock.calls.find(([url, init]) => url === '/api/mcp-servers' && init?.method === 'POST');
  expect(JSON.parse(String(request?.[1]?.body))).toMatchObject({ name: 'Persisted MCP', url: 'https://mcp.example.com' });
  expect(env.AI_CHAT_DB._getData('mcp_servers')).toHaveLength(1);
  first.unmount();
  localStorage.clear();
  render(<Panel />);
  await waitFor(() => expect(screen.getByText('Persisted MCP')).toBeInTheDocument());
  expect(env.AI_CHAT_DB._getData('mcp_servers')).toHaveLength(1);
});
