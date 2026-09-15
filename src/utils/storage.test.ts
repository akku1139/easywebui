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
  });

  describe('Settings', () => {
    it('should return default settings when none stored', () => {
      const settings = loadSettings();
      expect(settings.memoryEnabled).toBe(true);
      expect(settings.autoMemory).toBe(true);
      expect(settings.apiConfig.model).toBe('gpt-4o');
    });

    it('should save and load settings', () => {
      const settings: Settings = {
        apiConfig: {
          baseUrl: 'https://api.example.com',
          apiKey: 'test-key',
          model: 'gpt-4o-mini',
        },
        mcpServers: [],
        memoryEnabled: false,
        autoMemory: false,
        theme: 'light',
      };

      saveSettings(settings);
      const loaded = loadSettings();

      expect(loaded.apiConfig.baseUrl).toBe('https://api.example.com');
      expect(loaded.apiConfig.apiKey).toBe('test-key');
      expect(loaded.memoryEnabled).toBe(false);
      expect(loaded.theme).toBe('light');
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
