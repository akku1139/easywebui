import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Sidebar from './Sidebar';
import { Conversation } from '../types';

describe('Sidebar', () => {
  const mockConversations: Conversation[] = [
    {
      id: 'conv-1',
      title: 'Pinned Chat',
      messages: [],
      createdAt: 1000,
      updatedAt: 1000,
      model: 'gpt-4o',
      pinned: true,
    },
    {
      id: 'conv-2',
      title: 'Recent Chat',
      messages: [],
      createdAt: 2000,
      updatedAt: 2000,
      model: 'gpt-4o',
      pinned: false,
    },
    {
      id: 'conv-3',
      title: 'Old Chat',
      messages: [],
      createdAt: 500,
      updatedAt: 500,
      model: 'gpt-4o',
      pinned: false,
    },
  ];

  const defaultProps = {
    conversations: mockConversations,
    activeId: null,
    theme: 'dark' as const,
    onSelect: vi.fn(),
    onNew: vi.fn(),
    onDelete: vi.fn(),
    onTogglePin: vi.fn(),
    onOpenSettings: vi.fn(),
    onOpenMemory: vi.fn(),
    onOpenMCP: vi.fn(),
  };

  it('should render conversations', () => {
    render(<Sidebar {...defaultProps} />);
    
    expect(screen.getByText('Pinned Chat')).toBeInTheDocument();
    expect(screen.getByText('Recent Chat')).toBeInTheDocument();
    expect(screen.getByText('Old Chat')).toBeInTheDocument();
  });

  it('should display pinned section when there are pinned conversations', () => {
    render(<Sidebar {...defaultProps} />);
    
    expect(screen.getByText('📌 Pinned')).toBeInTheDocument();
  });

  it('should not display pinned section when no conversations are pinned', () => {
    const conversationsWithoutPinned = mockConversations.map(c => ({ ...c, pinned: false }));
    render(<Sidebar {...defaultProps} conversations={conversationsWithoutPinned} />);
    
    expect(screen.queryByText('📌 Pinned')).not.toBeInTheDocument();
  });

  it('should call onSelect when conversation is clicked', () => {
    render(<Sidebar {...defaultProps} />);
    
    fireEvent.click(screen.getByText('Pinned Chat'));
    expect(defaultProps.onSelect).toHaveBeenCalledWith('conv-1');
  });

  it('should call onTogglePin when pin button is clicked', () => {
    render(<Sidebar {...defaultProps} />);
    
    // Find the pin button for the pinned conversation
    const pinButtons = screen.getAllByTitle(/pin conversation/i);
    fireEvent.click(pinButtons[0]);
    
    expect(defaultProps.onTogglePin).toHaveBeenCalled();
  });

  it('should call onDelete when delete button is clicked', () => {
    render(<Sidebar {...defaultProps} />);
    
    // Find the delete button
    const deleteButtons = screen.getAllByTitle(/delete conversation/i);
    fireEvent.click(deleteButtons[0]);
    
    expect(defaultProps.onDelete).toHaveBeenCalled();
  });

  it('should call onNew when new chat button is clicked', () => {
    render(<Sidebar {...defaultProps} />);
    
    fireEvent.click(screen.getByText('New Chat'));
    expect(defaultProps.onNew).toHaveBeenCalled();
  });

  it('should highlight active conversation', () => {
    render(<Sidebar {...defaultProps} activeId="conv-2" />);
    
    const activeConversation = screen.getByText('Recent Chat').closest('div');
    expect(activeConversation).toHaveClass('bg-gray-700/70');
  });

  it('should call onOpenMemory when memory button is clicked', () => {
    render(<Sidebar {...defaultProps} />);
    
    fireEvent.click(screen.getByText('Memory'));
    expect(defaultProps.onOpenMemory).toHaveBeenCalled();
  });

  it('should call onOpenMCP when MCP button is clicked', () => {
    render(<Sidebar {...defaultProps} />);
    
    fireEvent.click(screen.getByText('MCP Servers'));
    expect(defaultProps.onOpenMCP).toHaveBeenCalled();
  });

  it('should call onOpenSettings when settings button is clicked', () => {
    render(<Sidebar {...defaultProps} />);
    
    fireEvent.click(screen.getByText('Settings'));
    expect(defaultProps.onOpenSettings).toHaveBeenCalled();
  });

  it('should display empty state when no conversations', () => {
    render(<Sidebar {...defaultProps} conversations={[]} />);
    
    expect(screen.getByText('No conversations yet')).toBeInTheDocument();
  });
});
