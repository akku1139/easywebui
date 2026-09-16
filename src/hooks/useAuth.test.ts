import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAuth } from './useAuth';

describe('useAuth', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('should start unauthenticated', () => {
    const { result } = renderHook(() => useAuth());
    expect(result.current.auth.isAuthenticated).toBe(false);
    expect(result.current.auth.username).toBe('');
  });

  it('should login with correct credentials', async () => {
    // Mock successful API response
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true, username: 'admin' }),
    } as Response);

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      const success = await result.current.login('admin', 'admin123');
      expect(success).toBe(true);
    });

    expect(result.current.auth.isAuthenticated).toBe(true);
    expect(result.current.auth.username).toBe('admin');
    expect(result.current.auth.token).toBeTruthy();
  });

  it('should reject incorrect credentials', async () => {
    // Mock failed API response
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: false,
      status: 401,
    } as Response);

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      const success = await result.current.login('admin', 'wrong');
      expect(success).toBe(false);
    });

    expect(result.current.auth.isAuthenticated).toBe(false);
  });

  it('should logout and clear auth state', async () => {
    // Mock successful login
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true, username: 'admin' }),
    } as Response);

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.login('admin', 'admin123');
    });

    expect(result.current.auth.isAuthenticated).toBe(true);

    act(() => {
      result.current.logout();
    });

    expect(result.current.auth.isAuthenticated).toBe(false);
    expect(result.current.auth.username).toBe('');
  });

  it('should persist auth state in localStorage', async () => {
    // Mock successful login
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true, username: 'admin' }),
    } as Response);

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.login('admin', 'admin123');
    });

    // Check localStorage
    const stored = localStorage.getItem('ai-chat-auth');
    expect(stored).toBeTruthy();
    const parsed = JSON.parse(stored!);
    expect(parsed.isAuthenticated).toBe(true);
    expect(parsed.username).toBe('admin');
  });

  it('should restore auth state from localStorage', () => {
    // Pre-populate localStorage
    localStorage.setItem('ai-chat-auth', JSON.stringify({
      isAuthenticated: true,
      username: 'admin',
      token: 'test-token',
    }));

    const { result } = renderHook(() => useAuth());
    expect(result.current.auth.isAuthenticated).toBe(true);
    expect(result.current.auth.username).toBe('admin');
  });
});
