import { describe, expect, it } from 'vitest';
import { isForbidden, operatorAccess } from '@/api/admin';

describe('the operator screen (CR08)', () => {
  it('asks the API only for signed-in admins', () => {
    expect(operatorAccess(true, 'admin')).toBe('check');
    expect(operatorAccess(true, 'author')).toBe('denied');
    expect(operatorAccess(false, 'admin')).toBe('denied');
    expect(operatorAccess(true, undefined)).toBe('denied');
  });

  it('treats 401 and 403 as "Not available"', () => {
    expect(isForbidden({ response: { status: 403 } })).toBe(true);
    expect(isForbidden({ response: { status: 401 } })).toBe(true);
    expect(isForbidden({ response: { status: 500 } })).toBe(false);
    expect(isForbidden(new Error('network'))).toBe(false);
  });
});
