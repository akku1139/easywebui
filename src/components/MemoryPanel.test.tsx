import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MemoryPanel from './MemoryPanel';
import { UserFact, ConversationSummary } from '../types';

describe('MemoryPanel', () => {
  const mockFacts: UserFact[] = [
    {
      id: 'fact-1',
      content: 'User likes TypeScript',
      category: 'preference',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      source: 'explicit',
    },
    {
      id: 'fact-2',
      content: 'User works at Cloudflare',
      category: 'work',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      source: 'auto_detected',
    },
  ];

  const mockSummaries: ConversationSummary[] = [
    {
      id: 'summary-1',
      title: 'Previous Chat',
      summary: 'Discussed TypeScript features',
      date: '2024-01-15',
      messageCount: 10,
      createdAt: Date.now(),
    },
  ];

  const defaultProps = {
    facts: mockFacts,
    summaries: mockSummaries,
    onAddFact: vi.fn(),
    onRemoveFact: vi.fn(),
    onClose: vi.fn(),
    theme: 'dark' as const,
  };

  it('should render memory panel with title', () => {
    render(<MemoryPanel {...defaultProps} />);
    
    expect(screen.getByText('Memory')).toBeInTheDocument();
    expect(screen.getByText(/ChatGPT-style persistent memory/)).toBeInTheDocument();
  });

  it('should show facts tab by default', () => {
    render(<MemoryPanel {...defaultProps} />);
    
    expect(screen.getByText('User likes TypeScript')).toBeInTheDocument();
    expect(screen.getByText('User works at Cloudflare')).toBeInTheDocument();
  });

  it('should switch to summaries tab', () => {
    render(<MemoryPanel {...defaultProps} />);
    
    fireEvent.click(screen.getByText(/Summaries/));
    
    expect(screen.getByText('Previous Chat')).toBeInTheDocument();
    expect(screen.getByText('Discussed TypeScript features')).toBeInTheDocument();
  });

  it('should call onAddFact when adding a new fact', () => {
    render(<MemoryPanel {...defaultProps} />);
    
    const input = screen.getByPlaceholderText('Add a fact to remember...');
    fireEvent.change(input, { target: { value: 'New fact' } });
    
    const addButton = screen.getByText('Add');
    fireEvent.click(addButton);
    
    expect(defaultProps.onAddFact).toHaveBeenCalledWith('New fact', 'other');
  });

  it('should not add empty fact', () => {
    render(<MemoryPanel {...defaultProps} />);
    
    const addButton = screen.getByText('Add');
    fireEvent.click(addButton);
    
    expect(defaultProps.onAddFact).not.toHaveBeenCalled();
  });

  it('should call onRemoveFact when removing a fact', () => {
    render(<MemoryPanel {...defaultProps} />);
    
    const factElement = screen.getByText('User likes TypeScript').closest('div');
    const removeButton = factElement?.querySelector('button');
    
    if (removeButton) {
      fireEvent.click(removeButton);
      expect(defaultProps.onRemoveFact).toHaveBeenCalledWith('fact-1');
    }
  });

  it('should call onClose when close button is clicked', () => {
    render(<MemoryPanel {...defaultProps} />);
    
    const closeButton = screen.getByRole('button', { name: '' });
    fireEvent.click(closeButton);
    
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('should show empty state when no facts', () => {
    render(<MemoryPanel {...defaultProps} facts={[]} />);
    
    expect(screen.getByText(/No memories yet/)).toBeInTheDocument();
  });

  it('should show empty state when no summaries', () => {
    render(<MemoryPanel {...defaultProps} summaries={[]} />);
    
    fireEvent.click(screen.getByText(/Summaries/));
    expect(screen.getByText(/No conversation summaries yet/)).toBeInTheDocument();
  });

  it('should render with light theme', () => {
    render(<MemoryPanel {...defaultProps} theme="light" />);
    
    expect(screen.getByText('Memory')).toBeInTheDocument();
  });

  it('should allow changing category when adding fact', () => {
    render(<MemoryPanel {...defaultProps} />);
    
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'work' } });
    
    const input = screen.getByPlaceholderText('Add a fact to remember...');
    fireEvent.change(input, { target: { value: 'New work fact' } });
    
    const addButton = screen.getByText('Add');
    fireEvent.click(addButton);
    
    expect(defaultProps.onAddFact).toHaveBeenCalledWith('New work fact', 'work');
  });
});
