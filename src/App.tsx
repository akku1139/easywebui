import { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { useChat } from './hooks/useChat';
import { useTheme } from './hooks/useTheme';
import { resolveModel } from './utils/storage';
import { useServerSettings } from './hooks/useServerSettings';
import { Settings } from './types';
import Sidebar from './components/Sidebar';
import ChatView from './components/ChatView';
import MemoryPanel from './components/MemoryPanel';
import MCPPanel from './components/MCPPanel';
import SettingsPanel from './components/SettingsPanel';
import OAuthCallback from './components/OAuthCallback';

type Panel = 'none' | 'memory' | 'mcp' | 'settings';

export default function App() {
  return (
    <Routes>
      <Route path="/oauth-callback" element={<OAuthCallback />} />
      <Route path="/c/:id" element={<ChatApp />} />
      <Route path="/" element={<ChatApp />} />
    </Routes>
  );
}

function ChatApp() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { auth } = useAuth();
  const serverSettings = useServerSettings();
  const { settings } = serverSettings;
  const [activePanel, setActivePanel] = useState<Panel>('none');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [chatError, setChatError] = useState('');
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('dark');

  useTheme(settings.theme);

  // Resolve theme for conditional rendering
  useEffect(() => {
    if (settings.theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      setResolvedTheme(mediaQuery.matches ? 'dark' : 'light');
      
      const handleChange = (e: MediaQueryListEvent) => {
        setResolvedTheme(e.matches ? 'dark' : 'light');
      };
      
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    } else {
      setResolvedTheme(settings.theme === 'dark' ? 'dark' : 'light');
    }
  }, [settings.theme]);

  const chat = useChat(settings);

  // Resolve a deep link only after the server's conversations have loaded.
  useEffect(() => {
    if (!chat.ready) return;
    if (id && chat.conversations.some(c => c.id === id)) chat.setActiveConversationId(id);
  }, [id, chat.ready, chat.conversations]);

  const handleSend = async (content: string) => {
    setChatError('');
    try {
      if (!serverSettings.ready) throw new Error('Server settings are still loading');
      await chat.sendMessage(content);
    } catch (err) {
      setChatError(err instanceof Error ? err.message : 'Failed to send message');
    }
  };

  const handleUpdateSettings = (newSettings: Settings) => serverSettings.update(newSettings);
  const handleUpdateMCPServers = (servers: Settings['mcpServers']) =>
    serverSettings.update({ ...settings, mcpServers: servers });
  const activeModel = resolveModel(settings);


  return (
    <div className={`h-screen flex overflow-hidden ${
      resolvedTheme === 'dark' 
        ? 'bg-gray-900 text-white' 
        : 'bg-gray-50 text-gray-900'
    }`}>
      {/* Sidebar */}
      <Sidebar
        conversations={chat.conversations}
        activeId={chat.activeConversationId}
        theme={resolvedTheme}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onSelect={(conversationId) => {
          chat.setActiveConversationId(conversationId);
          navigate(`/c/${conversationId}`);
          setSidebarOpen(false);
        }}
        onNew={() => { void chat.createConversation().then(conversation => { if (conversation) navigate(`/c/${conversation.id}`); }); }}
        onDelete={chat.deleteConversation}
        onTogglePin={chat.togglePin}
        onOpenSettings={() => setActivePanel('settings')}
        onOpenMemory={() => setActivePanel('memory')}
        onOpenMCP={() => setActivePanel('mcp')}
      />

      {sidebarOpen && (
        <button
          aria-label="Close navigation"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
        />
      )}

      {/* Main Chat Area */}
      <main className={`min-w-0 flex-1 flex flex-col h-full ${
        resolvedTheme === 'dark' ? 'bg-gray-900' : 'bg-white'
      }`}>
        {/* Top Bar */}
        <header className={`min-w-0 h-14 border-b flex items-center justify-between gap-3 px-4 shrink-0 ${
          resolvedTheme === 'dark' 
            ? 'border-gray-700' 
            : 'border-gray-200'
        }`}>
          <div className="min-w-0 flex items-center gap-3">
            <button
              aria-label="Open navigation"
              onClick={() => setSidebarOpen(true)}
              className={`p-1.5 rounded-lg md:hidden ${
                resolvedTheme === 'dark' ? 'text-gray-400 hover:bg-gray-800 hover:text-white' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <h1 className={`min-w-0 truncate text-sm font-medium ${
              resolvedTheme === 'dark' ? 'text-white' : 'text-gray-900'
            }`}>
              {chat.activeConversation?.title || 'AI Chat'}
            </h1>
            {chat.activeConversation && (
              <>
                <span className={`text-xs ${
                  resolvedTheme === 'dark' ? 'text-gray-500' : 'text-gray-600'
                }`}>
                  {chat.activeConversation.messages.length} messages
                </span>
                {/* Pin Toggle Button in Header */}
                <button
                  onClick={() => chat.togglePin(chat.activeConversation!.id)}
                  className={`p-1.5 rounded-lg transition ${
                    chat.activeConversation.pinned
                      ? 'text-yellow-400 bg-yellow-400/10'
                      : resolvedTheme === 'dark'
                        ? 'text-gray-500 hover:text-yellow-400 hover:bg-gray-800'
                        : 'text-gray-400 hover:text-yellow-500 hover:bg-gray-100'
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
          <div className="min-w-0 flex items-center justify-end gap-2">
            <label className="text-xs">
              <span className="sr-only">Active model</span>
              <select aria-label="Active model" value={activeModel?.id ?? ''}
                disabled={!serverSettings.ready || serverSettings.saving || chat.isLoading}
                onChange={e => void serverSettings.selectModel(e.target.value)}
                className="max-w-[18rem] rounded border border-gray-500 bg-transparent p-1">
                {!settings.models?.length && <option value="">No model configured</option>}
                {settings.models?.map(model => <option key={model.id} value={model.id}>
                  {settings.providers?.find(p => p.id === model.providerId)?.name} — {model.label || model.name}
                </option>)}
              </select>
            </label>
            {settings.memoryEnabled && (
              <div className="hidden items-center gap-1.5 rounded-lg border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 sm:flex">
                <span className="text-xs text-amber-400">Memory on</span>
              </div>
            )}
            {settings.mcpServers.filter(s => s.enabled && s.status === 'connected').length > 0 && (
              <div className="hidden items-center gap-1.5 rounded-lg border border-purple-500/20 bg-purple-500/10 px-2.5 py-1 sm:flex">
                <span className="text-xs text-purple-400">
                  {settings.mcpServers.filter(s => s.enabled && s.status === 'connected').length} MCP
                </span>
              </div>
            )}
          </div>
        </header>

        {serverSettings.syncError && <button onClick={serverSettings.retry}>Retry loading settings</button>}
        {chat.syncError && !chat.ready && <button onClick={chat.retry}>Retry loading conversations</button>}
        {chat.retryNotice && <p role="status" className="px-4 py-2 text-sm text-amber-500">{chat.retryNotice}</p>}
        {/* Chat */}
        <ChatView
          messages={chat.activeConversation?.messages || []}
          isLoading={chat.isLoading || !serverSettings.ready || !chat.ready}
          streamContent={chat.streamContent}
          onSend={handleSend}
          error={chatError || serverSettings.syncError || chat.syncError || ''}
          theme={resolvedTheme}
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
          theme={resolvedTheme}
        />
      )}
      {activePanel === 'mcp' && serverSettings.ready && (
        <MCPPanel
          servers={settings.mcpServers}
          onUpdateServers={handleUpdateMCPServers}
          onClose={() => setActivePanel('none')}
          theme={resolvedTheme}
          settings={settings}
          onUpdateSettings={handleUpdateSettings}
        />
      )}
      {activePanel === 'settings' && serverSettings.ready && (
        <SettingsPanel
          settings={settings}
          onUpdate={handleUpdateSettings}
          onClose={() => setActivePanel('none')}
          theme={resolvedTheme}
        />
      )}
    </div>
  );
}
