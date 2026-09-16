import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import OAuthCallback from './OAuthCallback';

// Mock fetch
global.fetch = vi.fn();

const renderWithRouter = (ui: React.ReactElement) => {
  return render(<BrowserRouter>{ui}</BrowserRouter>);
};

describe('OAuthCallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render processing state initially', () => {
    // Mock window.location.search
    Object.defineProperty(window, 'location', {
      value: {
        search: '?code=test-code&state=test-state',
      },
      writable: true,
    });

    vi.mocked(global.fetch).mockImplementation(() => 
      new Promise(() => {}) // Never resolves to keep processing state
    );

    renderWithRouter(<OAuthCallback />);
    
    expect(screen.getByText('Processing OAuth...')).toBeInTheDocument();
  });

  it('should show error when error parameter is present', () => {
    Object.defineProperty(window, 'location', {
      value: {
        search: '?error=access_denied',
      },
      writable: true,
    });

    renderWithRouter(<OAuthCallback />);
    
    expect(screen.getByText('Error')).toBeInTheDocument();
    expect(screen.getByText(/OAuth error: access_denied/)).toBeInTheDocument();
  });

  it('should show error when code or state is missing', () => {
    Object.defineProperty(window, 'location', {
      value: {
        search: '?code=test-code', // Missing state
      },
      writable: true,
    });

    renderWithRouter(<OAuthCallback />);
    
    expect(screen.getByText('Error')).toBeInTheDocument();
    expect(screen.getByText('Missing code or state parameter')).toBeInTheDocument();
  });

  it('should call backend API with code and state', async () => {
    Object.defineProperty(window, 'location', {
      value: {
        search: '?code=test-code&state=test-state',
      },
      writable: true,
    });

    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    } as Response);

    renderWithRouter(<OAuthCallback />);
    
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/mcp-oauth/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'test-code', state: 'test-state' }),
      });
    });
  });

  it('should show success message on successful callback', async () => {
    Object.defineProperty(window, 'location', {
      value: {
        search: '?code=test-code&state=test-state',
      },
      writable: true,
    });

    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    } as Response);

    renderWithRouter(<OAuthCallback />);
    
    await waitFor(() => {
      expect(screen.getByText('Success!')).toBeInTheDocument();
    });
  });

  it('should show error on API failure', async () => {
    Object.defineProperty(window, 'location', {
      value: {
        search: '?code=test-code&state=test-state',
      },
      writable: true,
    });

    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: 'Invalid code' }),
    } as Response);

    renderWithRouter(<OAuthCallback />);
    
    await waitFor(() => {
      expect(screen.getByText('Error')).toBeInTheDocument();
      expect(screen.getByText('Invalid code')).toBeInTheDocument();
    });
  });
});
