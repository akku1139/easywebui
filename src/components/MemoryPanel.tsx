import { useState } from 'react';
import { UserFact, ConversationSummary } from '../types';

interface Props {
  facts: UserFact[];
  summaries: ConversationSummary[];
  onAddFact: (content: string, category: UserFact['category']) => void;
  onRemoveFact: (id: string) => void;
  onClose: () => void;
  theme: 'light' | 'dark';
}

export default function MemoryPanel({ facts, summaries, onAddFact, onRemoveFact, onClose, theme }: Props) {
  const isDark = theme === 'dark';
  const [newFact, setNewFact] = useState('');
  const [category, setCategory] = useState<UserFact['category']>('other');
  const [tab, setTab] = useState<'facts' | 'summaries'>('facts');

  const handleAdd = () => {
    if (newFact.trim()) {
      onAddFact(newFact.trim(), category);
      setNewFact('');
    }
  };

  const categoryColors: Record<string, string> = {
    preference: 'bg-blue-500/20 text-blue-300',
    personal: 'bg-green-500/20 text-green-300',
    work: 'bg-purple-500/20 text-purple-300',
    project: 'bg-orange-500/20 text-orange-300',
    other: 'bg-gray-500/20 text-gray-300',
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
            <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <div>
              <h2 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>Memory</h2>
              <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>ChatGPT-style persistent memory (4-layer architecture)</p>
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

        {/* Info Banner */}
        <div className="mx-5 mt-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
          <p className="text-xs text-blue-300">
            <strong>Memory Architecture:</strong> Based on ChatGPT's 4-layer approach — 
            ① Session Metadata ② User Facts (this panel) ③ Conversation Summaries ④ Current Session.
            Facts are auto-detected from conversations or manually added.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-5 mt-4">
          <button
            onClick={() => setTab('facts')}
            className={`px-4 py-2 text-sm rounded-lg transition ${
              tab === 'facts' 
                ? isDark ? 'bg-gray-700 text-white' : 'bg-gray-200 text-gray-900'
                : isDark ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            User Facts ({facts.length})
          </button>
          <button
            onClick={() => setTab('summaries')}
            className={`px-4 py-2 text-sm rounded-lg transition ${
              tab === 'summaries' 
                ? isDark ? 'bg-gray-700 text-white' : 'bg-gray-200 text-gray-900'
                : isDark ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Summaries ({summaries.length})
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {tab === 'facts' && (
            <div className="space-y-3">
              {/* Add new fact */}
              <div className="flex gap-2">
                <input
                  value={newFact}
                  onChange={e => setNewFact(e.target.value)}
                  placeholder="Add a fact to remember..."
                  className={`flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                    isDark 
                      ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                      : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                  }`}
                  onKeyDown={e => e.key === 'Enter' && handleAdd()}
                />
                <select
                  value={category}
                  onChange={e => setCategory(e.target.value as UserFact['category'])}
                  className={`px-3 py-2 border rounded-lg text-sm focus:outline-none ${
                    isDark 
                      ? 'bg-gray-700 border-gray-600 text-white' 
                      : 'bg-white border-gray-300 text-gray-900'
                  }`}
                >
                  <option value="personal">Personal</option>
                  <option value="preference">Preference</option>
                  <option value="work">Work</option>
                  <option value="project">Project</option>
                  <option value="other">Other</option>
                </select>
                <button
                  onClick={handleAdd}
                  className="px-4 py-2 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 transition"
                >
                  Add
                </button>
              </div>

              {/* Facts list */}
              {facts.length === 0 ? (
                <div className={`text-center py-8 text-sm ${isDark ? 'text-gray-500' : 'text-gray-600'}`}>
                  No memories yet. Facts will be auto-detected from conversations or you can add them manually.
                </div>
              ) : (
                <div className="space-y-2">
                  {facts.map(fact => (
                    <div key={fact.id} className={`flex items-start gap-3 p-3 rounded-lg group ${
                      isDark ? 'bg-gray-700/50' : 'bg-gray-100'
                    }`}>
                      <span className={`px-2 py-0.5 text-xs rounded-full shrink-0 ${categoryColors[fact.category]}`}>
                        {fact.category}
                      </span>
                      <p className={`flex-1 text-sm ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>{fact.content}</p>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-600'}`}>
                          {fact.source === 'auto_detected' ? '🤖' : '✏️'}
                        </span>
                        <button
                          onClick={() => onRemoveFact(fact.id)}
                          className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-400 transition"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'summaries' && (
            <div className="space-y-3">
              {summaries.length === 0 ? (
                <div className={`text-center py-8 text-sm ${isDark ? 'text-gray-500' : 'text-gray-600'}`}>
                  No conversation summaries yet. Summaries are created when conversations are archived.
                </div>
              ) : (
                summaries.map(summary => (
                  <div key={summary.id} className={`p-3 rounded-lg ${
                    isDark ? 'bg-gray-700/50' : 'bg-gray-100'
                  }`}>
                    <div className="flex items-center justify-between mb-1">
                      <h4 className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>{summary.title}</h4>
                      <span className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-600'}`}>{summary.date}</span>
                    </div>
                    <p className={`text-xs whitespace-pre-wrap ${isDark ? 'text-gray-400' : 'text-gray-700'}`}>{summary.summary}</p>
                    <span className={`text-xs mt-1 ${isDark ? 'text-gray-500' : 'text-gray-600'}`}>{summary.messageCount} messages</span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
