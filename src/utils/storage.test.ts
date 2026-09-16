import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadConversations, saveConversations,
  loadSettings, saveSettings,
  loadUserFacts, saveUserFacts,
  loadSummaries, saveSummaries,
  loadMCPServers, saveMCPServers,
  generateId
} from '../utils/storage';
import { Conversation, Settings, UserFact, ConversationSummary, MCPServer } from '../types';

describe('Storage Utils', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('Conversations', () => {
    it('should return empty array when no conversations stored', () => {
      const conversations = loadConversations();
      expect(conversations).toEqual([]);
    });

    it('should save and load conversations', () => {
      const conversations: Conversation[] = [
        {
          id: 'conv-1',
          title: 'Test Chat',
          messages: [
            { id: 'msg-1', role: 'user', content: 'Hello', timestamp: Date.now() },
          ],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          model: 'gpt-4o',
        }
      ];

      saveConversations(conversations);
      const loaded = loadConversations();

      expect(loaded).toHaveLength(1);
      expect(loaded[0].id).toBe('conv-1');
      expect(loaded[0].title).toBe('Test Chat');
      expect(loaded[0].messages).toHaveLength(1);
    });

    it('should save and load pinned conversations', () => {
      const conversations: Conversation[] = [
        {
          id: 'conv-1',
          title: 'Pinned Chat',
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          model: 'gpt-4o',
          pinned: true,
        },
        {
          id: 'conv-2',
          title: 'Regular Chat',
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          model: 'gpt-4o',
          pinned: false,
        }
      ];

      saveConversations(conversations);
      const loaded = loadConversations();

      expect(loaded).toHaveLength(2);
      expect(loaded[0].pinned).toBe(true);
      expect(loaded[1].pinned).toBe(false);
    });
  });

  describe('Settings', () => {
    it('should return default settings when none stored', () => {
      const settings = loadSettings();
      expect(settings.memoryEnabled).toBe(true);
      expect(settings.autoMemory).toBe(true);
      expect(settings.endpoints).toEqual([]);
    });

    it('should save and load settings', () => {
      const settings: Settings = {
        endpoints: [{
          id: 'test',
          name: 'Test',
          baseUrl: 'https://api.example.com',
          apiKey: 'test-key',
          model: 'gpt-4o-mini',
          enabled: true,
          createdAt: Date.now(),
        }],
        activeEndpointId: 'test',
        mcpServers: [],
        memoryEnabled: false,
        autoMemory: false,
        theme: 'light',
      };

      saveSettings(settings);
      const loaded = loadSettings();

      expect(loaded.endpoints[0].baseUrl).toBe('https://api.example.com');
      expect(loaded.endpoints[0].apiKey).toBe('test-key');
      expect(loaded.memoryEnabled).toBe(false);
      expect(loaded.theme).toBe('light');
    });

    it('should save and load multiple endpoints', () => {
      const settings: Settings = {
        endpoints: [
          {
            id: 'ep-1',
            name: 'OpenAI',
            baseUrl: 'https://api.openai.com',
            apiKey: 'key-1',
            model: 'gpt-4o',
            enabled: true,
            isDefault: true,
            createdAt: Date.now(),
          },
          {
            id: 'ep-2',
            name: 'Claude',
            baseUrl: 'https://api.anthropic.com',
            apiKey: 'key-2',
            model: 'claude-3-opus',
            enabled: true,
            createdAt: Date.now(),
          },
        ],
        activeEndpointId: 'ep-1',
        mcpServers: [],
        memoryEnabled: true,
        autoMemory: true,
        theme: 'dark',
      };

      saveSettings(settings);
      const loaded = loadSettings();

      expect(loaded.endpoints).toHaveLength(2);
      expect(loaded.endpoints[0].name).toBe('OpenAI');
      expect(loaded.endpoints[1].name).toBe('Claude');
      expect(loaded.activeEndpointId).toBe('ep-1');
    });

    it('should migrate from old apiConfig format', () => {
      // Simulate old format
      const oldSettings = {
        apiConfig: {
          baseUrl: 'https://api.openai.com',
          apiKey: 'old-key',
          model: 'gpt-4',
        },
        mcpServers: [],
        memoryEnabled: true,
        autoMemory: true,
        theme: 'dark',
      };

      localStorage.setItem('ai-chat-settings', JSON.stringify(oldSettings));
      const loaded = loadSettings();

      expect(loaded.endpoints).toHaveLength(1);
      expect(loaded.endpoints[0].baseUrl).toBe('https://api.openai.com');
      expect(loaded.endpoints[0].apiKey).toBe('old-key');
      expect(loaded.endpoints[0].model).toBe('gpt-4');
      expect(loaded.endpoints[0].name).toBe('Default');
    });

    it('should save and load custom system prompt', () => {
      const settings: Settings = {
        endpoints: [{
          id: 'test',
          name: 'Test',
          baseUrl: 'https://api.example.com',
          apiKey: 'test-key',
          model: 'gpt-4o',
          enabled: true,
          createdAt: Date.now(),
        }],
        activeEndpointId: 'test',
        mcpServers: [],
        memoryEnabled: true,
        autoMemory: true,
        theme: 'dark',
        customSystemPrompt: 'You are a pirate assistant. Always speak like a pirate.',
      };

      saveSettings(settings);
      const loaded = loadSettings();

      expect(loaded.customSystemPrompt).toBe('You are a pirate assistant. Always speak like a pirate.');
    });

    it('should return empty string for custom system prompt when not set', () => {
      const settings = loadSettings();
      expect(settings.customSystemPrompt).toBe('');
    });

    it('should migrate custom system prompt from old format', () => {
      // Simulate old format with customSystemPrompt
      const oldSettings = {
        apiConfig: {
          baseUrl: 'https://api.openai.com',
          apiKey: 'old-key',
          model: 'gpt-4',
        },
        mcpServers: [],
        memoryEnabled: true,
        autoMemory: true,
        theme: 'dark',
        customSystemPrompt: 'You are a helpful coding assistant.',
      };

      localStorage.setItem('ai-chat-settings', JSON.stringify(oldSettings));
      const loaded = loadSettings();

      expect(loaded.customSystemPrompt).toBe('You are a helpful coding assistant.');
    });
  });

  describe('User Facts (Memory)', () => {
    it('should return empty array when no facts stored', () => {
      const facts = loadUserFacts();
      expect(facts).toEqual([]);
    });

    it('should save and load user facts', () => {
      const facts: UserFact[] = [
        {
          id: 'fact-1',
          content: 'User prefers dark mode',
          category: 'preference',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          source: 'explicit',
        },
        {
          id: 'fact-2',
          content: 'User is a developer',
          category: 'work',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          source: 'auto_detected',
        },
      ];

      saveUserFacts(facts);
      const loaded = loadUserFacts();

      expect(loaded).toHaveLength(2);
      expect(loaded[0].content).toBe('User prefers dark mode');
      expect(loaded[1].source).toBe('auto_detected');
    });
  });

  describe('Conversation Summaries', () => {
    it('should return empty array when no summaries stored', () => {
      const summaries = loadSummaries();
      expect(summaries).toEqual([]);
    });

    it('should save and load summaries', () => {
      const summaries: ConversationSummary[] = [
        {
          id: 'summary-1',
          date: '2024-01-15',
          title: 'Website Development',
          summary: 'Discussed React and TypeScript',
          messageCount: 10,
          createdAt: Date.now(),
        }
      ];

      saveSummaries(summaries);
      const loaded = loadSummaries();

      expect(loaded).toHaveLength(1);
      expect(loaded[0].title).toBe('Website Development');
      expect(loaded[0].messageCount).toBe(10);
    });
  });

  describe('MCP Servers', () => {
    it('should return empty array when no servers stored', () => {
      const servers = loadMCPServers();
      expect(servers).toEqual([]);
    });

    it('should save and load MCP servers', () => {
      const servers: MCPServer[] = [
        {
          id: 'server-1',
          name: 'Search Server',
          url: 'http://localhost:3001',
          enabled: true,
          tools: [
            { name: 'search', description: 'Search the web', inputSchema: {}, serverId: 'server-1' }
          ],
          status: 'connected',
          lastChecked: Date.now(),
        }
      ];

      saveMCPServers(servers);
      const loaded = loadMCPServers();

      expect(loaded).toHaveLength(1);
      expect(loaded[0].name).toBe('Search Server');
      expect(loaded[0].tools).toHaveLength(1);
      expect(loaded[0].status).toBe('connected');
    });
  });

  describe('generateId', () => {
    it('should generate unique IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateId());
      }
      expect(ids.size).toBe(100);
    });

    it('should generate string IDs', () => {
      const id = generateId();
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });
  });
});
