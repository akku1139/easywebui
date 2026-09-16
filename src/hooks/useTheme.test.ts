import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useTheme, Theme } from './useTheme';

describe('useTheme', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark', 'light');
    
    // Mock matchMedia for all tests
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  it('should apply dark theme to document', () => {
    renderHook(() => useTheme('dark'));
    
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.classList.contains('light')).toBe(false);
  });

  it('should apply light theme to document', () => {
    renderHook(() => useTheme('light'));
    
    expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('should store theme in localStorage', () => {
    renderHook(() => useTheme('dark'));
    
    expect(localStorage.getItem('theme')).toBe('dark');
  });

  it('should switch theme when prop changes', () => {
    const { rerender } = renderHook(
      ({ theme }) => useTheme(theme),
      { initialProps: { theme: 'dark' as Theme } }
    );
    
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    
    rerender({ theme: 'light' });
    
    expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(localStorage.getItem('theme')).toBe('light');
  });

  it('should apply system theme based on prefers-color-scheme', () => {
    // Mock matchMedia
    const mockMatchMedia = vi.fn().mockImplementation((query) => ({
      matches: query === '(prefers-color-scheme: dark)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: mockMatchMedia,
    });

    renderHook(() => useTheme('system'));
    
    // Should apply dark theme if system prefers dark
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.classList.contains('light')).toBe(false);
    expect(localStorage.getItem('theme')).toBe('system');
  });

  it('should listen to system preference changes', () => {
    const addEventListenerSpy = vi.fn();
    
    const mockMatchMedia = vi.fn().mockImplementation((query) => ({
      matches: true,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: addEventListenerSpy,
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: mockMatchMedia,
    });

    renderHook(() => useTheme('system'));
    
    // Should have added event listener for system theme changes
    expect(addEventListenerSpy).toHaveBeenCalledWith('change', expect.any(Function));
  });
});
