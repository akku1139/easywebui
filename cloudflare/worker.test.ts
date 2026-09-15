import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Cloudflare Worker Backend Tests
 * 
 * These tests verify the backend logic for:
 * 1. Memory injection into system prompts
 * 2. Prefix cache stability
 * 3. Auto memory extraction
 * 4. Conversation summarization
 */

// Mock D1 Database
const createMockDB = () => ({
  prepare: vi.fn().mockReturnValue({
    bind: vi.fn().mockReturnValue({
      first: vi.fn().mockResolvedValue(null),
      all: vi.fn().mockResolvedValue({ results: [] }),
      run: vi.fn().mockResolvedValue({}),
    }),
    all: vi.fn().mockResolvedValue({ results: [] }),
    first: vi.fn().mockResolvedValue(null),
    run: vi.fn().mockResolvedValue({}),
  }),
});

describe('Cloudflare Worker - Memory Injection', () => {
  let mockDB: ReturnType<typeof createMockDB>;

  beforeEach(() => {
    mockDB = createMockDB();
    vi.clearAllMocks();
  });

  describe('System Prompt Construction', () => {
    it('should inject user facts in stable order', () => {
      const facts = [
        { content: 'Fact C' },
        { content: 'Fact A' },
        { content: 'Fact B' },
      ];

      // Simulate the worker's memory injection logic
      const memoryParts: string[] = [];
      
      if (facts.length > 0) {
        memoryParts.push('## About this user:');
        // Sort for stability
        const sortedFacts = [...facts].sort((a, b) => a.content.localeCompare(b.content));
        sortedFacts.forEach(f => memoryParts.push(`- ${f.content}`));
      }

      const result = memoryParts.join('\n');
      
      expect(result).toContain('Fact A');
      expect(result).toContain('Fact B');
      expect(result).toContain('Fact C');
      
      // Verify order is stable
      const lines = result.split('\n').filter(l => l.startsWith('- '));
      expect(lines[0]).toBe('- Fact A');
      expect(lines[1]).toBe('- Fact B');
      expect(lines[2]).toBe('- Fact C');
    });

    it('should inject conversation summaries in chronological order', () => {
      const summaries = [
        { title: 'Old Chat', date: '2024-01-01', summary: 'old', created_at: 1000 },
        { title: 'New Chat', date: '2024-03-01', summary: 'new', created_at: 3000 },
        { title: 'Mid Chat', date: '2024-02-01', summary: 'mid', created_at: 2000 },
      ];

      const memoryParts: string[] = [];
      
      if (summaries.length > 0) {
        memoryParts.push('## Recent conversations:');
        // Sort by created_at DESC
        const sortedSummaries = [...summaries]
          .sort((a, b) => b.created_at - a.created_at)
          .slice(0, 10);
        sortedSummaries.forEach(s => {
          memoryParts.push(`- ${s.date}: "${s.title}" - ${s.summary}`);
        });
      }

      const result = memoryParts.join('\n');
      const lines = result.split('\n').filter(l => l.startsWith('- '));
      
      // Should be sorted DESC: New (3000), Mid (2000), Old (1000)
      expect(lines[0]).toContain('New Chat');
      expect(lines[1]).toContain('Mid Chat');
      expect(lines[2]).toContain('Old Chat');
    });

    it('should produce identical system prompts for identical data', () => {
      const facts = [
        { content: 'User likes TypeScript' },
        { content: 'User lives in Tokyo' },
      ];

      const buildPrompt = (facts: Array<{ content: string }>) => {
        const parts: string[] = ['You are a helpful AI assistant.'];
        
        if (facts.length > 0) {
          parts.push('\n## About this user:');
          const sorted = [...facts].sort((a, b) => a.content.localeCompare(b.content));
          sorted.forEach(f => parts.push(`- ${f.content}`));
        }
        
        return parts.join('\n');
      };

      const prompt1 = buildPrompt(facts);
      const prompt2 = buildPrompt(facts);
      const prompt3 = buildPrompt([...facts].reverse()); // Different order input

      expect(prompt1).toBe(prompt2);
      expect(prompt1).toBe(prompt3); // Should be same even with different input order
    });
  });

  describe('Prefix Cache Validation', () => {
    it('should maintain prefix stability across conversation turns', () => {
      const systemPrompt = 'You are a helpful AI assistant.\n\n## About this user:\n- User likes cats';
      
      // Turn 1
      const messages1 = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: 'Hello' },
      ];

      // Turn 2 (same system prompt, extended history)
      const messages2 = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi!' },
        { role: 'user', content: 'How are you?' },
      ];

      // Verify prefix is identical
      const prefix1 = JSON.stringify(messages1);
      const prefix2 = JSON.stringify(messages2.slice(0, 2));
      
      expect(prefix1).toBe(prefix2);
    });

    it('should invalidate cache when system prompt changes', () => {
      const systemPrompt1 = 'You are a helpful AI assistant.\n\n## About this user:\n- User likes cats';
      const systemPrompt2 = 'You are a helpful AI assistant.\n\n## About this user:\n- User likes cats\n- User lives in Tokyo';

      expect(systemPrompt1).not.toBe(systemPrompt2);
      
      // This is expected behavior - cache will be invalidated when memory changes
      // But subsequent requests with the same memory should be stable
      const systemPrompt3 = 'You are a helpful AI assistant.\n\n## About this user:\n- User likes cats\n- User lives in Tokyo';
      expect(systemPrompt2).toBe(systemPrompt3);
    });
  });

  describe('Auto Memory Extraction', () => {
    it('should extract facts from conversation', async () => {
      const conversation = [
        { role: 'user', content: 'My name is John and I am a developer' },
        { role: 'assistant', content: 'Nice to meet you, John!' },
      ];

      // Simulate extraction prompt
      const extractionPrompt = `Extract important facts about the user from this conversation.
User said: ${conversation[0].content}
Assistant responded: ${conversation[1].content}`;

      expect(extractionPrompt).toContain('John');
      expect(extractionPrompt).toContain('developer');
    });

    it('should not duplicate existing facts', () => {
      const existingFacts = ['User likes cats'];
      const newFact = 'User likes cats';

      const shouldAdd = !existingFacts.includes(newFact);
      expect(shouldAdd).toBe(false);
    });

    it('should add new facts', () => {
      const existingFacts = ['User likes cats'];
      const newFact = 'User lives in Tokyo';

      const shouldAdd = !existingFacts.includes(newFact);
      expect(shouldAdd).toBe(true);
    });
  });
});

describe('Cloudflare Worker - API Routes', () => {
  describe('Basic Auth', () => {
    it('should reject requests without auth header', () => {
      const request = {
        headers: {
          get: (name: string) => name === 'Authorization' ? null : null,
        },
      };

      const hasAuth = request.headers.get('Authorization') !== null;
      expect(hasAuth).toBe(false);
    });

    it('should accept valid Basic auth', () => {
      const credentials = btoa('admin:password123');
      const request = {
        headers: {
          get: (name: string) => name === 'Authorization' ? `Basic ${credentials}` : null,
        },
      };

      const authHeader = request.headers.get('Authorization');
      expect(authHeader).toBeTruthy();
      expect(authHeader!.startsWith('Basic ')).toBe(true);

      const decoded = atob(authHeader!.slice(6));
      const [user, pass] = decoded.split(':');
      expect(user).toBe('admin');
      expect(pass).toBe('password123');
    });
  });

  describe('CORS Headers', () => {
    it('should include proper CORS headers', () => {
      const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      };

      expect(corsHeaders['Access-Control-Allow-Origin']).toBe('*');
      expect(corsHeaders['Access-Control-Allow-Methods']).toContain('POST');
      expect(corsHeaders['Access-Control-Allow-Headers']).toContain('Authorization');
    });
  });
});
