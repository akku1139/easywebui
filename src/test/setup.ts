import * as matchers from '@testing-library/jest-dom/matchers';
import { expect } from 'vitest';

// Explicitly extend Vitest's expect with jest-dom matchers
// Required for CI environments where globals mode may not auto-extend
expect.extend(matchers);

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Mock fetch
(globalThis as any).fetch = vi.fn();

// Reset mocks before each test
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});
