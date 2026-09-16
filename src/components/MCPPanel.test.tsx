import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MCPPanel from './MCPPanel';
import { MCPServer, Settings } from '../types';

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

  it('should add new server', () => {
    render(<MCPPanel {...defaultProps} />);
    
    const nameInput = screen.getByPlaceholderText('Server name (optional)');
    const urlInput = screen.getByPlaceholderText('MCP Server URL (e.g., http://localhost:3001)');
    
    fireEvent.change(nameInput, { target: { value: 'New Server' } });
    fireEvent.change(urlInput, { target: { value: 'http://localhost:3002' } });
    
    const addButton = screen.getByText('Add');
    fireEvent.click(addButton);
    
    expect(defaultProps.onUpdateServers).toHaveBeenCalled();
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
    
    expect(defaultProps.onUpdateServers).toHaveBeenCalledWith([]);
  });

  it('should toggle server enabled state', () => {
    render(<MCPPanel {...defaultProps} />);
    
    const toggleButton = screen.getByRole('switch');
    fireEvent.click(toggleButton);
    
    expect(defaultProps.onUpdateServers).toHaveBeenCalledWith(
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
