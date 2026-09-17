import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import MCPPanel from './MCPPanel';
import { MCPServer, Settings } from '../types';

vi.mock('../utils/api-client', () => ({
  fetchMCPServers: vi.fn().mockResolvedValue([]),
  addMCPServer: vi.fn(),
  updateMCPServer: vi.fn().mockResolvedValue({ ok: true }),
  deleteMCPServer: vi.fn().mockResolvedValue({ ok: true }),
}));

import * as apiClient from '../utils/api-client';

const mockAddMCPServer = vi.mocked(apiClient.addMCPServer);
const mockFetchMCPServers = vi.mocked(apiClient.fetchMCPServers);
const mockUpdateMCPServer = vi.mocked(apiClient.updateMCPServer);
const mockDeleteMCPServer = vi.mocked(apiClient.deleteMCPServer);

describe('MCPPanel', () => {
  const mockServers: MCPServer[] = [
    {
      id: 'server-1',
      name: 'Test Server',
      url: 'http://localhost:3001',
      enabled: true,
      tools: [
        {
          name: 'search',
          description: 'Search the web',
          inputSchema: {},
          serverId: 'server-1',
        },
      ],
      status: 'connected',
      oauthEnabled: false,
    },
  ];

  const mockSettings: Settings = {
    endpoints: [],
    activeEndpointId: null,
    mcpServers: mockServers,
    memoryEnabled: true,
    autoMemory: true,
    theme: 'dark',
    customSystemPrompt: '',
    oauthClients: {},
  };

  const defaultProps = {
    servers: mockServers,
    onUpdateServers: vi.fn(),
    onClose: vi.fn(),
    theme: 'dark' as const,
    settings: mockSettings,
    onUpdateSettings: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockAddMCPServer.mockResolvedValue({ id: 'db-generated-id' });
    mockFetchMCPServers.mockResolvedValue([]);
    // stub global fetch for the OAuth discover call
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should render MCP panel with title', () => {
    render(<MCPPanel {...defaultProps} />);
    
    expect(screen.getByText('MCP Servers')).toBeInTheDocument();
    expect(screen.getByText(/Model Context Protocol/)).toBeInTheDocument();
  });

  it('should show server list', () => {
    render(<MCPPanel {...defaultProps} />);
    
    expect(screen.getByText('Test Server')).toBeInTheDocument();
    expect(screen.getByText('http://localhost:3001')).toBeInTheDocument();
  });

  it('should show empty state when no servers', () => {
    render(<MCPPanel {...defaultProps} servers={[]} />);
    
    expect(screen.getByText(/No MCP servers configured/)).toBeInTheDocument();
  });

  it('should add new server', async () => {
    render(<MCPPanel {...defaultProps} />);
    
    const nameInput = screen.getByPlaceholderText('Server name (optional)');
    const urlInput = screen.getByPlaceholderText('MCP Server URL (e.g., http://localhost:3001)');
    
    fireEvent.change(nameInput, { target: { value: 'New Server' } });
    fireEvent.change(urlInput, { target: { value: 'http://localhost:3002' } });
    
    const addButton = screen.getByText('Add');
    fireEvent.click(addButton);
    
    await waitFor(() => expect(defaultProps.onUpdateServers).toHaveBeenCalled());
    // Canonical DB id must be adopted, not the locally generated one.
    expect(defaultProps.onUpdateServers).toHaveBeenLastCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: 'db-generated-id', url: 'http://localhost:3002' }),
      ])
    );
    // Publish exactly once, after persistence — not before.
    expect(defaultProps.onUpdateServers).toHaveBeenCalledTimes(1);
    expect(mockAddMCPServer).toHaveBeenCalledTimes(1);
  });

  it('should surface an error and not keep an unsaved server when saving fails', async () => {
    mockAddMCPServer.mockRejectedValue(new Error('boom'));
    render(<MCPPanel {...defaultProps} />);

    fireEvent.change(screen.getByPlaceholderText('MCP Server URL (e.g., http://localhost:3001)'), {
      target: { value: 'http://localhost:3003' },
    });
    fireEvent.click(screen.getByText('Add'));

    await waitFor(() =>
      expect(screen.getByText(/Failed to save MCP server/i)).toBeInTheDocument()
    );
    expect(defaultProps.onUpdateServers).not.toHaveBeenCalled();
  });

  it('should persist removal via DELETE', () => {
    render(<MCPPanel {...defaultProps} />);
    fireEvent.click(screen.getAllByTitle('Remove server')[0]);
    expect(mockDeleteMCPServer).toHaveBeenLastCalledWith('server-1');
  });

  it('should persist toggle via PATCH', () => {
    render(<MCPPanel {...defaultProps} />);
    fireEvent.click(screen.getByRole('switch'));
    expect(mockUpdateMCPServer).toHaveBeenLastCalledWith('server-1', { enabled: false });
  });

  it('should reconcile legacy localStorage ids with canonical DB ids by URL', async () => {
    mockFetchMCPServers.mockResolvedValue([
      { id: 'canonical-db-id', name: 'Test Server', url: 'http://localhost:3001' },
    ]);
    render(<MCPPanel {...defaultProps} />);

    await waitFor(() =>
      expect(defaultProps.onUpdateServers).toHaveBeenLastCalledWith([
        expect.objectContaining({ id: 'canonical-db-id', url: 'http://localhost:3001' }),
      ])
    );
  });

  it('should not add server with empty URL', () => {
    render(<MCPPanel {...defaultProps} />);
    
    const addButton = screen.getByText('Add');
    fireEvent.click(addButton);
    
    expect(defaultProps.onUpdateServers).not.toHaveBeenCalled();
  });

  it('should remove server', () => {
    render(<MCPPanel {...defaultProps} />);
    
    const removeButtons = screen.getAllByTitle('Remove server');
    fireEvent.click(removeButtons[0]);
    
    expect(defaultProps.onUpdateServers).toHaveBeenLastCalledWith([]);
  });

  it('should toggle server enabled state', () => {
    render(<MCPPanel {...defaultProps} />);
    
    const toggleButton = screen.getByRole('switch');
    fireEvent.click(toggleButton);
    
    expect(defaultProps.onUpdateServers).toHaveBeenLastCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: 'server-1', enabled: false }),
      ])
    );
  });

  it('should connect to server', () => {
    render(<MCPPanel {...defaultProps} />);
    
    const connectButton = screen.getByText('Connect');
    fireEvent.click(connectButton);
    
    expect(defaultProps.onUpdateServers).toHaveBeenCalled();
  });

  it('should open OAuth modal', () => {
    render(<MCPPanel {...defaultProps} />);
    
    const oauthButton = screen.getByText('🔐 OAuth');
    fireEvent.click(oauthButton);
    
    expect(screen.getByText('OAuth 2.1 Configuration')).toBeInTheDocument();
  });

  it('should call onClose when close button is clicked', () => {
    render(<MCPPanel {...defaultProps} />);
    
    const closeButton = screen.getByRole('button', { name: '' });
    fireEvent.click(closeButton);
    
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('should show server tools', () => {
    render(<MCPPanel {...defaultProps} />);
    
    expect(screen.getByText('Available Tools:')).toBeInTheDocument();
    expect(screen.getByText('search')).toBeInTheDocument();
    expect(screen.getByText('Search the web')).toBeInTheDocument();
  });

  it('should render with light theme', () => {
    render(<MCPPanel {...defaultProps} theme="light" />);
    
    expect(screen.getByText('MCP Servers')).toBeInTheDocument();
  });

  it('should show status indicator', () => {
    render(<MCPPanel {...defaultProps} />);
    
    const statusIndicator = screen.getByText('Test Server').closest('div')?.querySelector('div');
    expect(statusIndicator).toBeInTheDocument();
  });
});
