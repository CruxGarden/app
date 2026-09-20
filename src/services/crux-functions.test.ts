import { describe, it, expect } from 'vitest';
import { handlerSource, egressAllowed } from './crux-functions';
import { normalizeSchedule, cronError } from './cron';

describe('Crux Functions — When → Then', () => {
  it('writes an event handler, with a match when the pattern is wider than the name', () => {
    const src = handlerSource({ event: 'store', match: 'store:*', then: { kind: 'log' } });
    expect(src).toContain('export const match = "store:*";');
    expect(src).toContain('functions/on-store.js');
  });
  it('writes a scheduled handler: export const schedule, the file named for the handler', () => {
    const src = handlerSource({
      event: 'digest',
      schedule: 'every 10m',
      then: { kind: 'store', key: 'last-digest', value: 'event' },
    });
    expect(src).toContain('functions/digest.js');
    expect(src).toContain('export const schedule = "every 10m";');
    expect(src).not.toContain('export const match');
    expect(src).toContain('ctx.store.set("last-digest", ctx.event.data, \'public\')');
  });
  it('reads the every form and refuses what the clock cannot do', () => {
    expect(normalizeSchedule('every 10m')).toBe('*/10 * * * *');
    expect(normalizeSchedule('every 2 hours')).toBe('0 */2 * * *');
    expect(normalizeSchedule('every 1d')).toBe('0 0 */1 * *');
    expect(normalizeSchedule('0 9 * * mon')).toBe('0 9 * * mon');
    expect(cronError('every 90m')).toMatch(/minutes go up to 59/);
    expect(cronError('every 10m')).toBeNull();
    expect(cronError('nope')).toMatch(/five/);
  });
  it('lets ctx.fetch out only to listed hosts, with a wildcard for subdomains', () => {
    const allow = ['api.example.com', '*.stripe.com'];
    expect(egressAllowed('api.example.com', allow)).toBe(true);
    expect(egressAllowed('API.EXAMPLE.COM', allow)).toBe(true);
    expect(egressAllowed('stripe.com', allow)).toBe(true);
    expect(egressAllowed('api.stripe.com', allow)).toBe(true);
    expect(egressAllowed('evil.example.org', allow)).toBe(false);
    expect(egressAllowed('anything', [])).toBe(false);
  });
});
