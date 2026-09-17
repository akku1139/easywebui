import { useState, useCallback, useRef, useEffect } from 'react';
import { Message, Conversation, UserFact, ConversationSummary, Settings } from '../types';
import { chatCompletion, extractMemoryFacts, summarizeConversation } from '../utils/api';
import * as server from '../utils/api-client';
import {
  loadConversations, saveConversations, loadUserFacts, saveUserFacts,
  loadSummaries, saveSummaries, generateId, resolveModel,
} from '../utils/storage';

export function useChat(settings: Settings) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [userFacts, setUserFacts] = useState<UserFact[]>([]);
  const [summaries, setSummaries] = useState<ConversationSummary[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [streamContent, setStreamContent] = useState('');
  const [ready, setReady] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const convRef = useRef(conversations);
  const factsRef = useRef(userFacts);
  const summariesRef = useRef(summaries);
  const busy = useRef(false);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const hydration = useRef<Promise<[Conversation[], UserFact[], ConversationSummary[]]> | null>(null);
  const commitConversations = (rows: Conversation[]) => {
    convRef.current = rows; setConversations(rows); saveConversations(rows);
  };
  const commitFacts = (rows: UserFact[]) => {
    factsRef.current = rows; setUserFacts(rows); saveUserFacts(rows);
  };
  const commitSummaries = (rows: ConversationSummary[]) => {
    summariesRef.current = rows; setSummaries(rows); saveSummaries(rows);
  };
  const errorText = (e: unknown) => e instanceof Error ? e.message : String(e);

  useEffect(() => {
    let cancelled = false;
    if (!hydration.current) hydration.current = (async () => {
      const [convs, facts, sums] = await Promise.all([
        server.fetchConversations(), server.fetchMemoryFacts(), server.fetchSummaries(),
      ]);
      if (!Array.isArray(convs) || !Array.isArray(facts) || !Array.isArray(sums)) throw new Error('Invalid server data');
      // Import legacy local-only records once; subsequent loads trust D1,
      // including deletions made on another device. Stable ids make retries safe.
      if (!localStorage.getItem('ai-chat-data-imported')) {
        for (const c of loadConversations()) if (!convs.some(row => row.id === c.id)) {
          await server.saveConversation(c); convs.push(c);
        }
        for (const f of loadUserFacts()) if (!facts.some(row => row.id === f.id)) {
          await server.addMemoryFact(f); facts.push(f);
        }
        for (const s of loadSummaries()) if (!sums.some(row => row.id === s.id)) {
          await server.addSummary(s); sums.push(s);
        }
        localStorage.setItem('ai-chat-data-imported', 'true');
      }
      return [convs, facts, sums] as [Conversation[], UserFact[], ConversationSummary[]];
    })();
    hydration.current.then(([convs, facts, sums]) => {
      if (cancelled) return;
      commitConversations(convs); commitFacts(facts); commitSummaries(sums);
      setReady(true); setSyncError(null);
    }).catch(error => {
      hydration.current = null;
      if (!cancelled) setSyncError(`Failed to load server data: ${errorText(error)}`);
    });
    return () => { cancelled = true; };
  }, [attempt]);

  // Acknowledged writes are serialized: old snapshots cannot overtake newer ones.
  const persist = async <T,>(work: () => Promise<T>): Promise<T | undefined> => {
    if (!ready) { setSyncError('Server data is still loading'); return undefined; }
    const next = queue.current.catch(() => {}).then(work);
    queue.current = next;
    try { const result = await next; setSyncError(null); return result; }
    catch (error) { setSyncError(`Failed to save server data: ${errorText(error)}`); return undefined; }
  };
  const activeEndpoint = resolveModel(settings);
  const activeConversation = conversations.find(c => c.id === activeConversationId) ?? null;

  const createConversation = async () => persist(async () => {
    const conversation: Conversation = { id: generateId(), title: 'New Chat', messages: [],
      createdAt: Date.now(), updatedAt: Date.now(), model: activeEndpoint?.model || 'gpt-4o' };
    await server.saveConversation(conversation);
    commitConversations([conversation, ...convRef.current]);
    setActiveConversationId(conversation.id);
    return conversation;
  });
  const deleteConversation = async (id: string) => {
    if (busy.current) return;
    await persist(async () => {
      await server.deleteConversation(id);
      const updated = convRef.current.filter(c => c.id !== id);
      commitConversations(updated);
      setActiveConversationId(current => current === id ? updated[0]?.id ?? null : current);
    });
  };
  const togglePin = async (id: string) => persist(async () => {
    const conv = convRef.current.find(c => c.id === id);
    if (!conv) return;
    await server.updateConversation(id, { pinned: !conv.pinned });
    commitConversations(convRef.current.map(c => c.id === id ? { ...c, pinned: !conv.pinned } : c));
  });

  const buildSystemPrompt = useCallback(() => {
    const parts = [settings.customSystemPrompt?.trim() || 'You are a helpful AI assistant.'];
    if (settings.memoryEnabled && userFacts.length) {
      parts.push('\n## User Memory (facts you know about this user):');
      [...userFacts].sort((a, b) => a.id.localeCompare(b.id)).forEach(f => parts.push(`- ${f.content}`));
    }
    if (settings.memoryEnabled && summaries.length) {
      parts.push('\n## Recent Conversations:');
      [...summaries].sort((a, b) => b.createdAt - a.createdAt).slice(0, 10)
        .forEach(s => parts.push(`- ${s.date}: "${s.title}" - ${s.summary}`));
    }
    const tools = settings.mcpServers.filter(s => s.enabled).sort((a, b) => a.name.localeCompare(b.name))
      .flatMap(s => s.tools).sort((a, b) => a.name.localeCompare(b.name));
    if (tools.length) {
      parts.push('\n## Available Tools (via MCP):');
      tools.forEach(t => parts.push(`- ${t.name}: ${t.description}`));
    }
    return parts.join('\n');
  }, [settings, userFacts, summaries]);

  const storeFact = async (fact: UserFact) => persist(async () => {
    await server.addMemoryFact(fact);
    commitFacts([...factsRef.current, fact]);
  });
  const sendMessage = async (content: string) => {
    if (!ready) throw new Error('Server data is still loading');
    if (!activeEndpoint) throw new Error('No active model. Configure a provider and model in Settings.');
    if (!activeEndpoint.baseUrl || !activeEndpoint.apiKey) throw new Error('API configuration is missing. Please configure in Settings.');
    if (busy.current) return;
    busy.current = true; setIsLoading(true); setStreamContent('');
    try {
      const conv = activeConversation ?? await createConversation();
      if (!conv) throw new Error('Failed to save conversation');
      const user: Message = { id: generateId(), role: 'user', content, timestamp: Date.now() };
      const updated = { ...conv, messages: [...conv.messages, user], updatedAt: Date.now(),
        model: activeEndpoint.model, title: conv.messages.length ? conv.title : content.slice(0, 50) };
      const saved = await persist(async () => {
        await server.saveConversation(updated);
        commitConversations(convRef.current.map(c => c.id === conv.id ? updated : c));
        return true;
      });
      if (!saved) throw new Error('Failed to save your message');
      const tools = settings.mcpServers.filter(s => s.enabled && s.status === 'connected')
        .flatMap(s => s.tools.map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })));
      const response = await chatCompletion(activeEndpoint, [
        { id: 'system', role: 'system', content: buildSystemPrompt(), timestamp: Date.now() }, ...updated.messages,
      ], tools.length ? tools : undefined, chunk => setStreamContent(previous => previous + chunk));
      const assistant: Message = { id: generateId(), role: 'assistant', content: response.content,
        timestamp: Date.now(), model: activeEndpoint.model, toolCalls: response.toolCalls };
      const complete = { ...updated, messages: [...updated.messages, assistant], updatedAt: Date.now() };
      const stored = await persist(async () => {
        await server.saveConversation(complete);
        commitConversations(convRef.current.map(c => c.id === conv.id ? { ...complete, pinned: c.pinned } : c));
        return true;
      });
      if (!stored) {
        // Preserve a recoverable local draft, without claiming the server saved it.
        saveConversations(convRef.current.map(c => c.id === conv.id ? complete : c));
        throw new Error('Reply could not be saved to server; a draft remains in this browser.');
      }
      setStreamContent('');
      if (settings.autoMemory && settings.memoryEnabled) {
        try {
          const facts = await extractMemoryFacts(activeEndpoint, [user, assistant]);
          for (const text of facts) await storeFact({ id: generateId(), content: text, category: 'other',
            createdAt: Date.now(), updatedAt: Date.now(), source: 'auto_detected' });
        } catch (error) { setSyncError(`Automatic memory failed: ${errorText(error)}`); }
      }
      return assistant;
    } finally { busy.current = false; setIsLoading(false); }
  };
  const addUserFact = async (content: string, category: UserFact['category'] = 'other') => storeFact({
    id: generateId(), content, category, createdAt: Date.now(), updatedAt: Date.now(), source: 'explicit',
  });
  const removeUserFact = async (id: string) => persist(async () => {
    await server.deleteMemoryFact(id); commitFacts(factsRef.current.filter(f => f.id !== id));
  });
  const summarizeAndArchive = async (id: string) => {
    const conv = convRef.current.find(c => c.id === id);
    if (!conv?.messages.length || !activeEndpoint) return;
    try {
      const response = await summarizeConversation(activeEndpoint, conv.messages);
      const summary: ConversationSummary = { ...response, id: generateId(), date: new Date(conv.updatedAt).toLocaleDateString(),
        createdAt: Date.now(), messageCount: conv.messages.length };
      await persist(async () => { await server.addSummary(summary); commitSummaries([summary, ...summariesRef.current]); });
    } catch (error) { setSyncError(`Summary failed: ${errorText(error)}`); }
  };
  return { conversations, activeConversation, activeConversationId, setActiveConversationId,
    createConversation, deleteConversation, togglePin, sendMessage, isLoading, streamContent,
    userFacts, summaries, addUserFact, removeUserFact, summarizeAndArchive, ready, syncError,
    retry: () => { hydration.current = null; setAttempt(n => n + 1); } };
}
