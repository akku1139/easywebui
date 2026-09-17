import { Conversation } from '../types';

interface Props {
  conversations: Conversation[];
  activeId: string | null;
  theme: 'light' | 'dark';
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onTogglePin: (id: string) => void;
  onOpenSettings: () => void;
  onOpenMemory: () => void;
  onOpenMCP: () => void;
  isOpen?: boolean;
  onClose?: () => void;
}

export default function Sidebar({
  conversations, activeId, theme, onSelect, onNew, onDelete, onTogglePin,
  onOpenSettings, onOpenMemory, onOpenMCP, isOpen = true, onClose
}: Props) {
  // Sort conversations: pinned first, then by updatedAt descending
  const sortedConversations = [...conversations].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return b.updatedAt - a.updatedAt;
  });

  const pinnedConversations = sortedConversations.filter(c => c.pinned);
  const unpinnedConversations = sortedConversations.filter(c => !c.pinned);
  
  const isDark = theme === 'dark';
  
  return (
    <div className={`w-72 h-full shrink-0 flex flex-col transition-transform duration-200 max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-40 max-md:w-[min(18rem,calc(100vw-3rem))] max-md:shadow-2xl ${
      isOpen ? 'max-md:translate-x-0' : 'max-md:-translate-x-full'
    } ${
      isDark
        ? 'bg-gray-900 border-gray-700'
        : 'bg-white border-gray-200'
    } border-r`}>
      {/* Header */}
      <div className={`p-4 border-b ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
        <button
          onClick={onNew}
          className="w-full py-2.5 px-4 bg-gradient-to-r from-blue-500 to-purple-600 text-white text-sm font-medium rounded-lg hover:from-blue-600 hover:to-purple-700 transition flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Chat
        </button>
        <button
          onClick={onClose}
          className={`mt-2 w-full md:hidden flex items-center justify-center gap-2 py-2 text-xs rounded-lg transition ${
            isDark ? 'text-gray-400 hover:bg-gray-800 hover:text-white' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
          }`}
        >
          Close menu
        </button>
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {/* Pinned Conversations */}
        {pinnedConversations.length > 0 && (
          <div className="mb-3">
            <div className="px-3 py-1 text-xs font-medium text-gray-500 uppercase tracking-wider">
              📌 Pinned
            </div>
            {pinnedConversations.map(conv => (
              <ConversationItem
                key={conv.id}
                conv={conv}
                isActive={conv.id === activeId}
                onSelect={onSelect}
                onDelete={onDelete}
                onTogglePin={onTogglePin}
              />
            ))}
          </div>
        )}

        {/* Unpinned Conversations */}
        {unpinnedConversations.length > 0 && (
          <div>
            {pinnedConversations.length > 0 && (
              <div className="px-3 py-1 text-xs font-medium text-gray-500 uppercase tracking-wider">
                Recent
              </div>
            )}
            {unpinnedConversations.map(conv => (
              <ConversationItem
                key={conv.id}
                conv={conv}
                isActive={conv.id === activeId}
                onSelect={onSelect}
                onDelete={onDelete}
                onTogglePin={onTogglePin}
              />
            ))}
          </div>
        )}

        {conversations.length === 0 && (
          <div className="text-center text-gray-500 text-sm py-8">
            No conversations yet
          </div>
        )}
      </div>

      {/* Footer Navigation */}
      <div className={`p-3 border-t space-y-1 ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
        <button
          onClick={() => { onOpenMemory(); onClose?.(); }}
        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition text-sm ${
          isDark ? 'text-gray-400 hover:text-white hover:bg-gray-800' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
        }`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          Memory
        </button>
        <button
          onClick={() => { onOpenMCP(); onClose?.(); }}
        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition text-sm ${
          isDark ? 'text-gray-400 hover:text-white hover:bg-gray-800' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
        }`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          MCP Servers
        </button>
        <button
          onClick={() => { onOpenSettings(); onClose?.(); }}
        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition text-sm ${
          isDark ? 'text-gray-400 hover:text-white hover:bg-gray-800' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
        }`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Settings
        </button>
      </div>
    </div>
  );
}

// Conversation Item Component
interface ConversationItemProps {
  conv: Conversation;
  isActive: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onTogglePin: (id: string) => void;
}

function ConversationItem({ conv, isActive, onSelect, onDelete, onTogglePin }: ConversationItemProps) {
  return (
    <div
      className={`group flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition ${
        isActive
          ? 'bg-gray-700/70 text-white'
          : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
      }`}
      onClick={() => onSelect(conv.id)}
    >
      <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
      </svg>
      <span className="flex-1 text-sm truncate">{conv.title}</span>
      
      {/* Pin Button */}
      <button
        onClick={(e) => { e.stopPropagation(); onTogglePin(conv.id); }}
        className={`p-1 transition ${
          conv.pinned 
            ? 'text-yellow-400 opacity-100' 
            : 'opacity-0 group-hover:opacity-100 hover:text-yellow-400'
        }`}
        title={conv.pinned ? 'Unpin conversation' : 'Pin conversation'}
      >
        <svg className="w-3.5 h-3.5" fill={conv.pinned ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
        </svg>
      </button>

      {/* Delete Button */}
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(conv.id); }}
        className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 transition"
        title="Delete conversation"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>
    </div>
  );
}
