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

  const addServer = () => {
    if (!newUrl.trim()) return;
    const server: MCPServer = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2),
      name: newName.trim() || new URL(newUrl).hostname,
      url: newUrl.trim(),
      enabled: true,
      tools: [],
      status: 'disconnected',
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
    </div>
  );
}
