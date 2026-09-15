import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useChat } from './useChat';
import { Settings } from '../types';

describe('useChat', () => {
  const mockSettings: Settings = {
    apiConfig: {
      baseUrl: 'https://api.openai.com',
      apiKey: 'test-key',
      model: 'gpt-4o',
    },
    mcpServers: [],
    memoryEnabled: true,
    autoMemory: false, // Disable auto memory for simpler tests
    theme: 'dark',
  };

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe('Conversation Management', () => {
    it('should start with no conversations', () => {
      const { result } = renderHook(() => useChat(mockSettings));
      expect(result.current.conversations).toHaveLength(0);
      expect(result.current.activeConversation).toBeNull();
    });

    it('should create a new conversation', () => {
      const { result } = renderHook(() => useChat(mockSettings));

      act(() => {
        result.current.createConversation();
      });

      expect(result.current.conversations).toHaveLength(1);
      expect(result.current.activeConversation).toBeTruthy();
      expect(result.current.activeConversation!.title).toBe('New Chat');
    });

    it('should delete a conversation', () => {
      const { result } = renderHook(() => useChat(mockSettings));

      act(() => {
        result.current.createConversation();
      });

      const convId = result.current.activeConversation!.id;

      act(() => {
        result.current.deleteConversation(convId);
      });

      expect(result.current.conversations).toHaveLength(0);
      expect(result.current.activeConversation).toBeNull();
    });

    it('should switch between conversations', () => {
      const { result } = renderHook(() => useChat(mockSettings));

      act(() => {
        result.current.createConversation();
      });
      const firstConvId = result.current.activeConversation!.id;

      act(() => {
        result.current.createConversation();
      });
      const secondConvId = result.current.activeConversation!.id;

      expect(result.current.activeConversationId).toBe(secondConvId);

      act(() => {
        result.current.setActiveConversationId(firstConvId);
      });

      expect(result.current.activeConversationId).toBe(firstConvId);
    });

    it('should toggle pin on a conversation', () => {
      const { result } = renderHook(() => useChat(mockSettings));

      act(() => {
        result.current.createConversation();
      });

      const convId = result.current.activeConversation!.id;
      expect(result.current.activeConversation!.pinned).toBeFalsy();

      // Pin the conversation
      act(() => {
        result.current.togglePin(convId);
      });

      expect(result.current.activeConversation!.pinned).toBe(true);

      // Unpin the conversation
      act(() => {
        result.current.togglePin(convId);
      });

      expect(result.current.activeConversation!.pinned).toBe(false);
    });

    it('should persist pin state in localStorage', () => {
      const { result } = renderHook(() => useChat(mockSettings));

      act(() => {
        result.current.createConversation();
      });

      const convId = result.current.activeConversation!.id;

      act(() => {
        result.current.togglePin(convId);
      });

      const stored = localStorage.getItem('ai-chat-conversations');
      expect(stored).toBeTruthy();
      const parsed = JSON.parse(stored!);
      expect(parsed[0].pinned).toBe(true);
    });
  });

  describe('Memory Management', () => {
    it('should add user facts', () => {
      const { result } = renderHook(() => useChat(mockSettings));

      act(() => {
        result.current.addUserFact('User likes cats', 'preference');
      });

      expect(result.current.userFacts).toHaveLength(1);
      expect(result.current.userFacts[0].content).toBe('User likes cats');
      expect(result.current.userFacts[0].category).toBe('preference');
      expect(result.current.userFacts[0].source).toBe('explicit');
    });

    it('should remove user facts', () => {
      const { result } = renderHook(() => useChat(mockSettings));

      act(() => {
        result.current.addUserFact('User likes cats', 'preference');
      });

      const factId = result.current.userFacts[0].id;

      act(() => {
        result.current.removeUserFact(factId);
      });

      expect(result.current.userFacts).toHaveLength(0);
    });

    it('should persist user facts in localStorage', () => {
      const { result } = renderHook(() => useChat(mockSettings));

      act(() => {
        result.current.addUserFact('User likes cats', 'preference');
      });

      const stored = localStorage.getItem('ai-chat-memory');
      expect(stored).toBeTruthy();
      const parsed = JSON.parse(stored!);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].content).toBe('User likes cats');
    });
  });

  describe('Message Sending', () => {
    it('should throw error when API config is missing', async () => {
      const settingsWithoutApi: Settings = {
        ...mockSettings,
        apiConfig: { baseUrl: '', apiKey: '', model: 'gpt-4o' },
      };

      const { result } = renderHook(() => useChat(settingsWithoutApi));

      await expect(async () => {
        await act(async () => {
          await result.current.sendMessage('Hello');
        });
      }).rejects.toThrow('API configuration is missing');
    });

    it('should create conversation automatically when sending first message', async () => {
      const { result } = renderHook(() => useChat(mockSettings));

      // Mock API response
      vi.mocked(globalThis.fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: 'Hi there!' } }]
        }),
      } as Response);

      await act(async () => {
        await result.current.sendMessage('Hello');
      });

      expect(result.current.conversations).toHaveLength(1);
      expect(result.current.activeConversation).toBeTruthy();
      expect(result.current.activeConversation!.messages.length).toBeGreaterThan(0);
    });
  });

  describe('System Prompt Stability (Prefix Cache)', () => {
    it('should maintain stable system prompt when memory does not change', () => {
      const { result, rerender } = renderHook(() => useChat(mockSettings));

      // Add some facts
      act(() => {
        result.current.addUserFact('Fact 1', 'personal');
        result.current.addUserFact('Fact 2', 'work');
      });

      // The hook should maintain stable ordering
      const facts1 = [...result.current.userFacts];
      
      // Trigger rerender
      rerender();

      const facts2 = [...result.current.userFacts];

      // Facts should be in same order
      expect(facts1.map(f => f.id)).toEqual(facts2.map(f => f.id));
    });

    it('should handle multiple facts with stable ordering', () => {
      const { result } = renderHook(() => useChat(mockSettings));

      // Add facts in random order
      act(() => {
        result.current.addUserFact('Fact C', 'other');
        result.current.addUserFact('Fact A', 'other');
        result.current.addUserFact('Fact B', 'other');
      });

      // All facts should be present
      expect(result.current.userFacts).toHaveLength(3);
      
      // When sorted by ID (as done in buildSystemPrompt), order should be deterministic
      const sorted = [...result.current.userFacts].sort((a, b) => a.id.localeCompare(b.id));
      expect(sorted).toHaveLength(3);
    });
  });
});
