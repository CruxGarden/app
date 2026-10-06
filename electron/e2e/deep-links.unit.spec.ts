import { test, expect } from '@playwright/test';
import {
  DEEP_LINK_MAX_LENGTH,
  deepLinkArguments,
  deepLinkUrl,
  isDeepLink,
  parseDeepLink,
  type DeepLink,
} from '../src/deep-link-grammar';
import { DeepLinkInbox } from '../src/deep-link-inbox';
import { readLaunchSettings } from '../src/launch-settings';

/** crux-garden:// links (ADR 0085): the grammar, the queue and who may register. */
const ID = '0b6a1c7e-2f4d-4c1a-9e3b-5d8f7a6c4b21';

const accepted: [string, DeepLink][] = [
  ['crux-garden://billing/return?status=success', { kind: 'billing-return', status: 'success' }],
  ['crux-garden://billing/return?status=cancel', { kind: 'billing-return', status: 'cancel' }],
  [
    'crux-garden://billing/return?status=success&session_id=cs_test_a1B2_c3',
    { kind: 'billing-return', status: 'success', sessionId: 'cs_test_a1B2_c3' },
  ],
  [
    'crux-garden://billing/return?session_id=cs_live_X&status=cancel',
    { kind: 'billing-return', status: 'cancel', sessionId: 'cs_live_X' },
  ],
  [`crux-garden://install/tool/${ID}`, { kind: 'install', type: 'tool', cruxId: ID }],
  [`crux-garden://install/mood/${ID}`, { kind: 'install', type: 'mood', cruxId: ID }],
  [`crux-garden://open/crux/${ID}`, { kind: 'open-crux', cruxId: ID }],
  // One trailing slash (Windows, some browsers) is tolerated, before any query.
  [`crux-garden://install/tool/${ID}/`, { kind: 'install', type: 'tool', cruxId: ID }],
  [`crux-garden://open/crux/${ID}/`, { kind: 'open-crux', cruxId: ID }],
  ['crux-garden://billing/return/?status=cancel', { kind: 'billing-return', status: 'cancel' }],
  // The scheme is case-insensitive and ids are normalised to lower case.
  [`CRUX-GARDEN://open/crux/${ID.toUpperCase()}`, { kind: 'open-crux', cruxId: ID }],
];

const refused: [string, unknown][] = [
  ['not a string', 42],
  ['empty', ''],
  ['overlong', `crux-garden://open/crux/${ID}?${'a'.repeat(DEEP_LINK_MAX_LENGTH)}`],
  ['other scheme', `cruxgarden://open/crux/${ID}`],
  ['web url', `https://crux.garden/install/tool/${ID}`],
  ['file url', 'file:///etc/passwd'],
  ['javascript', 'javascript:alert(1)'],
  ['no route', 'crux-garden://'],
  ['unknown route', `crux-garden://clone/${ID}`],
  ['unknown install type', `crux-garden://install/theme/${ID}`],
  ['wrong uuid', 'crux-garden://open/crux/not-a-uuid'],
  ['short uuid', 'crux-garden://open/crux/0b6a1c7e-2f4d-4c1a-9e3b-5d8f7a6c4b2'],
  ['uuid with junk', `crux-garden://open/crux/${ID}x`],
  ['extra segment', `crux-garden://open/crux/${ID}/files`],
  ['two trailing slashes', `crux-garden://install/tool/${ID}//`],
  ['trailing slash on the scheme only', 'crux-garden:///'],
  ['trailing slash after query', 'crux-garden://billing/return?status=success/'],
  ['slash then extra segment', `crux-garden://open/crux/${ID}/x/`],
  ['double slash', `crux-garden://install//tool/${ID}`],
  ['leading slash', `crux-garden:///open/crux/${ID}`],
  ['dot segments', `crux-garden://open/crux/../../${ID}`],
  ['percent-encoding', `crux-garden://open/crux/%2e%2e%2f${ID}`],
  ['backslash', `crux-garden://open\\crux\\${ID}`],
  ['whitespace', `crux-garden://open/crux/ ${ID}`],
  ['newline injection', `crux-garden://open/crux/${ID}\nrm -rf`],
  ['fragment', `crux-garden://open/crux/${ID}#x`],
  ['userinfo', `crux-garden://evil@open/crux/${ID}`],
  ['port', `crux-garden://open:80/crux/${ID}`],
  ['query on install', `crux-garden://install/tool/${ID}?silent=1`],
  ['empty query on open', `crux-garden://open/crux/${ID}?`],
  ['billing without status', 'crux-garden://billing/return'],
  ['billing empty query', 'crux-garden://billing/return?'],
  ['billing bad status', 'crux-garden://billing/return?status=paid'],
  ['billing repeated status', 'crux-garden://billing/return?status=success&status=cancel'],
  ['billing unknown field', 'crux-garden://billing/return?status=success&next=https://x'],
  ['billing junk pair', 'crux-garden://billing/return?status=success&&'],
  ['billing double equals', 'crux-garden://billing/return?status=success=1'],
  ['billing two queries', 'crux-garden://billing/return?status=success?status=cancel'],
  ['session id not cs_', 'crux-garden://billing/return?status=success&session_id=pi_123'],
  ['session id symbols', 'crux-garden://billing/return?status=success&session_id=cs_a-b'],
  [
    'session id overlong',
    `crux-garden://billing/return?status=success&session_id=cs_${'a'.repeat(300)}`,
  ],
  ['billing extra segment', 'crux-garden://billing/return/x?status=success'],
];

test.describe('the link grammar', () => {
  for (const [raw, link] of accepted)
    test(`accepts ${raw}`, () => {
      expect(parseDeepLink(raw)).toEqual({ ok: true, link });
    });

  for (const [name, raw] of refused)
    test(`refuses ${name}`, () => {
      const parsed = parseDeepLink(raw);
      expect(parsed.ok).toBe(false);
      // A refusal never echoes the input.
      if (!parsed.ok && typeof raw === 'string' && raw.length > 3)
        expect(parsed.reason).not.toContain(raw);
    });

  test('built links round-trip and only exact payloads pass the guard', () => {
    for (const [, link] of accepted) {
      expect(parseDeepLink(deepLinkUrl(link))).toEqual({ ok: true, link });
      expect(isDeepLink(link)).toBe(true);
    }
    expect(() => deepLinkUrl({ kind: 'open-crux', cruxId: 'x?y' })).toThrow();
    expect(() =>
      deepLinkUrl({ kind: 'billing-return', status: 'success&x=1' as 'success' }),
    ).toThrow();
    expect(isDeepLink({ kind: 'open-crux', cruxId: ID, extra: 1 })).toBe(false);
    expect(isDeepLink({ kind: 'open-crux', cruxId: ID.toUpperCase() })).toBe(false);
    expect(isDeepLink(null)).toBe(false);
    expect(isDeepLink([])).toBe(false);
  });

  test('argv candidates are only arguments that start with the scheme', () => {
    expect(
      deepLinkArguments([
        '--flag',
        `crux-garden://open/crux/${ID}`,
        'project.crux',
        `Crux-Garden:junk`,
        'x crux-garden://',
      ]),
    ).toEqual([`crux-garden://open/crux/${ID}`, 'Crux-Garden:junk']);
  });
});

test.describe('the main-process inbox', () => {
  const open: DeepLink = { kind: 'open-crux', cruxId: ID };
  const billing: DeepLink = { kind: 'billing-return', status: 'success' };

  test('queues links that arrive before anyone listens and delivers them once, in order', () => {
    const log: string[] = [];
    const inbox = new DeepLinkInbox((message) => log.push(message));
    expect(inbox.receive(`crux-garden://open/crux/${ID}`)).toEqual(open);
    expect(inbox.receive('crux-garden://billing/return?status=success')).toEqual(billing);
    expect(inbox.receive(`crux-garden://open/crux/${ID}`)).toEqual(open); // duplicate
    expect(inbox.receive('file:///etc/passwd')).toBeNull();
    expect(inbox.pending()).toEqual([open, billing]);
    expect(log.some((line) => line.includes('/etc/passwd'))).toBe(false);

    const delivered: DeepLink[] = [];
    inbox.listen((link) => (delivered.push(link), true));
    expect(delivered).toEqual([open, billing]);
    expect(inbox.pending()).toEqual([]);

    // While listening, a new link goes straight through.
    inbox.receive(`crux-garden://install/mood/${ID}`);
    expect(delivered).toHaveLength(3);
    expect(inbox.pending()).toEqual([]);
  });

  test('a failed delivery waits for the next listener; detach stops delivery', () => {
    const inbox = new DeepLinkInbox();
    inbox.listen(() => false); // window gone
    inbox.receive(`crux-garden://open/crux/${ID}`);
    expect(inbox.pending()).toEqual([open]);

    const delivered: DeepLink[] = [];
    inbox.listen((link) => (delivered.push(link), true));
    expect(delivered).toEqual([open]);
    inbox.detach();
    inbox.receive('crux-garden://billing/return?status=cancel');
    expect(delivered).toHaveLength(1);
    expect(inbox.pending()).toEqual([{ kind: 'billing-return', status: 'cancel' }]);
    const thrower = new DeepLinkInbox();
    thrower.listen(() => {
      throw new Error('renderer gone');
    });
    thrower.receive(`crux-garden://open/crux/${ID}`);
    expect(thrower.pending()).toEqual([open]);
  });

  test('a burst keeps only the newest links', () => {
    const inbox = new DeepLinkInbox();
    const ids = Array.from(
      { length: 12 },
      (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    );
    for (const id of ids) inbox.receive(`crux-garden://open/crux/${id}`);
    expect(inbox.pending().map((link) => (link as { cruxId: string }).cruxId)).toEqual(
      ids.slice(-8),
    );
  });
});

test('only an installed build on the real profile registers the scheme', () => {
  expect(readLaunchSettings(true, {}).registerProtocol).toBe(true);
  expect(readLaunchSettings(true, { CRUX_TEST_PROFILE: '/tmp/crux-p' }).registerProtocol).toBe(
    false,
  );
  expect(readLaunchSettings(false, {}).registerProtocol).toBe(false);
  expect(readLaunchSettings(false, { CRUX_TEST_PROFILE: '/tmp/crux-p' }).registerProtocol).toBe(
    false,
  );
});
