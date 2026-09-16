import { useState, useCallback, useRef } from 'react';
import { Message, Conversation, UserFact, ConversationSummary, Settings, MCPServer } from '../types';
import { chatCompletion, extractMemoryFacts, summarizeConversation } from '../utils/api';
import {
  loadConversations, saveConversations,
  loadUserFacts, saveUserFacts,
  loadSummaries, saveSummaries,
  generateId
} from '../utils/storage';

export function useChat(settings: Settings) {
  const [conversations, setConversations] = useState<Conversation[]>(loadConversations);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [streamContent, setStreamContent] = useState('');
  const [userFacts, setUserFacts] = useState<UserFact[]>(loadUserFacts);
  const [summaries, setSummaries] = useState<ConversationSummary[]>(loadSummaries);
  const abortRef = useRef<AbortController | null>(null);

  const activeConversation = conversations.find(c => c.id === activeConversationId) || null;
  
  // Get active endpoint
  const activeEndpoint = settings.endpoints.find(e => e.id === settings.activeEndpointId) 
    || settings.endpoints.find(e => e.isDefault)
    || settings.endpoints[0];

  const createConversation = useCallback(() => {
    const newConv: Conversation = {
      id: generateId(),
      title: 'New Chat',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      model: activeEndpoint?.model || 'gpt-4o',
    };
    const updated = [newConv, ...conversations];
    setConversations(updated);
    saveConversations(updated);
    setActiveConversationId(newConv.id);
    return newConv;
  }, [conversations, activeEndpoint?.model]);

  const deleteConversation = useCallback((id: string) => {
    const updated = conversations.filter(c => c.id !== id);
    setConversations(updated);
    saveConversations(updated);
    if (activeConversationId === id) {
      setActiveConversationId(updated[0]?.id || null);
    }
  }, [conversations, activeConversationId]);

  const togglePin = useCallback((id: string) => {
    const updated = conversations.map(c => 
      c.id === id ? { ...c, pinned: !c.pinned } : c
    );
    setConversations(updated);
    saveConversations(updated);
  }, [conversations]);

  const buildSystemPrompt = useCallback((): string => {
    const parts: string[] = [];
    
    parts.push('You are a helpful AI assistant.');

    // Layer 2: User Memory (permanent facts)
    // IMPORTANT: Sort by id for stable prefix cache
    if (settings.memoryEnabled && userFacts.length > 0) {
      parts.push('\n## User Memory (facts you know about this user):');
      const sortedFacts = [...userFacts].sort((a, b) => a.id.localeCompare(b.id));
      sortedFacts.forEach(fact => {
        parts.push(`- ${fact.content}`);
      });
    }

    // Layer 3: Recent conversation summaries
    // IMPORTANT: Sort by created_at descending for stable prefix cache
    if (settings.memoryEnabled && summaries.length > 0) {
      parts.push('\n## Recent Conversations:');
      const sortedSummaries = [...summaries]
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 10);
      sortedSummaries.forEach(s => {
        parts.push(`- ${s.date}: "${s.title}" - ${s.summary}`);
      });
    }

    // MCP Tools info
    // IMPORTANT: Sort by server name and tool name for stable prefix cache
    const enabledTools = settings.mcpServers
      .filter(s => s.enabled)
      .sort((a, b) => a.name.localeCompare(b.name))
      .flatMap(s => s.tools)
      .sort((a, b) => a.name.localeCompare(b.name));
    if (enabledTools.length > 0) {
      parts.push('\n## Available Tools (via MCP):');
      enabledTools.forEach(tool => {
        parts.push(`- ${tool.name}: ${tool.description}`);
      });
    }

    return parts.join('\n');
  }, [settings, userFacts, summaries]);

  const sendMessage = useCallback(async (content: string) => {
    if (!activeEndpoint) {
      throw new Error('No active endpoint. Please configure an API endpoint in Settings.');
    }
    if (!activeEndpoint.baseUrl || !activeEndpoint.apiKey) {
      throw new Error('API configuration is missing. Please configure in Settings.');
    }

    let conv = activeConversation;
    if (!conv) {
      conv = createConversation();
    }

    const userMessage: Message = {
      id: generateId(),
      role: 'user',
      content,
      timestamp: Date.now(),
    };

    // Build messages with system prompt
    const systemPrompt = buildSystemPrompt();
    const allMessages = [
      { id: 'system', role: 'system' as const, content: systemPrompt, timestamp: Date.now() },
      ...conv.messages,
      userMessage,
    ];

    // Update conversation with user message
    const updatedConv: Conversation = {
      ...conv,
      messages: [...conv.messages, userMessage],
      updatedAt: Date.now(),
      title: conv.messages.length === 0 ? content.slice(0, 50) : conv.title,
    };

    const updatedConvs = conversations.map(c => c.id === conv!.id ? updatedConv : c);
    setConversations(updatedConvs);
    saveConversations(updatedConvs);

    setIsLoading(true);
    setStreamContent('');

    try {
      // Get available tools from MCP servers
      const tools = settings.mcpServers
        .filter(s => s.enabled && s.status === 'connected')
        .flatMap(s => s.tools.map(t => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })));

      const result = await chatCompletion(
        { baseUrl: activeEndpoint.baseUrl, apiKey: activeEndpoint.apiKey, model: activeEndpoint.model },
        allMessages,
        tools.length > 0 ? tools : undefined
      );

      const assistantMessage: Message = {
        id: generateId(),
        role: 'assistant',
        content: result.content || streamContent,
        timestamp: Date.now(),
        model: activeEndpoint.model,
        toolCalls: result.toolCalls,
      };

      // Final update
      const finalConv: Conversation = {
        ...updatedConv,
        messages: [...updatedConv.messages, assistantMessage],
        updatedAt: Date.now(),
      };

      const finalConvs = updatedConvs.map(c => c.id === conv!.id ? finalConv : c);
      setConversations(finalConvs);
      saveConversations(finalConvs);
      setStreamContent('');

      // Auto-extract memory after conversation
      if (settings.autoMemory && settings.memoryEnabled) {
        try {
          const facts = await extractMemoryFacts(
            { baseUrl: activeEndpoint.baseUrl, apiKey: activeEndpoint.apiKey, model: activeEndpoint.model },
            [userMessage, assistantMessage]
          );
          if (facts.length > 0) {
            const newFacts: UserFact[] = facts.map(f => ({
              id: generateId(),
              content: f,
              category: 'other' as const,
              createdAt: Date.now(),
              updatedAt: Date.now(),
              source: 'auto_detected' as const,
            }));
            const updatedFacts = [...userFacts, ...newFacts];
            setUserFacts(updatedFacts);
            saveUserFacts(updatedFacts);
          }
        } catch {
          // Memory extraction failed, continue without it
        }
      }

      return assistantMessage;
    } catch (error) {
      setStreamContent('');
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [activeConversation, conversations, settings, activeEndpoint, createConversation, buildSystemPrompt, userFacts, streamContent]);

  const summarizeAndArchive = useCallback(async (convId: string) => {
    const conv = conversations.find(c => c.id === convId);
    if (!conv || conv.messages.length === 0) return;

    try {
      const { title, summary } = await summarizeConversation(
        { baseUrl: activeEndpoint.baseUrl, apiKey: activeEndpoint.apiKey, model: activeEndpoint.model },
        conv.messages
      );
      const newSummary: ConversationSummary = {
        id: generateId(),
        date: new Date(conv.updatedAt).toLocaleDateString(),
        title,
        summary,
        messageCount: conv.messages.length,
        createdAt: Date.now(),
      };
      const updatedSummaries = [newSummary, ...summaries].slice(0, 50);
      setSummaries(updatedSummaries);
      saveSummaries(updatedSummaries);
    } catch {
      // Summarization failed
    }
  }, [conversations, summaries, activeEndpoint]);

  const addUserFact = useCallback((content: string, category: UserFact['category'] = 'other') => {
    const fact: UserFact = {
      id: generateId(),
      content,
      category,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      source: 'explicit',
    };
    const updated = [...userFacts, fact];
    setUserFacts(updated);
    saveUserFacts(updated);
  }, [userFacts]);

  const removeUserFact = useCallback((id: string) => {
    const updated = userFacts.filter(f => f.id !== id);
    setUserFacts(updated);
    saveUserFacts(updated);
  }, [userFacts]);

  return {
    conversations,
    activeConversation,
    activeConversationId,
    setActiveConversationId,
    createConversation,
    deleteConversation,
    togglePin,
    sendMessage,
    isLoading,
    streamContent,
    userFacts,
    summaries,
    addUserFact,
    removeUserFact,
    summarizeAndArchive,
  };
}
