import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MarkdownContent } from './MarkdownContent';

describe('MarkdownContent', () => {
  it('renders markdown formatting for assistant content', () => {
    render(<MarkdownContent content={'# Title\n\n**bold** text'} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Title' })).toBeInTheDocument();
    expect(screen.getByText('bold').tagName).toBe('STRONG');
  });

  it('keeps plain mode as pre-wrapped text', () => {
    render(<MarkdownContent content={'line1\nline2'} mode="plain" />);
    const el = screen.getByText(/line1/);
    expect(el.tagName).toBe('P');
    expect(el.style.whiteSpace).toBe('pre-wrap');
  });

  it('escapes raw HTML', () => {
    render(<MarkdownContent content="<b>hi</b>" />);
    expect(document.querySelector('b')).toBeNull();
    expect(screen.getByText('<b>hi</b>')).toBeInTheDocument();
  });
});
