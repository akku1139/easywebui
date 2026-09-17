import { expect, it, vi } from 'vitest';
import { createToolCatalog, SEARCH_TOOL, EXECUTE_TOOL } from './tool-catalog';
import type { MCPServer, ToolCall } from '../types';
const servers: MCPServer[] = Array.from({ length: 25 }, (_, s) => ({ id: `s${s}`, name: `Server${s}`, enabled: true, status: 'connected', url: 'https://example.com',
  tools: Array.from({ length: 50 }, (_, t) => ({ name: `action${t}`, description: `Capability${t}`, serverId: `s${s}`, inputSchema: { type: 'object', properties: { input: { type: 'string' } } } })),
}));
const call = (name: string, args: Record<string, unknown>): ToolCall => ({ id: 'c', name, arguments: args, serverId: '' });
it('exposes only two tools for 1250 tools, searches five schemas, and routes duplicates by opaque id', async () => {
  const catalog = createToolCatalog(servers);
  expect(catalog.lazy).toBe(true);
  expect(catalog.tools.map(t => t.name)).toEqual([SEARCH_TOOL, EXECUTE_TOOL]);
  expect(JSON.stringify(catalog.tools).length).toBeLessThan(2500);
  const remote = vi.fn().mockResolvedValue({ content: 'ok', isError: false });
  const result = await catalog.execute(call(SEARCH_TOOL, { query: 'Server12 action8' }), remote);
  const found = JSON.parse(result.content);
  expect(found.tools).toHaveLength(1);
  expect(found.tools[0]).toMatchObject({ server: 'Server12', name: 'action8' });
  expect(remote).not.toHaveBeenCalled();
  await catalog.execute(call(EXECUTE_TOOL, { tool_id: found.tools[0].tool_id, arguments: { input: 'x' } }), remote);
  expect(remote).toHaveBeenCalledWith('s12', 'action8', { input: 'x' });
});
it('rejects undiscovered tools, invalid queries, and excludes disabled/disconnected servers', async () => {
  const remote = vi.fn();
  const catalog = createToolCatalog([...servers, { ...servers[0], id: 'disabled', name: 'SecretOnly', enabled: false }]);
  expect((await catalog.execute(call(EXECUTE_TOOL, { tool_id: '["s0","action0"]', arguments: {} }), remote)).isError).toBe(true);
  expect((await catalog.execute(call(SEARCH_TOOL, { query: 'x'.repeat(201) }), remote)).isError).toBe(true);
  expect(JSON.parse((await catalog.execute(call(SEARCH_TOOL, { query: 'SecretOnly' }), remote)).content).tools).toEqual([]);
  expect(remote).not.toHaveBeenCalled();
});
it('pages deterministically and caps results without truncating schemas', async () => {
  const catalog = createToolCatalog(servers);
  const remote = vi.fn();
  const first = JSON.parse((await catalog.execute(call(SEARCH_TOOL, { query: '' }), remote)).content);
  const second = JSON.parse((await catalog.execute(call(SEARCH_TOOL, { query: '', offset: first.nextOffset }), remote)).content);
  expect(first.nextOffset).toBe(5);
  expect(second.tools[0].tool_id).not.toBe(first.tools[0].tool_id);
  const huge = createToolCatalog([{ ...servers[0], tools: [{ ...servers[0].tools[0], inputSchema: { description: 'x'.repeat(20000) } }] }]);
  const result = JSON.parse((await huge.execute(call(SEARCH_TOOL, { query: '' }), remote)).content);
  expect(result.tools).toEqual([]);
  expect(result.omittedOversizedSchemas).toHaveLength(1);
});
it('keeps small catalogs direct and rejects ambiguous direct names', () => {
  const catalog = createToolCatalog([{ ...servers[0], tools: servers[0].tools.slice(0, 2) }]);
  expect(catalog.lazy).toBe(false);
  expect(catalog.resolveServer('action0')).toBe('s0');
  const duplicate = createToolCatalog([0, 1].map(i => ({ ...servers[i], tools: servers[i].tools.slice(0, 1) })));
  expect(() => duplicate.resolveServer('action0')).toThrow('multiple');
});
