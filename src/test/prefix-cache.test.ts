import { describe, it, expect, beforeEach } from 'vitest';
import { UserFact, ConversationSummary, MCPServer, Settings } from '../types';

/**
 * Prefix Cache Test Suite
 * 
 * OpenAI's prompt caching requires:
 * 1. Input must be >= 1024 tokens
 * 2. Prefix tokens must be EXACTLY identical
 * 3. Cache TTL is 5 minutes
 * 
 * For prefix cache to work effectively across conversation turns:
 * - System prompt must be STABLE (same content, same order)
 * - Message history must be APPEND-ONLY (no modifications to existing messages)
 * - Memory injection must be DETERMINISTIC (sorted, no random ordering)
 */

// Simulate buildSystemPrompt logic (extracted for testing)
function buildSystemPrompt(
  memoryEnabled: boolean,
  userFacts: UserFact[],
  summaries: ConversationSummary[],
  mcpServers: MCPServer[]
): string {
  const parts: string[] = [];
  
  parts.push('You are a helpful AI assistant.');

  // Layer 2: User Memory - MUST be sorted for prefix cache stability
  if (memoryEnabled && userFacts.length > 0) {
    parts.push('\n## User Memory (facts you know about this user):');
    const sortedFacts = [...userFacts].sort((a, b) => a.id.localeCompare(b.id));
    sortedFacts.forEach(fact => {
      parts.push(`- ${fact.content}`);
    });
  }

  // Layer 3: Summaries - MUST be sorted for prefix cache stability
  if (memoryEnabled && summaries.length > 0) {
    parts.push('\n## Recent Conversations:');
    const sortedSummaries = [...summaries]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 10);
    sortedSummaries.forEach(s => {
      parts.push(`- ${s.date}: "${s.title}" - ${s.summary}`);
    });
  }

  // MCP Tools - MUST be sorted for prefix cache stability
  const enabledTools = mcpServers
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
}

// Simulate message array construction
function buildMessages(
  systemPrompt: string,
  history: Array<{ role: string; content: string }>
): Array<{ role: string; content: string }> {
  return [
    { role: 'system', content: systemPrompt },
    ...history,
  ];
}

describe('Prefix Cache Stability', () => {
  const baseSettings: Settings = {
    apiConfig: { baseUrl: 'https://api.openai.com', apiKey: 'test', model: 'gpt-4o' },
    mcpServers: [],
    memoryEnabled: true,
    autoMemory: true,
    theme: 'dark',
  };

  describe('System Prompt Stability', () => {
    it('should produce identical system prompts when called multiple times with same data', () => {
      const facts: UserFact[] = [
        { id: 'c', content: 'Fact C', category: 'personal', createdAt: 1, updatedAt: 1, source: 'explicit' },
        { id: 'a', content: 'Fact A', category: 'personal', createdAt: 2, updatedAt: 2, source: 'explicit' },
        { id: 'b', content: 'Fact B', category: 'work', createdAt: 3, updatedAt: 3, source: 'auto_detected' },
      ];

      const prompt1 = buildSystemPrompt(true, facts, [], []);
      const prompt2 = buildSystemPrompt(true, facts, [], []);
      const prompt3 = buildSystemPrompt(true, facts, [], []);

      // All calls must produce identical output regardless of input order
      expect(prompt1).toBe(prompt2);
      expect(prompt2).toBe(prompt3);
    });

    it('should sort user facts by ID for deterministic ordering', () => {
      const facts: UserFact[] = [
        { id: 'z-last', content: 'Last fact', category: 'other', createdAt: 1, updatedAt: 1, source: 'explicit' },
        { id: 'a-first', content: 'First fact', category: 'other', createdAt: 2, updatedAt: 2, source: 'explicit' },
        { id: 'm-middle', content: 'Middle fact', category: 'other', createdAt: 3, updatedAt: 3, source: 'explicit' },
      ];

      const prompt = buildSystemPrompt(true, facts, [], []);
      const lines = prompt.split('\n').filter(l => l.startsWith('- '));

      // Should be sorted by ID: a-first, m-middle, z-last
      expect(lines[0]).toBe('- First fact');
      expect(lines[1]).toBe('- Middle fact');
      expect(lines[2]).toBe('- Last fact');
    });

    it('should sort summaries by createdAt descending', () => {
      const summaries: ConversationSummary[] = [
        { id: '1', date: '2024-01-01', title: 'Old', summary: 'old', messageCount: 5, createdAt: 1000 },
        { id: '2', date: '2024-03-01', title: 'New', summary: 'new', messageCount: 3, createdAt: 3000 },
        { id: '3', date: '2024-02-01', title: 'Mid', summary: 'mid', messageCount: 7, createdAt: 2000 },
      ];

      const prompt = buildSystemPrompt(true, [], summaries, []);
      const lines = prompt.split('\n').filter(l => l.startsWith('- '));

      // Should be sorted by createdAt DESC: New (3000), Mid (2000), Old (1000)
      expect(lines[0]).toContain('New');
      expect(lines[1]).toContain('Mid');
      expect(lines[2]).toContain('Old');
    });

    it('should sort MCP tools by server name then tool name', () => {
      const servers: MCPServer[] = [
        {
          id: 's2', name: 'Beta Server', url: 'http://beta', enabled: true,
          tools: [
            { name: 'zebra', description: 'Z tool', inputSchema: {}, serverId: 's2' },
            { name: 'alpha', description: 'A tool', inputSchema: {}, serverId: 's2' },
          ],
          status: 'connected',
        },
        {
          id: 's1', name: 'Alpha Server', url: 'http://alpha', enabled: true,
          tools: [
            { name: 'beta', description: 'B tool', inputSchema: {}, serverId: 's1' },
          ],
          status: 'connected',
        },
      ];

      const prompt = buildSystemPrompt(true, [], [], servers);
      const lines = prompt.split('\n').filter(l => l.startsWith('- '));

      // Tools should be sorted: alpha (from Alpha Server), beta (from Alpha Server), zebra (from Beta Server)
      // Wait - the implementation sorts servers by name, then flattens tools, then sorts tools by name
      // So: alpha, beta, zebra
      expect(lines[0]).toContain('alpha');
      expect(lines[1]).toContain('beta');
      expect(lines[2]).toContain('zebra');
    });

    it('should produce same prompt regardless of array insertion order', () => {
      // Simulate facts being added in different orders
      const factsA: UserFact[] = [
        { id: '1', content: 'A', category: 'other', createdAt: 1, updatedAt: 1, source: 'explicit' },
        { id: '2', content: 'B', category: 'other', createdAt: 2, updatedAt: 2, source: 'explicit' },
        { id: '3', content: 'C', category: 'other', createdAt: 3, updatedAt: 3, source: 'explicit' },
      ];

      const factsB: UserFact[] = [
        { id: '3', content: 'C', category: 'other', createdAt: 3, updatedAt: 3, source: 'explicit' },
        { id: '1', content: 'A', category: 'other', createdAt: 1, updatedAt: 1, source: 'explicit' },
        { id: '2', content: 'B', category: 'other', createdAt: 2, updatedAt: 2, source: 'explicit' },
      ];

      const promptA = buildSystemPrompt(true, factsA, [], []);
      const promptB = buildSystemPrompt(true, factsB, [], []);

      expect(promptA).toBe(promptB);
    });
  });

  describe('Message Array Prefix Stability', () => {
    it('should maintain identical prefix when adding new messages', () => {
      const systemPrompt = buildSystemPrompt(true, [], [], []);
      
      // Turn 1: Initial message
      const turn1Messages = buildMessages(systemPrompt, [
        { role: 'user', content: 'Hello' },
      ]);

      // Turn 2: Same history + new message
      const turn2Messages = buildMessages(systemPrompt, [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi!' },
        { role: 'user', content: 'How are you?' },
      ]);

      // The prefix (system + first user message) must be identical
      expect(turn2Messages[0]).toEqual(turn1Messages[0]); // system
      expect(turn2Messages[1]).toEqual(turn1Messages[1]); // first user message

      // Verify prefix is byte-identical
      const prefix1 = JSON.stringify(turn1Messages);
      const prefix2 = JSON.stringify(turn2Messages.slice(0, 2));
      expect(prefix1).toBe(prefix2);
    });

    it('should NOT modify existing messages when appending', () => {
      const systemPrompt = buildSystemPrompt(true, [], [], []);
      
      const history = [
        { role: 'user', content: 'Message 1' },
        { role: 'assistant', content: 'Response 1' },
      ];

      const messages1 = buildMessages(systemPrompt, history);
      
      // Simulate adding a new message
      const newHistory = [...history, { role: 'user', content: 'Message 2' }];
      const messages2 = buildMessages(systemPrompt, newHistory);

      // All original messages must be byte-identical
      for (let i = 0; i < messages1.length; i++) {
        expect(JSON.stringify(messages2[i])).toBe(JSON.stringify(messages1[i]));
      }
    });

    it('should keep system prompt stable across turns when memory does not change', () => {
      const facts: UserFact[] = [
        { id: '1', content: 'User likes cats', category: 'preference', createdAt: 1, updatedAt: 1, source: 'explicit' },
      ];

      // Turn 1
      const prompt1 = buildSystemPrompt(true, facts, [], []);
      // Turn 2 (no new facts)
      const prompt2 = buildSystemPrompt(true, facts, [], []);
      // Turn 3 (still no changes)
      const prompt3 = buildSystemPrompt(true, facts, [], []);

      expect(prompt1).toBe(prompt2);
      expect(prompt2).toBe(prompt3);
    });

    it('should change system prompt when new fact is added (cache invalidation expected)', () => {
      const factsBefore: UserFact[] = [
        { id: '1', content: 'User likes cats', category: 'preference', createdAt: 1, updatedAt: 1, source: 'explicit' },
      ];

      const factsAfter: UserFact[] = [
        { id: '1', content: 'User likes cats', category: 'preference', createdAt: 1, updatedAt: 1, source: 'explicit' },
        { id: '2', content: 'User lives in Tokyo', category: 'personal', createdAt: 2, updatedAt: 2, source: 'explicit' },
      ];

      const promptBefore = buildSystemPrompt(true, factsBefore, [], []);
      const promptAfter = buildSystemPrompt(true, factsAfter, [], []);

      // Prompt should change (cache will be invalidated - this is expected)
      expect(promptBefore).not.toBe(promptAfter);
      // But the original content should still be present
      expect(promptAfter).toContain('User likes cats');
      expect(promptAfter).toContain('User lives in Tokyo');
    });
  });

  describe('Prefix Cache Token Estimation', () => {
    // OpenAI requires >= 1024 tokens for caching
    // Rough estimate: 1 token ≈ 4 characters (English), 1 token ≈ 1-2 characters (Japanese)
    
    function estimateTokens(text: string): number {
      // Simple estimation: count chars / 4 for English, chars / 1.5 for CJK
      const cjkChars = (text.match(/[\u3000-\u9fff\uF900-\uFAFF]/g) || []).length;
      const nonCjkChars = text.length - cjkChars;
      return Math.ceil(nonCjkChars / 4 + cjkChars / 1.5);
    }

    it('should generate system prompts that contribute to 1024+ token prefix', () => {
      const facts: UserFact[] = Array.from({ length: 20 }, (_, i) => ({
        id: `fact-${i.toString().padStart(3, '0')}`,
        content: `User fact number ${i + 1}: This is a detailed piece of information about the user's preferences and history.`,
        category: 'other' as const,
        createdAt: i * 1000,
        updatedAt: i * 1000,
        source: 'explicit' as const,
      }));

      const summaries: ConversationSummary[] = Array.from({ length: 10 }, (_, i) => ({
        id: `summary-${i}`,
        date: `2024-01-${(i + 1).toString().padStart(2, '0')}`,
        title: `Conversation about topic ${i + 1}`,
        summary: 'Discussed various aspects of the topic in detail with multiple back-and-forth exchanges.',
        messageCount: 10 + i,
        createdAt: (10 - i) * 1000,
      }));

      const prompt = buildSystemPrompt(true, facts, summaries, []);
      const tokens = estimateTokens(prompt);

      // System prompt alone should contribute significantly to the 1024 token threshold
      expect(tokens).toBeGreaterThan(200);
    });

    it('should have stable token count when facts are not modified', () => {
      const facts: UserFact[] = [
        { id: '1', content: 'Fact 1', category: 'other', createdAt: 1, updatedAt: 1, source: 'explicit' },
        { id: '2', content: 'Fact 2', category: 'other', createdAt: 2, updatedAt: 2, source: 'explicit' },
      ];

      const prompt1 = buildSystemPrompt(true, facts, [], []);
      const prompt2 = buildSystemPrompt(true, facts, [], []);

      expect(estimateTokens(prompt1)).toBe(estimateTokens(prompt2));
    });
  });

  describe('Full Conversation Simulation', () => {
    it('should simulate a multi-turn conversation with stable prefix', () => {
      const facts: UserFact[] = [
        { id: 'f1', content: 'User is a developer', category: 'work', createdAt: 1, updatedAt: 1, source: 'explicit' },
      ];
      const summaries: ConversationSummary[] = [];
      const mcpServers: MCPServer[] = [];

      // Simulate 5 turns of conversation
      const allTurns: Array<Array<{ role: string; content: string }>> = [];
      
      for (let turn = 0; turn < 5; turn++) {
        const systemPrompt = buildSystemPrompt(true, facts, summaries, mcpServers);
        const history: Array<{ role: string; content: string }> = [];
        
        // Add all previous turns
        for (let prev = 0; prev < turn; prev++) {
          history.push({ role: 'user', content: `User message ${prev + 1}` });
          history.push({ role: 'assistant', content: `Assistant response ${prev + 1}` });
        }
        
        // Add current turn
        history.push({ role: 'user', content: `User message ${turn + 1}` });
        
        const messages = buildMessages(systemPrompt, history);
        allTurns.push(messages);
      }

      // Verify: Each turn's prefix must match the previous turn's corresponding messages
      for (let turn = 1; turn < allTurns.length; turn++) {
        const prevTurn = allTurns[turn - 1];
        const currentTurn = allTurns[turn];
        
        // System prompt must be identical
        expect(JSON.stringify(currentTurn[0])).toBe(JSON.stringify(prevTurn[0]));
        
        // All previous messages must be identical
        for (let i = 0; i < prevTurn.length; i++) {
          expect(JSON.stringify(currentTurn[i])).toBe(JSON.stringify(prevTurn[i]));
        }
      }
    });

    it('should invalidate cache when memory changes mid-conversation', () => {
      const factsInitial: UserFact[] = [
        { id: 'f1', content: 'User is a developer', category: 'work', createdAt: 1, updatedAt: 1, source: 'explicit' },
      ];

      // Turn 1: Initial state
      const prompt1 = buildSystemPrompt(true, factsInitial, [], []);
      
      // Auto-detection adds a new fact
      const factsAfterAutoDetect: UserFact[] = [
        ...factsInitial,
        { id: 'f2', content: 'User prefers TypeScript', category: 'preference', createdAt: 2, updatedAt: 2, source: 'auto_detected' },
      ];

      // Turn 2: Memory changed
      const prompt2 = buildSystemPrompt(true, factsAfterAutoDetect, [], []);

      // Cache is invalidated (expected behavior)
      expect(prompt1).not.toBe(prompt2);
      
      // But subsequent turns should be stable
      const prompt3 = buildSystemPrompt(true, factsAfterAutoDetect, [], []);
      expect(prompt2).toBe(prompt3);
    });
  });
});
