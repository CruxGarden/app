import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { copyLabel, copyMessageText } from './message-actions';
import MessageCopy from './MessageCopy';
import { PersonPill, Reply } from './Reply';

describe('copying a message', () => {
  it('copies the markdown source as written', async () => {
    const writeText = vi.fn(async () => {});
    const source = '# Plan\n\n- **one**\n- `two`\n';
    expect(await copyMessageText(source, { writeText })).toBe('copied');
    expect(writeText).toHaveBeenCalledWith(source);
  });

  it('reports a refused or missing clipboard instead of throwing', async () => {
    const refused = { writeText: vi.fn(async () => Promise.reject(new Error('denied'))) };
    expect(await copyMessageText('text', refused)).toBe('failed');
    expect(await copyMessageText('text', undefined)).toBe('failed');
  });

  it('names the action, then confirms through the same name', () => {
    expect(copyLabel('idle')).toBe('Copy message');
    expect(copyLabel('copied')).toBe('Copied');
    expect(copyLabel('failed')).toBe('Could not copy');
  });
});

describe('the copy action on a message', () => {
  it('is a named button in the tab order, revealed with its message', () => {
    const html = renderToStaticMarkup(createElement(MessageCopy, { content: 'Hello' }));
    expect(html).toContain('<button');
    expect(html).toContain('aria-label="Copy message"');
    expect(html).toContain('data-testid="message-copy"');
    expect(html).not.toContain('tabindex="-1"');
    expect(html).toContain('group-hover/message:opacity-100');
    expect(html).toContain('focus-visible:opacity-100');
  });

  it('is absent for a message with nothing to copy', () => {
    expect(renderToStaticMarkup(createElement(MessageCopy, { content: '  ' }))).toBe('');
  });

  it("sits on the person's words and on a finished reply, not on one still being written", () => {
    const pill = renderToStaticMarkup(createElement(PersonPill, { content: 'Make a page' }));
    expect(pill).toContain('group/message');
    expect(pill.match(/data-testid="message-copy"/g)).toHaveLength(1);
    const reply = (streaming: boolean) =>
      renderToStaticMarkup(
        createElement(Reply, { avatar: null, content: 'Done.', footer: ['Model'], streaming }),
      );
    expect(reply(false).match(/data-testid="message-copy"/g)).toHaveLength(1);
    expect(reply(true)).not.toContain('message-copy');
  });
});

describe('the shared-conversation action (CR06)', () => {
  it('names what pressing it will do', async () => {
    const { shareToggleLabel } = await import('./message-actions');
    expect(shareToggleLabel(false)).toBe('Leave out of shared conversation');
    expect(shareToggleLabel(true)).toBe('Include in shared conversation');
  });
});
