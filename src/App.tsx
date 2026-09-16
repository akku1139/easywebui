import { useState } from 'react';
import { useAuth } from './hooks/useAuth';
import { useChat } from './hooks/useChat';
import { useTheme } from './hooks/useTheme';
import { loadSettings, saveSettings } from './utils/storage';
import { Settings } from './types';
import Sidebar from './components/Sidebar';
import ChatView from './components/ChatView';
import MemoryPanel from './components/MemoryPanel';
import MCPPanel from './components/MCPPanel';
import SettingsPanel from './components/SettingsPanel';

type Panel = 'none' | 'memory' | 'mcp' | 'settings';

export default function App() {
  const { auth, logout } = useAuth();
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [activePanel, setActivePanel] = useState<Panel>('none');
  const [chatError, setChatError] = useState('');

  useTheme(settings.theme);
  const chat = useChat(settings);

  const handleSend = async (content: string) => {
    setChatError('');
    try {
      await chat.sendMessage(content);
    } catch (err) {
      setChatError(err instanceof Error ? err.message : 'Failed to send message');
    }
  };

  const handleUpdateSettings = (newSettings: Settings) => {
    setSettings(newSettings);
    saveSettings(newSettings);
  };

  const handleUpdateMCPServers = (servers: Settings['mcpServers']) => {
    const newSettings = { ...settings, mcpServers: servers };
    setSettings(newSettings);
    saveSettings(newSettings);
  };

  return (
    <div className={`h-screen flex overflow-hidden ${
      settings.theme === 'dark' 
        ? 'bg-gray-900 text-white' 
        : 'bg-gray-50 text-gray-900'
    }`}>
      {/* Sidebar */}
      <Sidebar
        conversations={chat.conversations}
        activeId={chat.activeConversationId}
        onSelect={chat.setActiveConversationId}
        onNew={chat.createConversation}
        onDelete={chat.deleteConversation}
        onTogglePin={chat.togglePin}
        onOpenSettings={() => setActivePanel('settings')}
        onOpenMemory={() => setActivePanel('memory')}
        onOpenMCP={() => setActivePanel('mcp')}
        onLogout={logout}
      />

      {/* Main Chat Area */}
      <main className="flex-1 flex flex-col h-full bg-gray-850">
        {/* Top Bar */}
        <header className="h-14 border-b border-gray-700 flex items-center justify-between px-4 shrink-0">
          <div className="flex items-center gap-3">
            <h1 className="text-sm font-medium text-white">
              {chat.activeConversation?.title || 'AI Chat'}
            </h1>
            {chat.activeConversation && (
              <>
                <span className="text-xs text-gray-500">
                  {chat.activeConversation.messages.length} messages
                </span>
                {/* Pin Toggle Button in Header */}
                <button
                  onClick={() => chat.togglePin(chat.activeConversation!.id)}
                  className={`p-1.5 rounded-lg transition ${
                    chat.activeConversation.pinned
                      ? 'text-yellow-400 bg-yellow-400/10'
                      : 'text-gray-500 hover:text-yellow-400 hover:bg-gray-800'
                  }`}
                  title={chat.activeConversation.pinned ? 'Unpin conversation' : 'Pin conversation'}
                >
                  <svg className="w-4 h-4" fill={chat.activeConversation.pinned ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                  </svg>
                </button>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            {(() => {
              const activeEndpoint = settings.endpoints.find(e => e.id === settings.activeEndpointId) 
                || settings.endpoints.find(e => e.isDefault)
                || settings.endpoints[0];
              return (
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-800 rounded-lg border border-gray-700">
                  <div className={`w-2 h-2 rounded-full ${
                    activeEndpoint?.baseUrl ? 'bg-green-400' : 'bg-red-400'
                  }`} />
                  <span className="text-xs text-gray-400">
                    {activeEndpoint ? `${activeEndpoint.name} (${activeEndpoint.model})` : 'No endpoint'}
                  </span>
                </div>
              );
            })()}
            {settings.memoryEnabled && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/10 rounded-lg border border-amber-500/20">
                <span className="text-xs text-amber-400">🧠 Memory ON</span>
              </div>
            )}
            {settings.mcpServers.filter(s => s.enabled && s.status === 'connected').length > 0 && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-purple-500/10 rounded-lg border border-purple-500/20">
                <span className="text-xs text-purple-400">
                  ⚡ {settings.mcpServers.filter(s => s.enabled && s.status === 'connected').length} MCP
                </span>
              </div>
            )}
          </div>
        </header>

        {/* Chat */}
        <ChatView
          messages={chat.activeConversation?.messages || []}
          isLoading={chat.isLoading}
          streamContent={chat.streamContent}
          onSend={handleSend}
          error={chatError}
        />
      </main>

      {/* Panels */}
      {activePanel === 'memory' && (
        <MemoryPanel
          facts={chat.userFacts}
          summaries={chat.summaries}
          onAddFact={chat.addUserFact}
          onRemoveFact={chat.removeUserFact}
          onClose={() => setActivePanel('none')}
        />
      )}
      {activePanel === 'mcp' && (
        <MCPPanel
          servers={settings.mcpServers}
          onUpdateServers={handleUpdateMCPServers}
          onClose={() => setActivePanel('none')}
        />
      )}
      {activePanel === 'settings' && (
        <SettingsPanel
          settings={settings}
          onUpdate={handleUpdateSettings}
          onClose={() => setActivePanel('none')}
        />
      )}
    </div>
  );
}
