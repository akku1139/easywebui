import { describe, it, expect } from 'vitest';
import { renderMarkdown } from './markdown';

describe('renderMarkdown', () => {
  it('renders a heading, bold and paragraph', () => {
    const html = renderMarkdown('# Title\n\nHello **world**');
    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('<strong>world</strong>');
  });

  it('escapes raw HTML instead of rendering it', () => {
    const html = renderMarkdown('<script>alert(1)</script>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('keeps an unclosed fence rendering as code (mid-stream chunk)', () => {
    const html = renderMarkdown('intro\n\n```js\nconst a = 1;');
    expect(html).toContain('<pre><code>const a = 1;');
    expect(html).toContain('<p>intro</p>');
  });

  it('consumes same-line fence text without getting stuck', () => {
    expect(renderMarkdown('```text```')).toContain('text');
  });

  it('renders lists and task checkboxes', () => {
    const html = renderMarkdown('- item one\n- item two\n  - nested\n- [x] done');
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>item one</li>');
    expect(html).toContain('checked');
  });

  it('renders ordered lists', () => {
    const html = renderMarkdown('1. first\n2. second');
    expect(html).toContain('<ol>');
    expect(html).toContain('<li>first</li>');
  });

  it('renders a GFM table with alignment', () => {
    const html = renderMarkdown('| A | B |\n| --- | :--: |\n| 1 | 2 |');
    expect(html).toContain('<table>');
    expect(html).toContain('<th>A</th>');
    expect(html).toContain('text-align:center');
  });

  it('renders links, images and code spans', () => {
    const html = renderMarkdown('[site](https://example.com) and ![img](https://example.com/i.png) and `code`');
    expect(html).toContain('<a href="https://example.com"');
    expect(html).toContain('<img src="https://example.com/i.png"');
    expect(html).toContain('<code>code</code>');
  });

  it('renders blockquotes and horizontal rules', () => {
    const html = renderMarkdown('> quoted\n\n---');
    expect(html).toContain('<blockquote>');
    expect(html).toContain('<hr>');
  });

  it('does not turn javascript: text into a link', () => {
    const html = renderMarkdown('[x](javascript:alert(1))');
    expect(html).not.toContain('<a href="javascript');
  });
});
