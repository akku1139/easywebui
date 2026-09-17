import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useServerSettings } from './useServerSettings';
import { loadSettings, saveSettings, migrateLegacyEndpoints, resolveModel } from '../utils/storage';
import app from '../worker/index';
import { createMockEnv } from '../worker/test-helpers';

function wireServer() {
  const env = createMockEnv();
  vi.mocked(fetch).mockImplementation(async (url, init) => app.fetch(new Request(
    new URL(String(url), 'http://localhost'), {
      ...init, headers: { Authorization: `Basic ${btoa('testuser:testpass')}`, 'Content-Type': 'application/json' },
    }), env));
  return env;
}

describe('server-backed settings', () => {
  it('imports browser settings once and another browser restores the shared provider and selected model', async () => {
    wireServer();
    const settings = { ...loadSettings(), providers: [{ id: 'p', name: 'Provider', baseUrl: 'https://example.com', apiKey: 'shared', createdAt: 1 }],
      models: [{ id: 'a', providerId: 'p', name: 'a', createdAt: 1 }, { id: 'b', providerId: 'p', name: 'b', createdAt: 1 }], activeModelId: 'a' };
    saveSettings(settings);
    const first = renderHook(useServerSettings);
    await waitFor(() => expect(first.result.current.ready).toBe(true));
    await act(async () => { await first.result.current.selectModel('b'); });
    expect(resolveModel(first.result.current.settings)?.model).toBe('b');
    first.unmount();
    localStorage.clear();
    const second = renderHook(useServerSettings);
    await waitFor(() => expect(second.result.current.ready).toBe(true));
    expect(second.result.current.settings.providers).toHaveLength(1);
    expect(resolveModel(second.result.current.settings)).toMatchObject({ model: 'b', apiKey: 'shared' });
  });

  it('shows failed saves and keeps the acknowledged model selected', async () => {
    wireServer();
    const hook = renderHook(useServerSettings);
    await waitFor(() => expect(hook.result.current.ready).toBe(true));
    vi.mocked(fetch).mockResolvedValue(new Response('{}', { status: 500 }));
    await act(async () => { await hook.result.current.selectModel('unsaved'); });
    expect(hook.result.current.syncError).toContain('Failed to save');
    expect(hook.result.current.settings.activeModelId).not.toBe('unsaved');
  });

  it('merges matching legacy providers but preserves selection and different keys', () => {
    const endpoints = ['a', 'b', 'c'].map((id, i) => ({ id, name: id, baseUrl: 'https://example.com', apiKey: i === 2 ? 'other' : 'shared', model: id, enabled: true, createdAt: 1 }));
    const settings = migrateLegacyEndpoints({ ...loadSettings(), endpoints, activeEndpointId: 'b' });
    expect(settings.providers).toHaveLength(2);
    expect(settings.models).toHaveLength(3);
    expect(resolveModel(settings)).toMatchObject({ model: 'b', apiKey: 'shared' });
    expect(settings.endpoints).toEqual([]);
    expect(migrateLegacyEndpoints({ ...settings, models: [], activeModelId: null }).models).toEqual([]);
  });
});
