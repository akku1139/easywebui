import { useState } from 'react';
import { Settings, APIEndpoint } from '../types';
import { saveSettings, generateId } from '../utils/storage';

interface Props {
  settings: Settings;
  onUpdate: (settings: Settings) => void;
  onClose: () => void;
  theme: 'light' | 'dark';
}

export default function SettingsPanel({ settings, onUpdate, onClose, theme }: Props) {
  const isDark = theme === 'dark';
  const [local, setLocal] = useState<Settings>({ ...settings });
  const [editingEndpoint, setEditingEndpoint] = useState<APIEndpoint | null>(null);
  const [showAddEndpoint, setShowAddEndpoint] = useState(false);

  const handleSave = () => {
    onUpdate(local);
    saveSettings(local);
    onClose();
  };

  const addEndpoint = (endpoint: Omit<APIEndpoint, 'id' | 'createdAt'>) => {
    const newEndpoint: APIEndpoint = {
      ...endpoint,
      id: generateId(),
      createdAt: Date.now(),
    };
    const updatedEndpoints = [...local.endpoints, newEndpoint];
    const updatedSettings = {
      ...local,
      endpoints: updatedEndpoints,
      activeEndpointId: local.activeEndpointId || newEndpoint.id,
    };
    setLocal(updatedSettings);
    setShowAddEndpoint(false);
  };

  const updateEndpoint = (id: string, updates: Partial<APIEndpoint>) => {
    const updatedEndpoints = local.endpoints.map(e => 
      e.id === id ? { ...e, ...updates } : e
    );
    setLocal({ ...local, endpoints: updatedEndpoints });
    setEditingEndpoint(null);
  };

  const deleteEndpoint = (id: string) => {
    const updatedEndpoints = local.endpoints.filter(e => e.id !== id);
    const updatedSettings = {
      ...local,
      endpoints: updatedEndpoints,
      activeEndpointId: local.activeEndpointId === id ? null : local.activeEndpointId,
    };
    setLocal(updatedSettings);
  };

  const setActiveEndpoint = (id: string) => {
    setLocal({ ...local, activeEndpointId: id });
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`w-full max-w-2xl max-h-[90vh] border rounded-2xl shadow-2xl flex flex-col ${
        isDark 
          ? 'bg-gray-800 border-gray-700' 
          : 'bg-white border-gray-300'
      }`}>
        {/* Header */}
        <div className={`flex items-center justify-between p-5 border-b ${
          isDark ? 'border-gray-700' : 'border-gray-300'
        }`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-gray-500 to-gray-600 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <h2 className={`text-lg font-semibold ${
              isDark ? 'text-white' : 'text-gray-900'
            }`}>Settings</h2>
          </div>
          <button onClick={onClose} className={`p-2 transition ${
            isDark 
              ? 'text-gray-400 hover:text-white' 
              : 'text-gray-600 hover:text-gray-900'
          }`}>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* API Endpoints */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className={`text-sm font-medium flex items-center gap-2 ${
                isDark ? 'text-white' : 'text-gray-900'
              }`}>
                <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                </svg>
                API Endpoints
              </h3>
              <button
                onClick={() => setShowAddEndpoint(true)}
                className="px-3 py-1.5 text-xs bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition"
              >
                + Add Endpoint
              </button>
            </div>

            {local.endpoints.length === 0 ? (
              <div className="text-center py-8 text-gray-500 text-sm">
                No endpoints configured. Add an API endpoint to get started.
              </div>
            ) : (
              <div className="space-y-2">
                {local.endpoints.map(endpoint => (
                  <div
                    key={endpoint.id}
                    className={`p-3 rounded-lg border transition ${
                      local.activeEndpointId === endpoint.id
                        ? 'bg-blue-500/10 border-blue-500/30'
                        : isDark
                          ? 'bg-gray-700/50 border-gray-600'
                          : 'bg-gray-100 border-gray-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${
                          endpoint.baseUrl && endpoint.apiKey ? 'bg-green-400' : 'bg-red-400'
                        }`} />
                        <span className={`text-sm font-medium ${
                          isDark ? 'text-white' : 'text-gray-900'
                        }`}>{endpoint.name}</span>
                        {local.activeEndpointId === endpoint.id && (
                          <span className={`text-xs px-2 py-0.5 rounded ${
                            isDark 
                              ? 'bg-blue-500/20 text-blue-300' 
                              : 'bg-blue-100 text-blue-700'
                          }`}>Active</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {local.activeEndpointId !== endpoint.id && (
                          <button
                            onClick={() => setActiveEndpoint(endpoint.id)}
                            className={`px-2 py-1 text-xs rounded transition ${
                              isDark 
                                ? 'bg-gray-600 text-gray-200 hover:bg-gray-500' 
                                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                            }`}
                          >
                            Activate
                          </button>
                        )}
                        <button
                          onClick={() => setEditingEndpoint(endpoint)}
                          className={`p-1 transition ${
                            isDark 
                              ? 'text-gray-400 hover:text-white' 
                              : 'text-gray-600 hover:text-gray-900'
                          }`}
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => deleteEndpoint(endpoint.id)}
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
                    <div className={`text-xs space-y-1 ${
                      isDark ? 'text-gray-400' : 'text-gray-600'
                    }`}>
                      <div>URL: {endpoint.baseUrl || '(not set)'}</div>
                      <div>Model: {endpoint.model}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Memory Settings */}
          <div className="space-y-3">
            <h3 className={`text-sm font-medium flex items-center gap-2 ${
              isDark ? 'text-white' : 'text-gray-900'
            }`}>
              <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              Memory Settings
            </h3>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={local.memoryEnabled}
                onChange={e => setLocal({ ...local, memoryEnabled: e.target.checked })}
                className={`w-4 h-4 rounded border text-blue-500 focus:ring-blue-500 ${
                  isDark 
                    ? 'bg-gray-700 border-gray-600' 
                    : 'bg-white border-gray-300'
                }`}
              />
              <div>
                <span className={`text-sm ${
                  isDark ? 'text-white' : 'text-gray-900'
                }`}>Enable Memory</span>
                <p className={`text-xs ${
                  isDark ? 'text-gray-400' : 'text-gray-600'
                }`}>Inject user facts and conversation summaries into context</p>
              </div>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={local.autoMemory}
                onChange={e => setLocal({ ...local, autoMemory: e.target.checked })}
                className={`w-4 h-4 rounded border text-blue-500 focus:ring-blue-500 ${
                  isDark 
                    ? 'bg-gray-700 border-gray-600' 
                    : 'bg-white border-gray-300'
                }`}
              />
              <div>
                <span className={`text-sm ${
                  isDark ? 'text-white' : 'text-gray-900'
                }`}>Auto-detect Facts</span>
                <p className={`text-xs ${
                  isDark ? 'text-gray-400' : 'text-gray-600'
                }`}>Automatically extract and store important facts from conversations</p>
              </div>
            </label>
          </div>

          {/* Custom System Prompt */}
          <div className="space-y-3">
            <h3 className={`text-sm font-medium flex items-center gap-2 ${
              isDark ? 'text-white' : 'text-gray-900'
            }`}>
              <svg className="w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Custom System Prompt
            </h3>
            <div>
              <textarea
                value={local.customSystemPrompt || ''}
                onChange={e => setLocal({ ...local, customSystemPrompt: e.target.value })}
                placeholder="You are a helpful AI assistant. (Leave empty to use default)"
                rows={6}
                className={`w-full px-3 py-2 border rounded-lg text-sm resize-none font-mono focus:outline-none focus:ring-1 focus:ring-purple-500 ${
                  isDark 
                    ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                    : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                }`}
              />
              <p className={`text-xs mt-1 ${
                isDark ? 'text-gray-400' : 'text-gray-600'
              }`}>
                Customize the AI's behavior. This replaces the default system prompt. Memory and tools are still appended.
              </p>
            </div>
          </div>

          {/* Theme */}
          <div className="space-y-3">
            <h3 className={`text-sm font-medium flex items-center gap-2 ${
              isDark ? 'text-white' : 'text-gray-900'
            }`}>
              <svg className="w-4 h-4 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
              Theme
            </h3>
            <div className="grid grid-cols-3 gap-3">
              <button
                onClick={() => setLocal({ ...local, theme: 'light' })}
                className={`px-4 py-3 rounded-lg border-2 transition ${
                  local.theme === 'light'
                    ? 'border-blue-500 bg-blue-500/10'
                    : isDark
                      ? 'border-gray-600 bg-gray-700/50 hover:border-gray-500'
                      : 'border-gray-300 bg-gray-100 hover:border-gray-400'
                }`}
              >
                <div className="flex flex-col items-center gap-2">
                  <svg className={`w-5 h-5 ${isDark ? 'text-white' : 'text-gray-900'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                  <span className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>Light</span>
                </div>
              </button>
              <button
                onClick={() => setLocal({ ...local, theme: 'dark' })}
                className={`px-4 py-3 rounded-lg border-2 transition ${
                  local.theme === 'dark'
                    ? 'border-blue-500 bg-blue-500/10'
                    : isDark
                      ? 'border-gray-600 bg-gray-700/50 hover:border-gray-500'
                      : 'border-gray-300 bg-gray-100 hover:border-gray-400'
                }`}
              >
                <div className="flex flex-col items-center gap-2">
                  <svg className={`w-5 h-5 ${isDark ? 'text-white' : 'text-gray-900'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                  </svg>
                  <span className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>Dark</span>
                </div>
              </button>
              <button
                onClick={() => setLocal({ ...local, theme: 'system' })}
                className={`px-4 py-3 rounded-lg border-2 transition ${
                  local.theme === 'system'
                    ? 'border-blue-500 bg-blue-500/10'
                    : isDark
                      ? 'border-gray-600 bg-gray-700/50 hover:border-gray-500'
                      : 'border-gray-300 bg-gray-100 hover:border-gray-400'
                }`}
              >
                <div className="flex flex-col items-center gap-2">
                  <svg className={`w-5 h-5 ${isDark ? 'text-white' : 'text-gray-900'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <span className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>System</span>
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className={`p-5 border-t flex justify-end gap-3 ${
          isDark ? 'border-gray-700' : 'border-gray-300'
        }`}>
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
          <button
            onClick={handleSave}
            className="px-6 py-2 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 transition"
          >
            Save Settings
          </button>
        </div>
      </div>

      {/* Add/Edit Endpoint Modal */}
      {(showAddEndpoint || editingEndpoint) && (
        <EndpointModal
          endpoint={editingEndpoint}
          theme={theme}
          onSave={(data) => {
            if (editingEndpoint) {
              updateEndpoint(editingEndpoint.id, data);
            } else {
              addEndpoint(data);
            }
          }}
          onClose={() => {
            setShowAddEndpoint(false);
            setEditingEndpoint(null);
          }}
        />
      )}
    </div>
  );
}

// Endpoint Modal Component
interface EndpointModalProps {
  endpoint: APIEndpoint | null;
  theme: 'light' | 'dark';
  onSave: (data: Omit<APIEndpoint, 'id' | 'createdAt'>) => void;
  onClose: () => void;
}

function EndpointModal({ endpoint, theme, onSave, onClose }: EndpointModalProps) {
  const isDark = theme === 'dark';
  const [name, setName] = useState(endpoint?.name || '');
  const [baseUrl, setBaseUrl] = useState(endpoint?.baseUrl || '');
  const [apiKey, setApiKey] = useState(endpoint?.apiKey || '');
  const [model, setModel] = useState(endpoint?.model || 'gpt-4o');
  const [isDefault, setIsDefault] = useState(endpoint?.isDefault || false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      name: name || 'Unnamed Endpoint',
      baseUrl,
      apiKey,
      model,
      enabled: true,
      isDefault,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
      <div className={`w-full max-w-lg border rounded-2xl shadow-2xl ${
        isDark 
          ? 'bg-gray-800 border-gray-700' 
          : 'bg-white border-gray-300'
      }`}>
        <div className={`p-5 border-b ${
          isDark ? 'border-gray-700' : 'border-gray-300'
        }`}>
          <h3 className={`text-lg font-semibold ${
            isDark ? 'text-white' : 'text-gray-900'
          }`}>
            {endpoint ? 'Edit Endpoint' : 'Add Endpoint'}
          </h3>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className={`block text-xs mb-1 ${
              isDark ? 'text-gray-400' : 'text-gray-600'
            }`}>Name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g., OpenAI, Claude, Local LLM"
              className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                isDark 
                  ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                  : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
              }`}
              required
            />
          </div>
          <div>
            <label className={`block text-xs mb-1 ${
              isDark ? 'text-gray-400' : 'text-gray-600'
            }`}>Base URL (OpenAI Compatible)</label>
            <input
              value={baseUrl}
              onChange={e => setBaseUrl(e.target.value)}
              placeholder="https://api.openai.com"
              className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                isDark 
                  ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                  : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
              }`}
              required
            />
            <p className={`text-xs mt-1 ${
              isDark ? 'text-gray-500' : 'text-gray-600'
            }`}>
              Supports: OpenAI, Cloudflare Workers AI, Azure OpenAI, Ollama, etc.
            </p>
          </div>
          <div>
            <label className={`block text-xs mb-1 ${
              isDark ? 'text-gray-400' : 'text-gray-600'
            }`}>API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder="sk-..."
              className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                isDark 
                  ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                  : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
              }`}
              required
            />
          </div>
          <div>
            <label className={`block text-xs mb-1 ${
              isDark ? 'text-gray-400' : 'text-gray-600'
            }`}>Model</label>
            <input
              value={model}
              onChange={e => setModel(e.target.value)}
              placeholder="gpt-4o"
              className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                isDark 
                  ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                  : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
              }`}
              required
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={e => setIsDefault(e.target.checked)}
              className={`w-4 h-4 rounded border text-blue-500 focus:ring-blue-500 ${
                isDark 
                  ? 'bg-gray-700 border-gray-600' 
                  : 'bg-white border-gray-300'
              }`}
            />
            <span className={`text-sm ${
              isDark ? 'text-white' : 'text-gray-900'
            }`}>Set as default endpoint</span>
          </label>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className={`px-4 py-2 text-sm transition ${
                isDark 
                  ? 'text-gray-400 hover:text-white' 
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-6 py-2 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 transition"
            >
              {endpoint ? 'Update' : 'Add'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
