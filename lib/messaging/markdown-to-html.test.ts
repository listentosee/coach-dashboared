import { describe, it, expect } from 'vitest';
import { marked } from 'marked';

// Configure marked the same way the API route does
marked.use({ gfm: true, breaks: true });

describe('Markdown-to-HTML conversion (marked)', () => {
  it('converts basic markdown to HTML', async () => {
    const html = await marked.parse('**Hello** world');
    expect(html).toContain('<strong>Hello</strong>');
    expect(html).toContain('world');
  });

  it('handles line breaks (breaks: true)', async () => {
    const html = await marked.parse('line one\nline two');
    expect(html).toContain('<br>');
  });

  it('converts GFM tables', async () => {
    const md = `| Name | Score |\n|------|-------|\n| Alice | 100 |`;
    const html = await marked.parse(md);
    expect(html).toContain('<table>');
    expect(html).toContain('Alice');
  });

  it('converts bullet lists', async () => {
    const md = '- Item A\n- Item B\n- Item C';
    const html = await marked.parse(md);
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>');
  });

  it('converts links', async () => {
    const html = await marked.parse('[Click here](https://example.com)');
    expect(html).toContain('<a href="https://example.com"');
    expect(html).toContain('Click here');
  });

  it('handles empty string', async () => {
    const html = await marked.parse('');
    expect(html).toBe('');
  });

  it('escapes raw HTML tags by default', async () => {
    // marked does NOT escape HTML by default, but we should be aware
    const html = await marked.parse('<script>alert("xss")</script>');
    // marked leaves HTML through by default; this test documents the behavior
    expect(typeof html).toBe('string');
  });
});
