import { useState } from 'react';
import { Settings, AIProvider, ProviderModel } from '../types';
import { saveSettings, generateId, migrateLegacyEndpoints } from '../utils/storage';
import * as apiClient from '../utils/api-client';

interface Props {
  settings: Settings;
  onUpdate: (settings: Settings) => void;
  onClose: () => void;
  theme: 'light' | 'dark';
}

export default function SettingsPanel({ settings, onUpdate, onClose, theme }: Props) {
  const [local, setLocal] = useState(() => migrateLegacyEndpoints(settings));
  const [providerDraft, setProviderDraft] = useState<AIProvider | null>(null);
  const [modelDraft, setModelDraft] = useState<ProviderModel | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const providers = local.providers ?? [];
  const models = local.models ?? [];
  const isDark = theme === 'dark';
  const inputClass = `w-full rounded border p-2 ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`;
  const buttonClass = 'rounded bg-blue-500 px-3 py-2 text-sm text-white disabled:opacity-50';
  const handleSave = async () => {
    if (providerDraft || modelDraft) { setError('Finish adding or editing the provider/model first.'); return; }
    setSaving(true); setError('');
    try {
      await apiClient.saveSettings(local);
      saveSettings(local); onUpdate(local); onClose();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to save settings');
    } finally { setSaving(false); }
  };
  const saveProvider = () => {
    if (!providerDraft) return;
    try {
      if (!['http:', 'https:'].includes(new URL(providerDraft.baseUrl).protocol)) throw new Error();
    } catch { setError('Enter a valid HTTP or HTTPS base URL.'); return; }
    if (!providerDraft.name.trim()) { setError('Enter a provider name.'); return; }
    const next = { ...providerDraft, name: providerDraft.name.trim(), baseUrl: providerDraft.baseUrl.trim() };
    setLocal({ ...local, providers: providers.some(p => p.id === next.id)
      ? providers.map(p => p.id === next.id ? next : p) : [...providers, next] });
    setProviderDraft(null); setError('');
  };
  const saveModel = () => {
    if (!modelDraft?.name.trim() || !providers.some(p => p.id === modelDraft.providerId)) {
      setError('Choose a provider and enter a model ID.'); return;
    }
    const next = { ...modelDraft, name: modelDraft.name.trim() };
    setLocal({ ...local, models: models.some(m => m.id === next.id)
      ? models.map(m => m.id === next.id ? next : m) : [...models, next],
      activeModelId: local.activeModelId ?? next.id });
    setModelDraft(null); setError('');
  };
  const deleteModels = (remaining: ProviderModel[], nextProviders = providers) => {
    setLocal({ ...local, providers: nextProviders, models: remaining,
      activeModelId: remaining.some(m => m.id === local.activeModelId) ? local.activeModelId : remaining[0]?.id ?? null });
  };
  return <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
    <div className={`w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border p-5 ${isDark ? 'bg-gray-800 text-white border-gray-700' : 'bg-white text-gray-900 border-gray-300'}`}>
      <h2 className="text-lg font-semibold mb-4">Settings</h2>
      {error && <p role="alert" className="text-red-400 mb-3">{error}</p>}
      <fieldset disabled={saving} className="space-y-6">
        <section className="space-y-3">
          <div className="flex justify-between items-center"><h3>Providers</h3>
            <button className={buttonClass} onClick={() => setProviderDraft({ id: generateId(), name: '', baseUrl: '', apiKey: '', createdAt: Date.now() })}>+ Add Provider</button>
          </div>
          <p className="text-xs opacity-70">A provider owns its base URL and API key. All its models share those credentials.</p>
          {providers.map(provider => <div key={provider.id} className="border border-gray-500 rounded p-3">
            <div className="flex justify-between gap-2"><strong>{provider.name}</strong>
              <div className="flex gap-2">
                <button aria-label={`Edit provider ${provider.name}`} onClick={() => setProviderDraft({ ...provider })}>Edit</button>
                <button aria-label={`Delete provider ${provider.name}`} onClick={() => deleteModels(models.filter(m => m.providerId !== provider.id), providers.filter(p => p.id !== provider.id))}>Delete</button>
              </div>
            </div>
            <p className="text-xs opacity-70">{provider.baseUrl}</p>
          </div>)}
          {providerDraft && <div className="space-y-2 border border-blue-500 rounded p-3">
            <h4>{providers.some(p => p.id === providerDraft.id) ? 'Edit Provider' : 'Add Provider'}</h4>
            <label className="block">Provider name<input aria-label="Provider name" className={inputClass} value={providerDraft.name} onChange={e => setProviderDraft({ ...providerDraft, name: e.target.value })} /></label>
            <label className="block">Base URL (OpenAI Compatible)<input aria-label="Base URL" className={inputClass} value={providerDraft.baseUrl} onChange={e => setProviderDraft({ ...providerDraft, baseUrl: e.target.value })} placeholder="https://openrouter.ai/api/v1" /></label>
            <label className="block">API Key<input aria-label="API Key" className={inputClass} type="password" value={providerDraft.apiKey} onChange={e => setProviderDraft({ ...providerDraft, apiKey: e.target.value })} /></label>
            <button className={buttonClass} onClick={saveProvider}>Save Provider</button>
            <button className="ml-3" onClick={() => setProviderDraft(null)}>Discard Provider</button>
          </div>}
        </section>
        <section className="space-y-3">
          <div className="flex justify-between items-center"><h3>Models</h3>
            <button className={buttonClass} disabled={!providers.length} onClick={() => setModelDraft({ id: generateId(), providerId: providers[0].id, name: '', createdAt: Date.now() })}>+ Add Model</button>
          </div>
          {!providers.length && <p>Add a provider before adding models.</p>}
          {models.map(model => <div key={model.id} className="border border-gray-500 rounded p-3 flex justify-between gap-2">
            <span>{model.label || model.name} <small className="opacity-70">({providers.find(p => p.id === model.providerId)?.name})</small></span>
            <div className="flex gap-2">
              {local.activeModelId === model.id ? <span>Active</span> : <button aria-label={`Activate ${model.name}`} onClick={() => setLocal({ ...local, activeModelId: model.id })}>Activate</button>}
              <button aria-label={`Edit model ${model.name}`} onClick={() => setModelDraft({ ...model })}>Edit</button>
              <button aria-label={`Delete model ${model.name}`} onClick={() => deleteModels(models.filter(m => m.id !== model.id))}>Delete</button>
            </div>
          </div>)}
          {modelDraft && <div className="space-y-2 border border-blue-500 rounded p-3">
            <label className="block">Provider<select aria-label="Provider" className={inputClass} value={modelDraft.providerId} onChange={e => setModelDraft({ ...modelDraft, providerId: e.target.value })}>
              {providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select></label>
            <label className="block">Model ID<input aria-label="Model ID" className={inputClass} value={modelDraft.name} onChange={e => setModelDraft({ ...modelDraft, name: e.target.value })} placeholder="openai/gpt-4o" /></label>
            <label className="block">Display name (optional)<input aria-label="Model display name" className={inputClass} value={modelDraft.label ?? ''} onChange={e => setModelDraft({ ...modelDraft, label: e.target.value })} /></label>
            <button className={buttonClass} onClick={saveModel}>{models.some(m => m.id === modelDraft.id) ? 'Update Model' : 'Add'}</button>
            <button className="ml-3" onClick={() => setModelDraft(null)}>Discard Model</button>
          </div>}
        </section>
        <section className="space-y-3"><h3>Memory Settings</h3>
          <label className="block"><input aria-label="Enable Memory" type="checkbox" checked={local.memoryEnabled} onChange={e => setLocal({ ...local, memoryEnabled: e.target.checked })} /> Enable Memory</label>
          <label className="block"><input aria-label="Auto-detect Facts" type="checkbox" checked={local.autoMemory} onChange={e => setLocal({ ...local, autoMemory: e.target.checked })} /> Auto-detect Facts</label>
        </section>
        <section><h3>Custom System Prompt</h3><textarea className={inputClass} value={local.customSystemPrompt || ''} onChange={e => setLocal({ ...local, customSystemPrompt: e.target.value })} placeholder="You are a helpful AI assistant. (Leave empty to use default)" rows={5} /></section>
        <section><h3>Theme</h3><div className="flex gap-3">{(['light', 'dark', 'system'] as const).map(value => <button key={value} className={local.theme === value ? buttonClass : 'p-2'} onClick={() => setLocal({ ...local, theme: value })}>{value[0].toUpperCase() + value.slice(1)}</button>)}</div></section>
        <div className="flex justify-end gap-3"><button onClick={onClose}>Cancel</button><button className={buttonClass} onClick={() => void handleSave()}>{saving ? 'Saving…' : 'Save Settings'}</button></div>
      </fieldset>
    </div>
  </div>;
}
