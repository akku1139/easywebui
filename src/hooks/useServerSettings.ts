import { useEffect, useRef, useState } from 'react';
import { Settings, MCPServer } from '../types';
import * as api from '../utils/api-client';
import { loadSettings, saveSettings, migrateLegacyEndpoints } from '../utils/storage';

export function useServerSettings() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [ready, setReady] = useState(false);
  const [syncError, setSyncError] = useState('');
  const [saving, setSaving] = useState(false);
  const selecting = useRef(false);
  const [attempt, setAttempt] = useState(0);
  // Reuse an in-flight bootstrap during React StrictMode's effect replay.
  const loading = useRef<Promise<Settings> | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!loading.current) loading.current = (async () => {
      const cached = loadSettings();
      const [remote, remoteServers] = await Promise.all([
        api.fetchSettings() as Promise<Settings & { initialized?: boolean }>,
        api.fetchMCPServers() as Promise<MCPServer[]>,
      ]);
      if (!Array.isArray(remoteServers)) throw new Error('Invalid MCP server response');
      const merged = migrateLegacyEndpoints({ ...cached, ...remote, mcpServers: remoteServers });
      // Import the old browser-only settings only into an uninitialized server.
      // Once initialized, even empty lists from D1 must win over stale caches.
      const resolved = remote.initialized === false
        ? migrateLegacyEndpoints({ ...cached, mcpServers: remoteServers }) : merged;
      if (remote.initialized === false) await api.saveSettings(resolved);

      // One-time migration of old browser-only MCP records. Preserve canonical
      // server ids when the URL matches; do not continuously resurrect deletes.
      if (!localStorage.getItem('ai-chat-mcp-imported')) {
        for (const local of cached.mcpServers ?? []) {
          if (resolved.mcpServers.some(s => s.id === local.id || s.url === local.url)) continue;
          const saved = await api.addMCPServer(local) as MCPServer;
          resolved.mcpServers.push({ ...local, ...saved });
          // Cache each completed import so retries never duplicate it.
          saveSettings(resolved);
        }
        localStorage.setItem('ai-chat-mcp-imported', 'true');
      }
      return resolved;
    })();
    loading.current.then(value => {
      if (cancelled) return;
      setSettings(value);
      saveSettings(value);
      setReady(true);
      setSyncError('');
    }).catch(error => {
      loading.current = null;
      if (!cancelled) setSyncError(`Failed to load server settings: ${error instanceof Error ? error.message : error}`);
    });
    return () => { cancelled = true; };
  }, [attempt]);

  // Called after the settings panel's acknowledged save, or MCP CRUD.
  const update = (next: Settings) => {
    setSettings(next);
    saveSettings(next);
  };
  const selectModel = async (id: string) => {
    if (selecting.current || !ready) return;
    selecting.current = true;
    setSaving(true);
    const next = { ...settings, activeModelId: id };
    try {
      await api.saveSettings(next);
      update(next);
      setSyncError('');
    } catch (error) {
      setSyncError(`Failed to save model selection: ${error instanceof Error ? error.message : error}`);
    } finally {
      selecting.current = false;
      setSaving(false);
    }
  };
  return { settings, ready, saving, syncError, update, selectModel, retry: () => setAttempt(n => n + 1) };
}
