import { useState } from 'react';
import { useAuth } from './hooks/useAuth';
import { useChat } from './hooks/useChat';
import { loadSettings, saveSettings } from './utils/storage';
import { Settings } from './types';
import AuthScreen from './components/AuthScreen';
import Sidebar from './components/Sidebar';
import ChatView from './components/ChatView';
import MemoryPanel from './components/MemoryPanel';
import MCPPanel from './components/MCPPanel';
import SettingsPanel from './components/SettingsPanel';

type Panel = 'none' | 'memory' | 'mcp' | 'settings';

export default function App() {
  const { auth, login, logout } = useAuth();
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [activePanel, setActivePanel] = useState<Panel>('none');
  const [chatError, setChatError] = useState('');

  const chat = useChat(settings);

  if (!auth.isAuthenticated) {
    return <AuthScreen onLogin={login} />;
  }

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
    <div className="h-screen flex bg-gray-850 text-white overflow-hidden">
      {/* Sidebar */}
      <Sidebar
        conversations={chat.conversations}
        activeId={chat.activeConversationId}
        onSelect={chat.setActiveConversationId}
        onNew={chat.createConversation}
        onDelete={chat.deleteConversation}
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
              <span className="text-xs text-gray-500">
                {chat.activeConversation.messages.length} messages
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-800 rounded-lg border border-gray-700">
              <div className={`w-2 h-2 rounded-full ${
                settings.apiConfig.baseUrl ? 'bg-green-400' : 'bg-red-400'
              }`} />
              <span className="text-xs text-gray-400">
                {settings.apiConfig.model || 'No model'}
              </span>
            </div>
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
