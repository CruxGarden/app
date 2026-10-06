import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, matchRoutes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CONTACT,
  LEGAL_DOCUMENTS,
  LEGAL_LAST_UPDATED,
  PRIVACY,
  TERMS,
  formatLegalDate,
} from './legal';
import {
  ISSUES_URL,
  LEGAL_PAGES,
  RESERVED_USERNAMES,
  contactTarget,
  isReservedUsername,
} from './site';
import Legal from '@/pages/Legal';

afterEach(() => vi.unstubAllEnvs());

describe('legal routes are reserved', () => {
  const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');

  it('/terms, /privacy and /contact outrank a garden address', () => {
    // The same shape as App.tsx: static pages beside `/:username`, garden first
    // in the list to show that order is not what decides it.
    const routes = [
      { id: 'garden', path: '/:username' },
      { id: 'creation', path: '/:username/:slug/*' },
      ...LEGAL_PAGES.map((page) => ({ id: page.path, path: page.path })),
    ];
    for (const { path } of LEGAL_PAGES) {
      expect(matchRoutes(routes, path)?.at(-1)?.route.id).toBe(path);
      expect(matchRoutes(routes, `${path}/`)?.at(-1)?.route.id).toBe(path);
    }
    expect(matchRoutes(routes, '/alice')?.at(-1)?.route.id).toBe('garden');
  });

  it('the app router registers every legal page and still has the garden route', () => {
    expect(app).toContain('...LEGAL_PAGES.map(({ path }) => ({');
    expect(app).toContain('<Legal page={path} />');
    expect(app).toContain("path: '/:username'");
  });

  it('no one can hold a username the website uses for its own pages', () => {
    for (const name of ['terms', 'privacy', 'contact', 'explore', 'plans', 'docs', 'billing'])
      expect(isReservedUsername(name)).toBe(true);
    expect(isReservedUsername('@Terms ')).toBe(true);
    expect(isReservedUsername('alice')).toBe(false);
    // Every static first segment in the router is on the list.
    const segments = [...app.matchAll(/path: '\/([a-z.]+)[/']/g)].map((match) => match[1]);
    expect(segments.length).toBeGreaterThan(4);
    for (const segment of segments) expect(RESERVED_USERNAMES).toContain(segment);
  });
});

describe('legal pages', () => {
  const page = (path: (typeof LEGAL_PAGES)[number]['path']) =>
    renderToStaticMarkup(
      createElement(MemoryRouter, { initialEntries: [path] }, createElement(Legal, { page: path })),
    );

  it('each page renders its title, summary, every section and the date', () => {
    for (const { path } of LEGAL_PAGES) {
      const html = page(path);
      const doc = LEGAL_DOCUMENTS[path];
      expect(html).toContain(`<h1`);
      expect(html).toContain(`>${doc.title}</h1>`);
      for (const section of doc.sections) expect(html).toContain(`>${section.heading}</h2>`);
      expect(html).toContain(`dateTime="${LEGAL_LAST_UPDATED}"`);
      expect(html).toContain(formatLegalDate(LEGAL_LAST_UPDATED));
      for (const other of LEGAL_PAGES) expect(html).toContain(`href="${other.path}"`);
    }
  });

  it('the date is a real day, written the same for everyone', () => {
    expect(LEGAL_LAST_UPDATED).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(formatLegalDate('2026-10-04')).toBe('4 October 2026');
  });

  it('states no address of its own: contact comes from the build', () => {
    const text = JSON.stringify([TERMS, PRIVACY, CONTACT]);
    expect(text).not.toMatch(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i);
    expect(text).not.toMatch(/\b(Inc\.|LLC|Ltd|GmbH)\b/);

    expect(contactTarget()).toEqual({ kind: 'issues', href: ISSUES_URL, label: 'GitHub issues' });
    expect(page('/contact')).toContain(`href="${ISSUES_URL}"`);

    vi.stubEnv('VITE_CONTACT_EMAIL', 'hello@example.invalid');
    expect(contactTarget()).toEqual({
      kind: 'email',
      href: 'mailto:hello@example.invalid',
      label: 'hello@example.invalid',
    });
    expect(page('/privacy')).toContain('href="mailto:hello@example.invalid"');

    vi.stubEnv('VITE_CONTACT_EMAIL', 'not an address');
    expect(contactTarget().kind).toBe('issues');
  });

  it('privacy says what the product does', () => {
    const text = JSON.stringify(PRIVACY);
    for (const fact of [
      /no usage analytics/i,
      /directly from your device to the provider/i,
      /ledger does not contain your conversation/i,
      /Stripe/,
      /same visitor, same day/,
      /Settings → Account/,
    ])
      expect(text).toMatch(fact);
    expect(JSON.stringify(TERMS)).toMatch(/MIT License/);
  });
});
