import { useState } from 'react';
import { Settings } from '../types';
import { saveSettings } from '../utils/storage';

interface Props {
  settings: Settings;
  onUpdate: (settings: Settings) => void;
  onClose: () => void;
}

export default function SettingsPanel({ settings, onUpdate, onClose }: Props) {
  const [local, setLocal] = useState<Settings>({ ...settings });

  const handleSave = () => {
    onUpdate(local);
    saveSettings(local);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="w-full max-w-lg max-h-[80vh] bg-gray-800 border border-gray-700 rounded-2xl shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-gray-500 to-gray-600 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-white">Settings</h2>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-white transition">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* API Configuration */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-white flex items-center gap-2">
              <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
              </svg>
              API Configuration
            </h3>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Base URL (OpenAI Compatible)</label>
              <input
                value={local.apiConfig.baseUrl}
                onChange={e => setLocal({ ...local, apiConfig: { ...local.apiConfig, baseUrl: e.target.value } })}
                placeholder="https://api.openai.com"
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                Supports: OpenAI, Cloudflare Workers AI, Azure OpenAI, local LLMs, etc.
              </p>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">API Key</label>
              <input
                type="password"
                value={local.apiConfig.apiKey}
                onChange={e => setLocal({ ...local, apiConfig: { ...local.apiConfig, apiKey: e.target.value } })}
                placeholder="sk-..."
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Model</label>
              <input
                value={local.apiConfig.model}
                onChange={e => setLocal({ ...local, apiConfig: { ...local.apiConfig, model: e.target.value } })}
                placeholder="gpt-4o"
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Memory Settings */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-white flex items-center gap-2">
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
                className="w-4 h-4 rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-blue-500"
              />
              <div>
                <span className="text-sm text-white">Enable Memory</span>
                <p className="text-xs text-gray-400">Inject user facts and conversation summaries into context</p>
              </div>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={local.autoMemory}
                onChange={e => setLocal({ ...local, autoMemory: e.target.checked })}
                className="w-4 h-4 rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-blue-500"
              />
              <div>
                <span className="text-sm text-white">Auto-detect Facts</span>
                <p className="text-xs text-gray-400">Automatically extract and store important facts from conversations</p>
              </div>
            </label>
          </div>

          {/* Architecture Info */}
          <div className="p-3 bg-gray-700/50 rounded-lg border border-gray-600">
            <h4 className="text-xs font-medium text-gray-300 mb-2">Memory Architecture (ChatGPT-style)</h4>
            <div className="space-y-1.5 text-xs text-gray-400">
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 bg-blue-500/30 rounded text-center text-[10px] leading-4">1</span>
                <span>Session Metadata — device, timezone, preferences</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 bg-green-500/30 rounded text-center text-[10px] leading-4">2</span>
                <span>User Facts — permanent stored knowledge</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 bg-purple-500/30 rounded text-center text-[10px] leading-4">3</span>
                <span>Conversation Summaries — recent chat summaries</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 bg-orange-500/30 rounded text-center text-[10px] leading-4">4</span>
                <span>Current Session — full message history</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-gray-700 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white transition"
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
    </div>
  );
}
