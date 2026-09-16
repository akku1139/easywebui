import { useState } from 'react';
import { MCPServer, MCPTool, Settings } from '../types';

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
  const [editingOAuth, setEditingOAuth] = useState<string | null>(null);

  const addServer = async () => {
    if (!newUrl.trim()) return;
    
    const server: MCPServer = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2),
      name: newName.trim() || new URL(newUrl).hostname,
      url: newUrl.trim(),
      enabled: true,
      tools: [],
      status: 'disconnected',
      oauthEnabled: false,
    };
    
    // Auto-detect OAuth metadata
    try {
      const response = await fetch('/api/mcp-oauth/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverUrl: newUrl.trim() }),
      });
      
      if (response.ok) {
        const data = await response.json() as {
          authorizationEndpoint: string;
          tokenEndpoint: string;
        };
        server.oauthEnabled = true;
        server.oauthAuthEndpoint = data.authorizationEndpoint;
        server.oauthTokenEndpoint = data.tokenEndpoint;
      }
    } catch (error) {
      console.log('OAuth metadata not found, continuing without OAuth');
    }
    
    onUpdateServers([...servers, server]);
    setNewUrl('');
    setNewName('');
    
    // If OAuth was detected, open the OAuth configuration modal
    if (server.oauthEnabled) {
      setEditingOAuth(server.id);
    }
  };

  const removeServer = (id: string) => {
    onUpdateServers(servers.filter(s => s.id !== id));
  };

  const toggleServer = (id: string) => {
    onUpdateServers(servers.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s));
  };

  const startOAuthFlow = async (serverId: string) => {
    const server = servers.find(s => s.id === serverId);
    if (!server || !server.oauthEnabled) return;

    // Check if we have OAuth client config for this server
    const oauthConfig = settings.oauthClients?.[serverId];
    if (!oauthConfig?.clientId) {
      // Open OAuth modal to configure client ID
      setEditingOAuth(serverId);
      return;
    }

    // Mark as authenticating
    onUpdateServers(servers.map(s => {
      if (s.id !== serverId) return s;
      return { ...s, status: 'authenticating' as const, lastChecked: Date.now() };
    }));

    try {
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
        // Mark as error
        onUpdateServers(servers.map(s => {
          if (s.id !== serverId) return s;
          return { ...s, status: 'error' as const, lastChecked: Date.now() };
        }));
      }
    } catch (error) {
      console.error('OAuth initiation failed:', error);
      // Mark as error
      onUpdateServers(servers.map(s => {
        if (s.id !== serverId) return s;
        return { ...s, status: 'error' as const, lastChecked: Date.now() };
      }));
    }
  };

  const mockConnect = async (id: string) => {
    const server = servers.find(s => s.id === id);
    if (!server) return;

    // If already connected, don't reconnect
    if (server.status === 'connected') {
      return;
    }

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
        </div>

        {/* Server List */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
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
                    <div className={`w-2.5 h-2.5 rounded-full ${statusColors[server.status]}`} />
                    <div>
                      <h4 className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>{server.name}</h4>
                      <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>{server.url}</p>
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
                      onClick={() => setEditingOAuth(server.id)}
                      className={`px-3 py-1 text-xs rounded-md transition ${
                        server.oauthEnabled
                          ? 'bg-green-600 text-white hover:bg-green-500'
                          : isDark 
                            ? 'bg-gray-600 text-gray-200 hover:bg-gray-500' 
                            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      }`}
                      title="Configure OAuth"
                    >
                      🔐 OAuth
                    </button>
                    <button
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
                        Available Tools ({server.tools.length}):
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

      {/* OAuth Configuration Modal */}
      {editingOAuth && (
        <OAuthModal
          server={servers.find(s => s.id === editingOAuth)!}
          theme={theme}
          onSave={(updates) => {
            onUpdateServers(servers.map(s => 
              s.id === editingOAuth ? { ...s, ...updates } : s
            ));
            setEditingOAuth(null);
          }}
          onClose={() => setEditingOAuth(null)}
        />
      )}
    </div>
  );
}

// OAuth Configuration Modal
interface OAuthModalProps {
  server: MCPServer;
  onSave: (updates: Partial<MCPServer>) => void;
  onClose: () => void;
  theme: 'light' | 'dark';
}

function OAuthModal({ server, onSave, onClose, theme }: OAuthModalProps) {
  const isDark = theme === 'dark';
  const [oauthEnabled, setOauthEnabled] = useState(server.oauthEnabled || false);
  const [clientId, setClientId] = useState(server.oauthClientId || '');
  const [clientSecret, setClientSecret] = useState(server.oauthClientSecret || '');
  const [authEndpoint] = useState(server.oauthAuthEndpoint || '');
  const [tokenEndpoint] = useState(server.oauthTokenEndpoint || '');
  const [scopes, setScopes] = useState(server.oauthScopes || '');
  const [initiating, setInitiating] = useState(false);

  const handleSave = () => {
    onSave({
      oauthEnabled,
      oauthClientId: clientId,
      oauthClientSecret: clientSecret,
      oauthAuthEndpoint: authEndpoint,
      oauthTokenEndpoint: tokenEndpoint,
      oauthScopes: scopes,
    });
  };

  const handleStartOAuth = async () => {
    if (!clientId) {
      alert('Please enter a Client ID first');
      return;
    }

    setInitiating(true);
    try {
      // Save the configuration first
      handleSave();

      // Start OAuth flow
      const response = await fetch('/api/mcp-oauth/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverId: server.id }),
      });

      if (response.ok) {
        const data = await response.json() as { authorizationUrl: string };
        // Open OAuth authorization URL in new window
        window.open(data.authorizationUrl, '_blank', 'width=600,height=700');
        onClose();
      } else {
        alert('Failed to initiate OAuth flow');
      }
    } catch (error) {
      console.error('OAuth initiation failed:', error);
      alert('Failed to initiate OAuth flow');
    } finally {
      setInitiating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
      <div className={`w-full max-w-lg border rounded-2xl shadow-2xl ${
        isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-300'
      }`}>
        <div className={`p-5 border-b ${isDark ? 'border-gray-700' : 'border-gray-300'}`}>
          <h3 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
            OAuth 2.1 Configuration
          </h3>
          <p className={`text-xs mt-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
            Configure OAuth 2.1 authentication for {server.name}
          </p>
        </div>
        <div className="p-5 space-y-4">
          {oauthEnabled && (
            <>
              {/* Auto-detected endpoints (read-only) */}
              {authEndpoint && tokenEndpoint && (
                <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                  <p className="text-xs text-green-300 font-medium mb-2">✓ OAuth endpoints auto-detected</p>
                  <div className="space-y-1">
                    <p className="text-xs text-gray-400">
                      <span className="font-medium">Auth:</span> {authEndpoint}
                    </p>
                    <p className="text-xs text-gray-400">
                      <span className="font-medium">Token:</span> {tokenEndpoint}
                    </p>
                  </div>
                </div>
              )}

              <div>
                <label className={`block text-xs mb-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Client ID *</label>
                <input
                  value={clientId}
                  onChange={e => setClientId(e.target.value)}
                  placeholder="your-client-id"
                  className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-green-500 ${
                    isDark 
                      ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                      : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                  }`}
                />
              </div>

              <div>
                <label className={`block text-xs mb-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Client Secret (optional)</label>
                <input
                  type="password"
                  value={clientSecret}
                  onChange={e => setClientSecret(e.target.value)}
                  placeholder="your-client-secret"
                  className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-green-500 ${
                    isDark 
                      ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                      : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                  }`}
                />
              </div>

              <div>
                <label className={`block text-xs mb-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Scopes (optional, space-separated)</label>
                <input
                  value={scopes}
                  onChange={e => setScopes(e.target.value)}
                  placeholder="read write"
                  className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-green-500 ${
                    isDark 
                      ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                      : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                  }`}
                />
              </div>

              <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                <p className="text-xs text-blue-300">
                  <strong>OAuth 2.1 with PKCE:</strong> This implementation uses OAuth 2.1 with PKCE (Proof Key for Code Exchange) 
                  as required by the MCP Authorization Specification (2025-06-18). PKCE provides enhanced security for public clients.
                </p>
              </div>
            </>
          )}

          {!oauthEnabled && (
            <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
              <p className="text-xs text-yellow-300">
                OAuth was not detected for this server. You can manually configure OAuth endpoints if needed.
              </p>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={onClose}
              className={`px-4 py-2 text-sm transition ${
                isDark 
                  ? 'text-gray-400 hover:text-white' 
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Cancel
            </button>
            {oauthEnabled && clientId && (
              <button
                onClick={handleStartOAuth}
                disabled={initiating}
                className="px-6 py-2 bg-green-500 text-white text-sm rounded-lg hover:bg-green-600 transition disabled:opacity-50"
              >
                {initiating ? 'Starting...' : '🔐 Start OAuth Flow'}
              </button>
            )}
            <button
              onClick={handleSave}
              className="px-6 py-2 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 transition"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
