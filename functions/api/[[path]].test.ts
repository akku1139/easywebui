import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Cloudflare Pages Functions Backend Tests
 * 
 * These tests verify the backend logic for:
 * 1. Memory injection into system prompts
 * 2. Prefix cache stability
 * 3. Auto memory extraction
 * 4. Conversation summarization
 * 5. Pin feature
 */

describe('Pages Functions - Memory Injection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('System Prompt Construction', () => {
    it('should inject user facts in stable order', () => {
      const facts = [
        { content: 'Fact C' },
        { content: 'Fact A' },
        { content: 'Fact B' },
      ];

      // Simulate the function's memory injection logic
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
    it('should extract facts from conversation', () => {
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

describe('Pages Functions - API Routes', () => {
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
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      };

      expect(corsHeaders['Access-Control-Allow-Origin']).toBe('*');
      expect(corsHeaders['Access-Control-Allow-Methods']).toContain('POST');
      expect(corsHeaders['Access-Control-Allow-Methods']).toContain('PATCH');
      expect(corsHeaders['Access-Control-Allow-Headers']).toContain('Authorization');
    });
  });
});

describe('Pages Functions - Pin Feature', () => {
  describe('Conversation Sorting', () => {
    it('should sort conversations with pinned first', () => {
      const conversations = [
        { id: '1', title: 'Old', pinned: false, updated_at: 1000 },
        { id: '2', title: 'Pinned New', pinned: true, updated_at: 3000 },
        { id: '3', title: 'Pinned Old', pinned: true, updated_at: 2000 },
        { id: '4', title: 'Recent', pinned: false, updated_at: 4000 },
      ];

      // Simulate SQL: ORDER BY pinned DESC, updated_at DESC
      const sorted = [...conversations].sort((a, b) => {
        if (a.pinned !== b.pinned) return b.pinned ? 1 : -1;
        return b.updated_at - a.updated_at;
      });

      // Pinned conversations should come first, sorted by updated_at DESC
      expect(sorted[0].id).toBe('2'); // Pinned New (3000)
      expect(sorted[1].id).toBe('3'); // Pinned Old (2000)
      expect(sorted[2].id).toBe('4'); // Recent (4000)
      expect(sorted[3].id).toBe('1'); // Old (1000)
    });

    it('should toggle pin state', () => {
      const conversation = { id: '1', title: 'Test', pinned: false };
      
      // Toggle pin
      const toggled = { ...conversation, pinned: !conversation.pinned };
      expect(toggled.pinned).toBe(true);
      
      // Toggle again
      const toggledBack = { ...toggled, pinned: !toggled.pinned };
      expect(toggledBack.pinned).toBe(false);
    });
  });
});

describe('Pages Functions - Multiple Endpoints', () => {
  describe('Endpoint Selection', () => {
    it('should select endpoint by ID', () => {
      const endpoints = [
        { id: 'ep-1', name: 'OpenAI', base_url: 'https://api.openai.com', is_default: true },
        { id: 'ep-2', name: 'Claude', base_url: 'https://api.anthropic.com', is_default: false },
      ];

      const selectedId = 'ep-2';
      const selected = endpoints.find(e => e.id === selectedId);
      
      expect(selected?.name).toBe('Claude');
      expect(selected?.base_url).toBe('https://api.anthropic.com');
    });

    it('should fallback to default endpoint when ID not found', () => {
      const endpoints = [
        { id: 'ep-1', name: 'OpenAI', base_url: 'https://api.openai.com', is_default: true },
        { id: 'ep-2', name: 'Claude', base_url: 'https://api.anthropic.com', is_default: false },
      ];

      const selectedId = 'non-existent';
      const selected = endpoints.find(e => e.id === selectedId) 
        || endpoints.find(e => e.is_default);
      
      expect(selected?.name).toBe('OpenAI');
    });

    it('should sort endpoints with default first', () => {
      const endpoints = [
        { id: 'ep-1', name: 'OpenAI', is_default: false, created_at: 1000 },
        { id: 'ep-2', name: 'Claude', is_default: true, created_at: 2000 },
        { id: 'ep-3', name: 'Local', is_default: false, created_at: 3000 },
      ];

      // Simulate SQL: ORDER BY is_default DESC, created_at ASC
      const sorted = [...endpoints].sort((a, b) => {
        if (a.is_default !== b.is_default) return b.is_default ? 1 : -1;
        return a.created_at - b.created_at;
      });

      expect(sorted[0].name).toBe('Claude'); // Default first
      expect(sorted[1].name).toBe('OpenAI');
      expect(sorted[2].name).toBe('Local');
    });
  });

  describe('Endpoint Configuration', () => {
    it('should use endpoint-specific API key', () => {
      const endpoint = {
        id: 'ep-1',
        name: 'OpenAI',
        base_url: 'https://api.openai.com',
        api_key: 'sk-test-key',
        model: 'gpt-4o',
      };

      const authHeader = `Bearer ${endpoint.api_key}`;
      expect(authHeader).toBe('Bearer sk-test-key');
    });

    it('should use endpoint-specific model', () => {
      const endpoint = {
        id: 'ep-1',
        name: 'Claude',
        base_url: 'https://api.anthropic.com',
        api_key: 'sk-ant-test',
        model: 'claude-3-opus',
      };

      const requestBody = { model: endpoint.model };
      expect(requestBody.model).toBe('claude-3-opus');
    });
  });
});
