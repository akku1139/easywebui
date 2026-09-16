import { useState } from 'react';
import { MCPServer, MCPTool } from '../types';

interface Props {
  servers: MCPServer[];
  onUpdateServers: (servers: MCPServer[]) => void;
  onClose: () => void;
}

export default function MCPPanel({ servers, onUpdateServers, onClose }: Props) {
  const [newUrl, setNewUrl] = useState('');
  const [newName, setNewName] = useState('');
  const [editingOAuth, setEditingOAuth] = useState<string | null>(null);

  const addServer = () => {
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
    onUpdateServers([...servers, server]);
    setNewUrl('');
    setNewName('');
  };

  const removeServer = (id: string) => {
    onUpdateServers(servers.filter(s => s.id !== id));
  };

  const toggleServer = (id: string) => {
    onUpdateServers(servers.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s));
  };

  const mockConnect = (id: string) => {
    onUpdateServers(servers.map(s => {
      if (s.id !== id) return s;
      // Simulate MCP tool discovery
      const mockTools: MCPTool[] = [
        {
          name: 'search',
          description: 'Search the web for information',
          inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
          serverId: id,
        },
        {
          name: 'read_file',
          description: 'Read a file from the filesystem',
          inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
          serverId: id,
        },
      ];
      return { ...s, status: 'connected' as const, tools: mockTools, lastChecked: Date.now() };
    }));
  };

  const statusColors = {
    connected: 'bg-green-500',
    disconnected: 'bg-gray-500',
    error: 'bg-red-500',
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="w-full max-w-2xl max-h-[80vh] bg-gray-800 border border-gray-700 rounded-2xl shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">MCP Servers</h2>
              <p className="text-xs text-gray-400">Model Context Protocol — Connect tools to your AI</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-white transition">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Add Server */}
        <div className="p-5 border-b border-gray-700">
          <div className="flex gap-2">
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Server name (optional)"
              className="w-40 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-purple-500"
            />
            <input
              value={newUrl}
              onChange={e => setNewUrl(e.target.value)}
              placeholder="MCP Server URL (e.g., http://localhost:3001)"
              className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-purple-500"
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
            <div className="text-center py-8 text-gray-500 text-sm">
              No MCP servers configured. Add a server URL to connect tools.
            </div>
          ) : (
            servers.map(server => (
              <div key={server.id} className="p-4 bg-gray-700/50 rounded-xl border border-gray-600">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-2.5 h-2.5 rounded-full ${statusColors[server.status]}`} />
                    <div>
                      <h4 className="text-sm font-medium text-white">{server.name}</h4>
                      <p className="text-xs text-gray-400">{server.url}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => mockConnect(server.id)}
                      className="px-3 py-1 text-xs bg-gray-600 text-gray-200 rounded-md hover:bg-gray-500 transition"
                    >
                      Connect
                    </button>
                    <button
                      onClick={() => setEditingOAuth(server.id)}
                      className={`px-3 py-1 text-xs rounded-md transition ${
                        server.oauthEnabled
                          ? 'bg-green-600 text-white hover:bg-green-500'
                          : 'bg-gray-600 text-gray-200 hover:bg-gray-500'
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
                      className="p-1 text-gray-400 hover:text-red-400 transition"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
                {server.tools.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs text-gray-400 font-medium">Available Tools:</p>
                    {server.tools.map(tool => (
                      <div key={tool.name} className="flex items-start gap-2 pl-2">
                        <span className="text-purple-400 text-xs mt-0.5">⚡</span>
                        <div>
                          <span className="text-xs text-white font-mono">{tool.name}</span>
                          <span className="text-xs text-gray-400 ml-2">{tool.description}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* OAuth Configuration Modal */}
      {editingOAuth && (
        <OAuthModal
          server={servers.find(s => s.id === editingOAuth)!}
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
}

function OAuthModal({ server, onSave, onClose }: OAuthModalProps) {
  const [oauthEnabled, setOauthEnabled] = useState(server.oauthEnabled || false);
  const [clientId, setClientId] = useState(server.oauthClientId || '');
  const [clientSecret, setClientSecret] = useState(server.oauthClientSecret || '');
  const [authEndpoint, setAuthEndpoint] = useState(server.oauthAuthEndpoint || '');
  const [tokenEndpoint, setTokenEndpoint] = useState(server.oauthTokenEndpoint || '');
  const [scopes, setScopes] = useState(server.oauthScopes || '');
  const [discovering, setDiscovering] = useState(false);

  const handleDiscover = async () => {
    setDiscovering(true);
    try {
      const response = await fetch('/api/mcp-oauth/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverUrl: server.url }),
      });

      if (response.ok) {
        const data = await response.json() as {
          authorizationEndpoint: string;
          tokenEndpoint: string;
        };
        setAuthEndpoint(data.authorizationEndpoint);
        setTokenEndpoint(data.tokenEndpoint);
      }
    } catch (error) {
      console.error('OAuth discovery failed:', error);
    } finally {
      setDiscovering(false);
    }
  };

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

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
      <div className="w-full max-w-lg bg-gray-800 border border-gray-700 rounded-2xl shadow-2xl">
        <div className="p-5 border-b border-gray-700">
          <h3 className="text-lg font-semibold text-white">
            OAuth 2.1 Configuration
          </h3>
          <p className="text-xs text-gray-400 mt-1">
            Configure OAuth 2.1 authentication for {server.name}
          </p>
        </div>
        <div className="p-5 space-y-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={oauthEnabled}
              onChange={e => setOauthEnabled(e.target.checked)}
              className="w-4 h-4 rounded bg-gray-700 border-gray-600 text-green-500 focus:ring-green-500"
            />
            <span className="text-sm text-white">Enable OAuth 2.1</span>
          </label>

          {oauthEnabled && (
            <>
              <button
                onClick={handleDiscover}
                disabled={discovering}
                className="w-full px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition disabled:opacity-50"
              >
                {discovering ? 'Discovering...' : '🔍 Auto-discover OAuth endpoints'}
              </button>

              <div>
                <label className="block text-xs text-gray-400 mb-1">Client ID</label>
                <input
                  value={clientId}
                  onChange={e => setClientId(e.target.value)}
                  placeholder="your-client-id"
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-green-500"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">Client Secret (optional)</label>
                <input
                  type="password"
                  value={clientSecret}
                  onChange={e => setClientSecret(e.target.value)}
                  placeholder="your-client-secret"
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-green-500"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">Authorization Endpoint</label>
                <input
                  value={authEndpoint}
                  onChange={e => setAuthEndpoint(e.target.value)}
                  placeholder="https://auth.example.com/authorize"
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-green-500"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">Token Endpoint</label>
                <input
                  value={tokenEndpoint}
                  onChange={e => setTokenEndpoint(e.target.value)}
                  placeholder="https://auth.example.com/token"
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-green-500"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">Scopes (space-separated)</label>
                <input
                  value={scopes}
                  onChange={e => setScopes(e.target.value)}
                  placeholder="read write"
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-green-500"
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

          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-400 hover:text-white transition"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-6 py-2 bg-green-500 text-white text-sm rounded-lg hover:bg-green-600 transition"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
