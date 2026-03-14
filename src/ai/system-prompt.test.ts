import { describe, it, expect } from 'vitest';
import {
  buildSystemPromptFromData,
  estimateTokens,
  estimateMessageTokens,
  trimMessagesIfNeeded,
} from './system-prompt';
import type { Crux, Artifact } from '@/services/types';

function makeCrux(overrides: Partial<Crux> = {}): Crux {
  return {
    id: 'crux-1',
    slug: 'test',
    title: 'Test Crux',
    data: '',
    status: 'living',
    visibility: 'private',
    discoverable: false,
    authorId: 'author-1',
    homeId: 'home-1',
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    ...overrides,
  };
}

function makeArtifact(path: string, overrides: Partial<Artifact> = {}): Artifact {
  return {
    id: `att-${path}`,
    type: 'artifact',
    kind: 'file',
    meta: { path },
    resourceId: 'crux-1',
    resourceType: 'crux',
    authorId: 'author-1',
    homeId: 'home-1',
    encoding: 'utf-8',
    mimeType: 'text/html',
    filename: path.split('/').pop() || path,
    size: 100,
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    ...overrides,
  };
}

describe('buildSystemPromptFromData', () => {
  it('includes all required sections', () => {
    const prompt = buildSystemPromptFromData(makeCrux(), []);

    expect(prompt).toContain('## Identity');
    expect(prompt).toContain('## Capabilities');
    expect(prompt).toContain('## Process');
    expect(prompt).toContain('## Rules');
    expect(prompt).toContain('## Web Applications');
    expect(prompt).toContain('## Edge Cases');
    expect(prompt).toContain('## Current Files');
  });

  it('uses default Keeper persona when no custom prompt', () => {
    const prompt = buildSystemPromptFromData(makeCrux(), []);
    expect(prompt).toContain('The Keeper');
    expect(prompt).toContain('Crux Garden');
  });

  it('uses custom system prompt when provided', () => {
    const crux = makeCrux({
      meta: { settings: { systemPrompt: 'You are a coding assistant.' } },
    });
    const prompt = buildSystemPromptFromData(crux, []);
    expect(prompt).toContain('You are a coding assistant.');
    expect(prompt).not.toContain('The Keeper');
  });

  it('lists artifact files in Current Files section', () => {
    const artifacts = [
      makeArtifact('index.html'),
      makeArtifact('styles.css'),
    ];
    const prompt = buildSystemPromptFromData(makeCrux(), artifacts);
    expect(prompt).toContain('- index.html');
    expect(prompt).toContain('- styles.css');
  });

  it('shows "No files yet." when no artifacts', () => {
    const prompt = buildSystemPromptFromData(makeCrux(), []);
    expect(prompt).toContain('No files yet.');
  });

  it('excludes version artifacts from file listing', () => {
    const artifacts = [
      makeArtifact('index.html'),
      makeArtifact('snapshot.html', { type: 'version' }),
    ];
    const prompt = buildSystemPromptFromData(makeCrux(), artifacts);
    expect(prompt).toContain('- index.html');
    expect(prompt).not.toContain('- snapshot.html');
  });

  it('includes workspace context when summary exists', () => {
    const crux = makeCrux({
      meta: {
        summary: {
          crux: 'Portfolio Site',
          purpose: 'Showcase work',
          stage: 'In progress',
          themes: 'Minimalist',
          stack: 'HTML/CSS/JS',
        },
      },
    });
    const prompt = buildSystemPromptFromData(crux, []);
    expect(prompt).toContain('## Workspace Context');
    expect(prompt).toContain('Project: Portfolio Site');
    expect(prompt).toContain('Purpose: Showcase work');
  });

  it('omits workspace context when no summary', () => {
    const prompt = buildSystemPromptFromData(makeCrux(), []);
    expect(prompt).not.toContain('## Workspace Context');
  });
});

describe('estimateTokens', () => {
  it('estimates ~3.5 chars per token', () => {
    expect(estimateTokens('hello world')).toBe(4); // 11 / 3.5 = 3.14, ceil = 4
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('a'.repeat(100))).toBe(29); // 100 / 3.5 = 28.57, ceil = 29
  });
});

describe('estimateMessageTokens', () => {
  it('estimates tokens for string content', () => {
    const messages = [
      { role: 'user', content: 'hello world' },
      { role: 'assistant', content: 'hi there' },
    ];
    const tokens = estimateMessageTokens(messages);
    expect(tokens).toBeGreaterThan(0);
    expect(tokens).toBe(estimateTokens('hello world') + estimateTokens('hi there'));
  });

  it('estimates tokens for content block arrays', () => {
    const messages = [
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Let me help' },
          { type: 'tool_use', id: 't1', name: 'read_file', input: { path: 'index.html' } },
        ],
      },
    ];
    const tokens = estimateMessageTokens(messages);
    expect(tokens).toBeGreaterThan(0);
  });
});

describe('trimMessagesIfNeeded', () => {
  it('returns messages unchanged when under limit', () => {
    const messages = [
      { role: 'user', content: 'short message' },
      { role: 'assistant', content: 'short reply' },
    ];
    const { messages: result, trimmed } = trimMessagesIfNeeded(messages, 100);
    expect(trimmed).toBe(false);
    expect(result).toEqual(messages);
  });

  it('trims oldest messages when over limit', () => {
    // Create many messages that exceed the limit
    const messages = Array.from({ length: 100 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: 'x'.repeat(10000), // ~2500 tokens each
    }));
    const { messages: result, trimmed } = trimMessagesIfNeeded(messages, 100_000);
    expect(trimmed).toBe(true);
    expect(result.length).toBeLessThan(messages.length);
    expect(result.length).toBeGreaterThanOrEqual(4); // minKeep default
  });

  it('preserves at least minKeep messages', () => {
    const messages = Array.from({ length: 10 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: 'x'.repeat(100000),
    }));
    const { messages: result } = trimMessagesIfNeeded(messages, 140_000);
    expect(result.length).toBeGreaterThanOrEqual(4);
  });
});
