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

  it.each(['', ' \n\t'])('renders tool-only messages without an empty bubble or avatar (%j)', content => {
    render(<ChatView {...defaultProps} messages={[{
      id: 'call', role: 'assistant', content, timestamp: 1,
      toolCalls: [{ id: 'c', name: 'easywebui_execute_tool', serverId: '',
        arguments: { tool_id: '["s","notion-fetch"]' } }],
      usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 },
    }]} />);
    const row = screen.getByRole('group', { name: 'Tool calls' });
    expect(row).toHaveTextContent('notion-fetch (s)');
    expect(row.querySelector('.markdown-body')).toBeNull();
    expect(row.querySelector('svg')).toBeNull();
    expect(screen.getByTitle('10 prompt + 2 completion')).toHaveTextContent('12 tokens');
  });

  it('keeps assistant text when a tool call also contains an explanation', () => {
    render(<ChatView {...defaultProps} messages={[{
      id: 'call', role: 'assistant', content: 'Fetching your page.', timestamp: 1,
      toolCalls: [{ id: 'c', name: 'notion-fetch', serverId: 's', arguments: {} }],
    }]} />);
    expect(screen.getByText('Fetching your page.')).toBeVisible();
    expect(document.querySelector('.markdown-body')).not.toBeNull();
    expect(screen.queryByRole('group', { name: 'Tool calls' })).not.toBeInTheDocument();
  });

  it('labels existing tool history and collapses full results without discarding content', () => {
    const body = 'Long tool output\n'.repeat(500);
    render(<ChatView {...defaultProps} messages={[
      { id: 'a', role: 'assistant', content: '', timestamp: 1, toolCalls: [
        { id: 'c', name: 'notion-fetch', arguments: {}, serverId: 's' },
      ] },
      { id: 't', role: 'tool', content: body, timestamp: 2, toolResult: { toolCallId: 'c', content: body } },
      { id: 'a2', role: 'assistant', content: '', timestamp: 3, toolCalls: [
        { id: 'c', name: 'easywebui_execute_tool', arguments: { tool_id: '["s2","search"]' }, serverId: '' },
      ] },
      { id: 't2', role: 'tool', content: 'boom', timestamp: 4, toolResult: { toolCallId: 'c', content: 'boom', isError: true } },
    ]} />);
    const details = document.querySelectorAll('details');
    expect(details[0].querySelector('summary')).toHaveTextContent('notion-fetch');
    expect(details[0]).not.toHaveAttribute('open');
    expect(details[0].querySelector('pre')?.textContent).toBe(body);
    expect(details[0].querySelector('pre')).toHaveClass('max-h-60', 'overflow-auto');
    fireEvent.click(details[0].querySelector('summary')!);
    expect(details[0]).toHaveAttribute('open');
    fireEvent.click(details[0].querySelector('summary')!);
    expect(details[0]).not.toHaveAttribute('open');
    expect(details[1].querySelector('summary')).toHaveTextContent('search (s2) (error)');
    expect(details[1]).toHaveAttribute('open');
  });

  it('falls back to a stored tool name or generic heading for unpaired old results', () => {
    render(<ChatView {...defaultProps} messages={[
      { id: 't', role: 'tool', content: 'result', timestamp: 1,
        toolResult: { toolCallId: 'missing', content: 'result', toolName: 'stored-tool' } },
      { id: 'old', role: 'tool', content: 'legacy', timestamp: 1 },
    ]} />);
    const headings = document.querySelectorAll('summary');
    expect(headings[0]).toHaveTextContent('stored-tool');
    expect(headings[1]).toHaveTextContent('Tool Result');
  });

  it('shows per-message token usage when the provider reports it', () => {
    render(<ChatView {...defaultProps} messages={[...mockMessages,
      { id: 'u3', role: 'assistant', content: 'Measured answer', timestamp: Date.now(),
        usage: { prompt_tokens: 12, completion_tokens: 34, total_tokens: 46 } },
      { id: 'u4', role: 'assistant', content: 'No usage reported', timestamp: Date.now() }]} />);
    expect(screen.getByTitle('12 prompt + 34 completion')).toHaveTextContent('46 tokens');
    expect(screen.queryByText('No usage reported')).toBeInTheDocument();
    expect(screen.getAllByText(/tokens$/)).toHaveLength(1);
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
