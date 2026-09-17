import { useEffect, useState } from 'react';
import { MCPServer, MCPTool, Settings } from '../types';
import * as apiClient from '../utils/api-client';

interface Props {
  servers: MCPServer[];
  onUpdateServers: (servers: MCPServer[]) => void;
  onClose: () => void;
  theme: 'light' | 'dark';
  settings: Settings;
  onUpdateSettings: (settings: Settings) => void;
}

export default function MCPPanel({ servers, onUpdateServers, onClose, theme, settings, onUpdateSettings }: Props) {
  const isDark = theme === 'dark';
  const [newUrl, setNewUrl] = useState('');
  const [newName, setNewName] = useState('');
  const [addError, setAddError] = useState('');
  const [actionError, setActionError] = useState('');
  const [oauthServerId, setOauthServerId] = useState<string | null>(null);

  useEffect(() => {
    const handleOAuthComplete = (event: MessageEvent<{ type?: string; serverId?: string }>) => {
      if (event.origin !== window.location.origin || event.data?.type !== 'mcp-oauth-complete') return;
      const serverId = event.data.serverId;
      if (!serverId || !servers.some(server => server.id === serverId)) return;
      const updatedServers = servers.map(server => (
        server.id === serverId
          ? { ...server, status: 'connected' as const, lastChecked: Date.now() }
          : server
      ));
      onUpdateServers(updatedServers);
      apiClient.updateMCPServer(serverId, { status: 'connected' }).catch(() => {});
    };

    window.addEventListener('message', handleOAuthComplete);
    return () => window.removeEventListener('message', handleOAuthComplete);
  }, [servers, onUpdateServers]);

  const addServer = async () => {
    const url = newUrl.trim();
    if (!url) return;

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error('Unsupported protocol');
    } catch {
      setAddError('Enter a valid HTTP or HTTPS URL.');
      return;
    }

    setAddError('');
    const server: MCPServer = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2),
      name: newName.trim() || parsedUrl.hostname,
      url,
      enabled: true,
      tools: [],
      status: 'disconnected',
      oauthEnabled: false,
    };
    setNewUrl('');
    setNewName('');

    // Auto-detect OAuth metadata
    try {
      const response = await fetch('/api/mcp-oauth/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverUrl: url }),
      });

      if (response.ok) {
        const data = await response.json() as {
          authorizationEndpoint: string;
          tokenEndpoint: string;
          registrationEndpoint?: string;
        };
        server.oauthEnabled = true;
        server.oauthAuthEndpoint = data.authorizationEndpoint;
        server.oauthTokenEndpoint = data.tokenEndpoint;
        if (data.registrationEndpoint) {
          server.oauthRegistrationEndpoint = data.registrationEndpoint;
        }
      }
    } catch (error) {
      console.log('OAuth metadata not found, continuing without OAuth');
    }

    // Save to D1 database first — the DB is the source of truth for the id.
    try {
      const saved = (await apiClient.addMCPServer({ ...server, id: undefined })) as { id?: string };
      const canonicalId = typeof saved?.id === 'string' ? saved.id : undefined;
      if (!canonicalId) throw new Error('Server response missing id');
      const persisted: MCPServer = { ...server, id: canonicalId };
      onUpdateServers([...servers, persisted]);
    } catch (error) {
      console.error('Failed to save MCP server to database:', error);
      setAddError('Failed to save MCP server. Please try again.');
    }
  };

  // Persisted mutations update the shared state only after the server accepts
  // the change; on failure the panel surfaces a retryable error and keeps the
  // current state (no optimistic writes that can silently diverge from D1).
  const removeServer = async (id: string) => {
    setActionError('');
    try {
      await apiClient.deleteMCPServer(id);
      onUpdateServers(servers.filter(s => s.id !== id));
    } catch (error) {
      console.error('Failed to delete MCP server:', error);
      setActionError('Failed to remove MCP server. Please try again.');
    }
  };

  const toggleServer = async (id: string) => {
    const current = servers.find(s => s.id === id);
    if (!current) return;
    const enabled = !current.enabled;
    setActionError('');
    try {
      await apiClient.updateMCPServer(id, { enabled });
      onUpdateServers(servers.map(s => (s.id === id ? { ...s, enabled } : s)));
    } catch (error) {
      console.error('Failed to update MCP server:', error);
      setActionError('Failed to update MCP server. Please try again.');
    }
  };

  const startOAuthFlow = async (serverId: string) => {
    const server = servers.find(s => s.id === serverId);
    if (!server || !server.oauthEnabled) return;

    // Mark as authenticating
    onUpdateServers(servers.map(s => {
      if (s.id !== serverId) return s;
      return { ...s, status: 'authenticating' as const, lastChecked: Date.now() };
    }));

    try {
      // If no client_id, try dynamic registration first
      if (!server.oauthClientId && server.oauthRegistrationEndpoint) {
        const registerResponse = await fetch('/api/mcp-oauth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            serverId,
            registrationEndpoint: server.oauthRegistrationEndpoint
          }),
        });

        if (!registerResponse.ok) {
          console.error('Dynamic client registration failed');
          onUpdateServers(servers.map(s => {
            if (s.id !== serverId) return s;
            return { ...s, status: 'error' as const, lastChecked: Date.now() };
          }));
          return;
        }

        // Update server with new client_id
        const registerData = await registerResponse.json() as { clientId: string };
        onUpdateServers(servers.map(s => {
          if (s.id !== serverId) return s;
          return { ...s, oauthClientId: registerData.clientId };
        }));
      }

      // Initiate OAuth flow
      const response = await fetch('/api/mcp-oauth/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverId }),
      });

      if (response.ok) {
        const data = await response.json() as { authorizationUrl: string };
        window.open(data.authorizationUrl, '_blank', 'width=600,height=700');
      } else {
        console.error('Failed to initiate OAuth flow');
        onUpdateServers(servers.map(s => {
          if (s.id !== serverId) return s;
          return { ...s, status: 'error' as const, lastChecked: Date.now() };
        }));
      }
    } catch (error) {
      console.error('OAuth initiation failed:', error);
      onUpdateServers(servers.map(s => {
        if (s.id !== serverId) return s;
        return { ...s, status: 'error' as const, lastChecked: Date.now() };
      }));
    }
  };

  const mockConnect = async (id: string) => {
    const server = servers.find(s => s.id === id);
    if (!server) return;

    // If OAuth is enabled but not authenticated, start OAuth flow
    if (server.oauthEnabled && !server.oauthAccessToken) {
      await startOAuthFlow(id);
      return;
    }

    // Mark as connecting
    onUpdateServers(servers.map(s => {
      if (s.id !== id) return s;
      return { ...s, status: 'connecting' as const, lastChecked: Date.now() };
    }));

    // Simulate connection delay
    setTimeout(() => {
      onUpdateServers(servers.map(s => {
        if (s.id !== id) return s;
        return { ...s, status: 'connected' as const, tools: [], lastChecked: Date.now() };
      }));
    }, 1000);
  };

  const statusColors = {
    connected: 'bg-green-500',
    disconnected: 'bg-gray-500',
    connecting: 'bg-blue-500',
    authenticating: 'bg-yellow-500',
    error: 'bg-red-500',
  };

  const statusLabels = {
    connected: 'Connected',
    disconnected: 'Disconnected',
    connecting: 'Connecting...',
    authenticating: 'Authenticating...',
    error: 'Error',
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`w-full max-w-2xl max-h-[80vh] border rounded-2xl shadow-2xl flex flex-col ${
        isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-300'
      }`}>
        {/* Header */}
        <div className={`flex items-center justify-between p-5 border-b ${
          isDark ? 'border-gray-700' : 'border-gray-300'
        }`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <h2 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>MCP Servers</h2>
              <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Model Context Protocol — Connect tools to your AI</p>
            </div>
          </div>
          <button onClick={onClose} className={`p-2 transition ${
            isDark ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-gray-900'
          }`}>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Add Server */}
        <div className={`p-5 border-b ${isDark ? 'border-gray-700' : 'border-gray-300'}`}>
          <div className="flex gap-2">
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Server name (optional)"
              className={`w-40 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-purple-500 ${
                isDark
                  ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400'
                  : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
              }`}
            />
            <input
              value={newUrl}
              onChange={e => setNewUrl(e.target.value)}
              placeholder="MCP Server URL (e.g., http://localhost:3001)"
              className={`flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-purple-500 ${
                isDark
                  ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400'
                  : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
              }`}
            />
            <button
              onClick={addServer}
              className="px-4 py-2 bg-purple-500 text-white text-sm rounded-lg hover:bg-purple-600 transition"
            >
              Add
            </button>
          </div>
          {addError && <p className="mt-2 text-xs text-red-400">{addError}</p>}
        </div>

        {/* Server List */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {actionError && <p className="text-xs text-red-400" role="alert">{actionError}</p>}
          {servers.length === 0 ? (
            <div className={`text-center py-8 text-sm ${isDark ? 'text-gray-500' : 'text-gray-600'}`}>
              No MCP servers configured. Add a server URL to connect tools.
            </div>
          ) : (
            servers.map(server => (
              <div key={server.id} className={`p-4 rounded-xl border ${
                isDark ? 'bg-gray-700/50 border-gray-600' : 'bg-gray-100 border-gray-300'
              }`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
            <div
              aria-label={statusLabels[server.status]}
              className={`h-2.5 w-2.5 rounded-full ${statusColors[server.status]}`}
            />
            <div className="min-w-0">
              <h4 className={`truncate text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>{server.name}</h4>
              <div>
                <p className={`truncate text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>{server.url}</p>
              </div>
            </div>
          </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => mockConnect(server.id)}
                      className={`px-3 py-1 text-xs rounded-md transition ${
                        isDark
                          ? 'bg-gray-600 text-gray-200 hover:bg-gray-500'
                          : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      }`}
                    >
                      Connect
                    </button>
                    <button
                      onClick={() => setOauthServerId(server.id)}
                      className={`px-3 py-1 text-xs rounded-md transition ${
                        isDark
                          ? 'bg-purple-500/15 text-purple-300 hover:bg-purple-500/25'
                          : 'bg-purple-50 text-purple-700 hover:bg-purple-100'
                      }`}
                    >
                      🔐 OAuth
                    </button>

                    <button
                      type="button"
                      role="switch"
                      aria-label={`Toggle ${server.name}`}
                      aria-checked={server.enabled}
                      onClick={() => toggleServer(server.id)}
                      className={`relative w-10 h-5 rounded-full transition ${
                        server.enabled ? 'bg-purple-500' : 'bg-gray-600'
                      }`}
                    >
                      <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                        server.enabled ? 'translate-x-5' : 'translate-x-0.5'
                      }`} />
                    </button>
                    <button
                      type="button"
                      title="Remove server"
                      onClick={() => removeServer(server.id)}
                      className={`p-1 transition ${
                        isDark
                          ? 'text-gray-400 hover:text-red-400'
                          : 'text-gray-600 hover:text-red-600'
                      }`}
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
                {/* Status Display */}
                <div className="mt-3">
                  {server.status === 'connected' && server.tools.length > 0 && (
                    <div className="space-y-1.5">
                      <p className={`text-xs font-medium ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                        <span>Available Tools:</span> <span>({server.tools.length})</span>
                      </p>
                      {server.tools.map(tool => (
                        <div key={tool.name} className="flex items-start gap-2 pl-2">
                          <span className="text-purple-400 text-xs mt-0.5">⚡</span>
                          <div>
                            <span className={`text-xs font-mono ${isDark ? 'text-white' : 'text-gray-900'}`}>{tool.name}</span>
                            <span className={`text-xs ml-2 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>{tool.description}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {server.status === 'connected' && server.tools.length === 0 && (
                    <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-600'}`}>
                      Connected (no tools available)
                    </p>
                  )}
                  {server.status === 'connecting' && (
                    <div className="flex items-center gap-2">
                      <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-500"></div>
                      <p className={`text-xs ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>
                        Connecting to server...
                      </p>
                    </div>
                  )}
                  {server.status === 'authenticating' && (
                    <div className="flex items-center gap-2">
                      <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-yellow-500"></div>
                      <p className={`text-xs ${isDark ? 'text-yellow-400' : 'text-yellow-600'}`}>
                        Waiting for authentication...
                      </p>
                    </div>
                  )}
                  {server.status === 'disconnected' && (
                    <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-600'}`}>
                      Click "Connect" to establish connection
                    </p>
                  )}
                  {server.status === 'error' && (
                    <p className={`text-xs ${isDark ? 'text-red-400' : 'text-red-600'}`}>
                      Connection failed. Please check server URL and try again.
                    </p>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {oauthServerId && (() => {
        const oauthServer = servers.find(server => server.id === oauthServerId);
        if (!oauthServer) return null;
        return (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
            <div className={`w-full max-w-md rounded-2xl border p-5 shadow-2xl ${
              isDark ? 'border-gray-700 bg-gray-800' : 'border-gray-300 bg-white'
            }`}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className={`text-base font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    OAuth 2.1 Configuration
                  </h3>
                  <p className={`mt-1 text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                    {oauthServer.name}
                  </p>
                </div>
                <button
                  aria-label="Close OAuth configuration"
                  onClick={() => setOauthServerId(null)}
                  className={`text-lg leading-none ${isDark ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-900'}`}
                >
                  ×
                </button>
              </div>
              <p className={`mt-4 text-sm ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                OAuth metadata is detected automatically when the server is added. Use Connect to start the PKCE flow when authentication is available.
              </p>
              <button
                onClick={() => setOauthServerId(null)}
                className="mt-5 w-full rounded-lg bg-purple-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-purple-600"
              >
                Done
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
