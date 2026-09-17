import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ChatView from './ChatView';
import { Message } from '../types';

describe('ChatView', () => {
  const mockMessages: Message[] = [
    {
      id: 'msg-1',
      role: 'user',
      content: 'Hello',
      timestamp: Date.now(),
    },
    {
      id: 'msg-2',
      role: 'assistant',
      content: 'Hi there!',
      timestamp: Date.now(),
    },
  ];

  const defaultProps = {
    messages: mockMessages,
    isLoading: false,
    streamContent: '',
    onSend: vi.fn(),
    error: '',
    theme: 'dark' as const,
  };

  it('should render chat view', () => {
    render(<ChatView {...defaultProps} />);
    
    expect(screen.getByText('Hello')).toBeInTheDocument();
    expect(screen.getByText('Hi there!')).toBeInTheDocument();
  });

  it('should show empty state when no messages', () => {
    render(<ChatView {...defaultProps} messages={[]} />);
    
    expect(screen.getByText('Start a Conversation')).toBeInTheDocument();
  });

  it('should show input field', () => {
    render(<ChatView {...defaultProps} />);
    
    expect(screen.getByPlaceholderText(/Type a message/)).toBeInTheDocument();
  });

  it('should send message on submit', () => {
    render(<ChatView {...defaultProps} />);
    
    const input = screen.getByPlaceholderText(/Type a message/);
    fireEvent.change(input, { target: { value: 'New message' } });
    
    const sendButton = screen.getByRole('button');
    fireEvent.click(sendButton);
    
    expect(defaultProps.onSend).toHaveBeenCalledWith('New message');
  });

  it('should send message on Enter key', () => {
    render(<ChatView {...defaultProps} />);
    
    const input = screen.getByPlaceholderText(/Type a message/);
    fireEvent.change(input, { target: { value: 'New message' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    
    expect(defaultProps.onSend).toHaveBeenCalledWith('New message');
  });

  it('should not send empty message', () => {
    render(<ChatView {...defaultProps} />);
    
    const sendButton = screen.getByRole('button');
    fireEvent.click(sendButton);
    
    expect(defaultProps.onSend).not.toHaveBeenCalled();
  });

  it('should not send message while loading', () => {
    render(<ChatView {...defaultProps} isLoading={true} />);
    
    const input = screen.getByPlaceholderText(/Type a message/);
    fireEvent.change(input, { target: { value: 'New message' } });
    
    const sendButton = screen.getByRole('button');
    fireEvent.click(sendButton);
    
    expect(defaultProps.onSend).not.toHaveBeenCalled();
  });

  it('should show loading indicator', () => {
    render(<ChatView {...defaultProps} isLoading={true} />);
    
    const loadingIndicator = screen.getByRole('status');
    expect(loadingIndicator).toBeInTheDocument();
  });

  it('should show streaming content', () => {
    render(<ChatView {...defaultProps} streamContent="Streaming..." />);
    
    expect(screen.getByText('Streaming...')).toBeInTheDocument();
  });

  it('should show error message', () => {
    render(<ChatView {...defaultProps} error="Failed to send" />);
    
    expect(screen.getByText(/Failed to send/)).toBeInTheDocument();
  });

  it('should render with light theme', () => {
    render(<ChatView {...defaultProps} theme="light" />);
    
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('should show tool calls', () => {
    const messagesWithTools: Message[] = [
      {
        id: 'msg-1',
        role: 'assistant',
        content: 'Using tool',
        timestamp: Date.now(),
        toolCalls: [
          {
            id: 'tool-1',
            name: 'search',
            arguments: { query: 'test' },
            serverId: 'server-1',
          },
        ],
      },
    ];
    
    render(<ChatView {...defaultProps} messages={messagesWithTools} />);
    
    expect(screen.getByText(/search/)).toBeInTheDocument();
  });

  it('should show tool results', () => {
    const messagesWithToolResult: Message[] = [
      {
        id: 'msg-1',
        role: 'tool',
        content: 'Tool result',
        timestamp: Date.now(),
      },
    ];
    
    render(<ChatView {...defaultProps} messages={messagesWithToolResult} />);
    
    expect(screen.getByText('Tool result')).toBeInTheDocument();
  });

  it('should auto-scroll to bottom on new message', async () => {
    const { rerender } = render(<ChatView {...defaultProps} />);
    
    const newMessages: Message[] = [...mockMessages, {
      id: 'msg-3',
      role: 'user',
      content: 'New message',
      timestamp: Date.now(),
    }];
    
    rerender(<ChatView {...defaultProps} messages={newMessages} />);
    
    // Wait for scroll
    await new Promise(resolve => setTimeout(resolve, 0));
    
    expect(screen.getByText('New message')).toBeInTheDocument();
  });

  it('should clear input after sending', () => {
    render(<ChatView {...defaultProps} />);
    
    const input = screen.getByPlaceholderText(/Type a message/);
    fireEvent.change(input, { target: { value: 'New message' } });
    
    const sendButton = screen.getByRole('button');
    fireEvent.click(sendButton);
    
    expect(input).toHaveValue('');
  });

  it('should support multiline input with Shift+Enter', () => {
    render(<ChatView {...defaultProps} />);
    
    const input = screen.getByPlaceholderText(/Type a message/);
    fireEvent.change(input, { target: { value: 'Line 1' } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    
    expect(defaultProps.onSend).not.toHaveBeenCalled();
  });

  describe('markdown live rendering', () => {
    it('renders assistant messages as markdown', () => {
      render(<ChatView
        {...defaultProps}
        messages={[{ id: 'md-1', role: 'assistant', content: '# Rendered\n\n**bold**', timestamp: Date.now() }]}
      />);
      expect(screen.getByRole('heading', { level: 1, name: 'Rendered' })).toBeInTheDocument();
    });

    it('keeps user messages as plain text', () => {
      render(<ChatView
        {...defaultProps}
        messages={[{ id: 'md-2', role: 'user', content: '# not a heading' } as unknown as Message, ...mockMessages]}
      />);
      expect(screen.queryByRole('heading', { name: 'not a heading' })).toBeNull();
    });

    it('renders partial markdown while streaming (unclosed fence stays code)', async () => {
      const { rerender } = render(<ChatView {...defaultProps} isLoading streamContent={"```js\nconst a = 1;"} />);
      rerender(<ChatView {...defaultProps} isLoading streamContent={"```js\nconst a = 1;\nconst b = 2;\n```"} />);
      expect(document.querySelector('pre code')).not.toBeNull();
      // stream finished → final content flushes immediately
      rerender(<ChatView {...defaultProps} isLoading={false} streamContent="" messages={[
        { id: 'md-3', role: 'assistant', content: '```js\nconst a = 1;\nconst b = 2;\n```', timestamp: Date.now() },
      ]} />);
      expect(document.querySelector('pre code')).not.toBeNull();
      expect(document.querySelector('pre code')?.textContent).toContain('const b = 2;');
    });

    it('escapes raw html in streamed content', async () => {
      render(<ChatView {...defaultProps} isLoading streamContent="<b>x</b>" />);
      expect(document.querySelector('b')).toBeNull();
      expect(screen.getByText('<b>x</b>')).toBeInTheDocument();
    });
  });
});
