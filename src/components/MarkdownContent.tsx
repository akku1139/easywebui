import { memo, useMemo } from 'react';
import { renderMarkdown } from '../utils/markdown';

interface Props {
  content: string;
  /** `plain` for user/tool messages, `markdown` for assistant output. */
  mode?: 'markdown' | 'plain';
  className?: string;
}

/**
 * Renders a message body. Assistant output goes through the dependency-free
 * markdown renderer (memoized by source string); user and tool messages stay
 * as plain pre-wrapped text. HTML in markdown source is escaped by the
 * renderer, and only http(s) links/images survive, so dangerouslySetInnerHTML
 * here is safe.
 */
export const MarkdownContent = memo(function MarkdownContent({ content, mode = 'markdown', className }: Props) {
  const html = useMemo(() => (mode === 'markdown' ? renderMarkdown(content) : null), [content, mode]);
  if (mode === 'plain') {
    return <p className={className} style={{ whiteSpace: 'pre-wrap' }}>{content}</p>;
  }
  return <div className={`markdown-body ${className ?? ''}`} dangerouslySetInnerHTML={{ __html: html ?? '' }} />;
});
