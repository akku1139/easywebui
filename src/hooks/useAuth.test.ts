import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAuth } from './useAuth';

describe('useAuth', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('should start unauthenticated when no stored auth', async () => {
    // Mock failed auth check
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: false,
      status: 401,
    } as Response);

    const { result } = renderHook(() => useAuth());
    
    await waitFor(() => {
      expect(result.current.auth.isAuthenticated).toBe(false);
    });
    expect(result.current.auth.username).toBe('');
  });

  it('should authenticate when API returns success', async () => {
    // Mock successful auth check
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ username: 'admin', token: 'test-token' }),
    } as Response);

    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(result.current.auth.isAuthenticated).toBe(true);
      expect(result.current.auth.username).toBe('admin');
      expect(result.current.auth.token).toBe('test-token');
    });
  });

  it('should logout and clear auth state', async () => {
    // Mock successful auth check
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ username: 'admin', token: 'test-token' }),
    } as Response);

    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(result.current.auth.isAuthenticated).toBe(true);
    });

    act(() => {
      result.current.logout();
    });

    expect(result.current.auth.isAuthenticated).toBe(false);
    expect(result.current.auth.username).toBe('');
    expect(localStorage.getItem('ai-chat-auth')).toBeNull();
  });

  it('should restore auth state from localStorage', async () => {
    // Pre-populate localStorage
    localStorage.setItem('ai-chat-auth', JSON.stringify({
      isAuthenticated: true,
      username: 'admin',
      token: 'test-token',
    }));

    // Mock successful auth check
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ username: 'admin', token: 'test-token' }),
    } as Response);

    const { result } = renderHook(() => useAuth());
    
    await waitFor(() => {
      expect(result.current.auth.isAuthenticated).toBe(true);
      expect(result.current.auth.username).toBe('admin');
    });
  });

  it('should handle auth check failure gracefully', async () => {
    // Mock network error
    vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(result.current.auth.isAuthenticated).toBe(false);
    });
  });
});
