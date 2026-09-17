import { useState, useRef, useEffect, useMemo } from 'react';
import { Message } from '../types';
import { toolLabel } from '../utils/tool-label';
import { MarkdownContent } from './MarkdownContent';

interface Props {
  messages: Message[];
  isLoading: boolean;
  streamContent: string;
  onSend: (content: string) => void;
  error?: string;
  theme: 'light' | 'dark';
}

export default function ChatView({ messages, isLoading, streamContent, onSend, error, theme }: Props) {
  const isDark = theme === 'dark';
  // Walk in order so provider call IDs reused on later turns do not relabel history.
  const resultLabels = useMemo(() => {
    const calls = new Map<string, string>();
    const labels = new Map<string, string>();
    for (const message of messages) {
      for (const call of message.toolCalls ?? []) calls.set(call.id, toolLabel(call));
      if (message.toolResult) labels.set(message.id,
        calls.get(message.toolResult.toolCallId) || message.toolResult.toolName || 'Tool Result');
    }
    return labels;
  }, [messages]);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const scrollToBottom = messagesEndRef.current?.scrollIntoView;
    scrollToBottom?.call(messagesEndRef.current, { behavior: 'smooth' });
  }, [messages, streamContent]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px';
    }
  }, [input]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      onSend(input.trim());
      setInput('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    // min-h-0: without it this h-full child overflows `main` and pushes the
    // 56px header out of view once a conversation renders.
    <div className="flex-1 flex flex-col h-full min-h-0">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 && !streamContent && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-md">
              <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-blue-500/20 to-purple-600/20 rounded-3xl flex items-center justify-center">
                <svg className="w-10 h-10 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
              </div>
              <h2 className={`text-xl font-semibold mb-2 ${
                isDark ? 'text-white' : 'text-gray-900'
              }`}>Start a Conversation</h2>
              <p className={`text-sm ${
                isDark ? 'text-gray-400' : 'text-gray-600'
              }`}>
                Send a message to begin. Your conversations are enhanced with memory and MCP tools.
              </p>
            </div>
          </div>
        )}

        <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
          {messages.map(msg => (
            <MessageBubble key={msg.id} message={msg} isDark={isDark} toolName={resultLabels.get(msg.id)} />
          ))}
          
          {streamContent && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <div className={`flex-1 rounded-2xl rounded-tl-sm px-4 py-3 ${
                isDark ? 'bg-gray-800/50' : 'bg-gray-100'
              }`}>
                <MarkdownContent
                  content={streamContent}
                  className={`text-sm leading-relaxed ${isDark ? 'text-gray-200' : 'text-gray-800'}`}
                />
                <span className="inline-block w-2 h-4 bg-blue-400 animate-pulse ml-0.5" />
              </div>
            </div>
          )}

          {isLoading && !streamContent && (
            <div role="status" aria-label="Loading response" className="flex gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <div className={`rounded-2xl rounded-tl-sm px-4 py-3 ${
                isDark ? 'bg-gray-800/50' : 'bg-gray-100'
              }`}>
                <div className="flex gap-1.5">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
              <strong>Error:</strong> {error}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className={`border-t p-4 ${
        isDark ? 'border-gray-700' : 'border-gray-200'
      }`}>
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto">
          <div className={`relative flex items-end border rounded-2xl focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 transition ${
            isDark 
              ? 'bg-gray-800 border-gray-600' 
              : 'bg-white border-gray-300'
          }`}>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message... (Shift+Enter for new line)"
              rows={1}
              className={`flex-1 bg-transparent px-4 py-3 resize-none focus:outline-none text-sm max-h-[200px] ${
                isDark 
                  ? 'text-white placeholder-gray-400' 
                  : 'text-gray-900 placeholder-gray-500'
              }`}
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="m-2 p-2 bg-blue-500 text-white rounded-xl hover:bg-blue-600 disabled:opacity-30 disabled:hover:bg-blue-500 transition"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function MessageBubble({ message, isDark, toolName }: { message: Message; isDark: boolean; toolName?: string }) {
  const isUser = message.role === 'user';
  const isTool = message.role === 'tool';

  // Tool-only assistant messages are protocol records, not empty chat bubbles.
  // Keep their labels/usage visible while leaving the stored transcript intact.
  if (message.role === 'assistant' && message.toolCalls?.length && !message.content.trim()) {
    return (
      <div role="group" aria-label="Tool calls" className="flex flex-wrap items-center gap-2 text-xs">
        {message.toolCalls.map(call => (
          <span key={call.id} className={`min-w-0 break-words rounded px-2 py-1 ${
            isDark ? 'bg-purple-500/10 text-purple-300' : 'bg-purple-50 text-purple-700'
          }`}>🔧 {toolLabel(call)}</span>
        ))}
        {message.usage && <span className={isDark ? 'text-gray-500' : 'text-gray-600'}
          title={`${message.usage.prompt_tokens} prompt + ${message.usage.completion_tokens} completion`}>
          {message.usage.total_tokens} tokens
        </span>}
      </div>
    );
  }

  if (isTool) {
    // Compact by default: the tool name stays in the header, the long body is
    // collapsed and expandable. Errors render expanded so they stay visible.
    const isError = message.toolResult?.isError;
    return (
      <details className="group min-w-0" open={isError}>
        <summary className="flex gap-2 items-center cursor-pointer list-none min-w-0 rounded p-1 focus-visible:outline focus-visible:outline-2">
          <span aria-hidden="true" className="shrink-0 text-gray-500 transition-transform group-open:rotate-90">▸</span>
          <div className="w-6 h-6 rounded-lg bg-yellow-500/20 flex items-center justify-center shrink-0">
            <svg className="w-3.5 h-3.5 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <span title={toolName} className={`min-w-0 truncate text-xs px-2 py-0.5 rounded-full ${
            isError ? 'bg-red-500/20 text-red-500' : isDark ? 'bg-yellow-500/20 text-yellow-400' : 'bg-yellow-100 text-yellow-800'
          }`}>
            🔧 {toolName || 'Tool Result'}{isError ? ' (error)' : ''}
          </span>
          <span className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
            {message.content.length.toLocaleString()} chars
          </span>
        </summary>
        <pre className={`max-h-60 overflow-auto break-words border rounded-xl px-3 py-2 text-xs whitespace-pre-wrap font-mono mt-2 ${
          isDark ? 'bg-yellow-500/5 border-yellow-500/20 text-gray-300' : 'bg-yellow-50 border-yellow-200 text-gray-700'
        }`}>{message.content}</pre>
      </details>
    );
  }

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
        isUser
          ? 'bg-gradient-to-br from-green-500 to-emerald-600'
          : 'bg-gradient-to-br from-blue-500 to-purple-600'
      }`}>
        {isUser ? (
          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        ) : (
          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        )}
      </div>
      <div className={`flex-1 max-w-[80%] ${isUser ? 'flex flex-col items-end' : ''}`}>
        <div className={`rounded-2xl px-4 py-3 ${
          isUser
            ? 'bg-blue-500/20 border border-blue-500/30 rounded-tr-sm'
            : isDark
              ? 'bg-gray-800/50 rounded-tl-sm'
              : 'bg-gray-100 rounded-tl-sm'
        }`}>
          <MarkdownContent
            content={message.content}
            mode={isUser ? 'plain' : 'markdown'}
            className={`text-sm leading-relaxed ${isDark ? 'text-gray-200' : 'text-gray-800'}`}
          />
        </div>
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {message.toolCalls.map(tc => (
              <span key={tc.id} className="text-xs bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded-full">
                🔧 {tc.name}
              </span>
            ))}
          </div>
        )}
<span className={`flex items-center gap-2 text-xs mt-1 px-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
          <span>{new Date(message.timestamp).toLocaleTimeString()}</span>
          {message.usage && <span title={`${message.usage.prompt_tokens} prompt + ${message.usage.completion_tokens} completion`}>
            {message.usage.total_tokens} tokens
          </span>}
        </span>
      </div>
    </div>
  );
}
