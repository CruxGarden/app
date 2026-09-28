import { describe, expect, it } from 'vitest';
import { inferStartingPoint, nameFromIdea } from './infer-starting-point';

const entries = [
  {
    id: 'blank',
    label: 'Blank',
    description: 'Start with your own idea — no files or setup to choose',
  },
  {
    id: 'notes',
    label: 'Notes',
    description: 'A local Markdown notebook you can customize and publish',
  },
  { id: 'astro-blog', label: 'Blog', description: 'Posts with tags and an RSS feed' },
  {
    id: 'astro-recipes',
    label: 'Recipes',
    description: 'A cookbook site: recipes with ingredients',
  },
  { id: 'resume', label: 'Résumé', description: 'A one-page CV site' },
  { id: 'photo-gallery', label: 'Photo gallery', description: 'Albums of pictures' },
  { id: 'piskel-app', label: 'Piskel', description: 'Pixel art and animated sprites' },
  { id: 'pptist-app', label: 'Slides', description: 'Presentations with PPTist' },
];

describe('inferStartingPoint', () => {
  it('picks the starting point the idea names', () => {
    expect(inferStartingPoint('a blog about my garden', entries)).toBe('astro-blog');
    expect(inferStartingPoint('Grandma’s recipes', entries)).toBe('astro-recipes');
    expect(inferStartingPoint('pixel art sprites for my game', entries)).toBe('piskel-app');
  });
  it('understands everyday words for the same thing', () => {
    expect(inferStartingPoint('my CV', entries)).toBe('resume');
    expect(inferStartingPoint('a presentation for Monday', entries)).toBe('pptist-app');
    expect(inferStartingPoint('a journal', entries)).toBe('notes');
  });
  it('keeps Blank when the idea says nothing about a kind', () => {
    expect(inferStartingPoint('', entries)).toBeNull();
    expect(inferStartingPoint('something wonderful', entries)).toBeNull();
    expect(inferStartingPoint('make a thing', entries)).toBeNull();
  });
});

describe('nameFromIdea', () => {
  it('turns the idea into a short name', () => {
    expect(nameFromIdea('a tiny game about frogs')).toBe('Tiny game about frogs');
    expect(nameFromIdea('I want to make a blog about my garden.')).toBe('Blog about my garden');
    expect(nameFromIdea('make me a reading list')).toBe('Reading list');
  });
  it('keeps it short and leaves nothing when there is nothing', () => {
    expect(nameFromIdea('   ')).toBe('');
    expect(nameFromIdea('a site for the neighbourhood allotment association and its members')).toBe(
      'Site for the neighbourhood allotment association',
    );
  });
});
