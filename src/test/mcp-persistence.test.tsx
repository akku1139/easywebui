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

it('Connect performs MCP initialization and lists a returned tool in the panel and D1', async () => {
  const env = createMockEnv();
  env.AI_CHAT_DB._addData('mcp_servers', {
    id: 'mcp-1', name: 'Real protocol', url: 'https://mcp.example.com/mcp', created_at: 1,
  });
  const methods: string[] = [];
  vi.mocked(fetch).mockImplementation(async (url, init) => {
    if (String(url) === 'https://mcp.example.com/mcp') {
      const rpc = JSON.parse(String(init?.body));
      methods.push(rpc.method);
      if (rpc.method === 'notifications/initialized') return new Response(null, { status: 202 });
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: rpc.id, result: rpc.method === 'initialize'
        ? { protocolVersion: '2025-03-26', capabilities: { tools: {} } }
        : { tools: [{ name: 'lookup_document', description: 'Find a document', inputSchema: { type: 'object' } }] },
      }), { headers: { 'Content-Type': 'application/json' } });
    }
    return worker.fetch(new Request(new URL(String(url), 'http://localhost'), { ...init,
      headers: { Authorization: `Basic ${btoa('testuser:testpass')}`, 'Content-Type': 'application/json' },
    }), env);
  });
  render(<Panel />);
  fireEvent.click(await screen.findByRole('button', { name: 'Connect' }));
  expect(await screen.findByText('lookup_document')).toBeInTheDocument();
  expect(screen.queryByText('Connected (no tools available)')).not.toBeInTheDocument();
  expect(methods).toEqual(['initialize', 'notifications/initialized', 'tools/list']);
  expect(JSON.parse(env.AI_CHAT_DB._getData('mcp_servers')[0].tools_json)).toEqual([
    { name: 'lookup_document', description: 'Find a document', inputSchema: { type: 'object' }, serverId: 'mcp-1' },
  ]);
});
