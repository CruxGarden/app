import { expect, it } from 'vitest';
import { verdictFor, LANDING_DONE_REPLY, LANDING_FIXED_REPLY, LANDING_MISSING } from './mock-model';

it('keeps the scripted landing-page failure confined to its own completion claim', () => {
  expect(
    verdictFor('Filled separate image regions; the native selection is ready for you.'),
  ).toEqual({ ok: true, problems: [] });
  expect(verdictFor(LANDING_DONE_REPLY)).toEqual({ ok: false, problems: [LANDING_MISSING] });
  expect(verdictFor(LANDING_FIXED_REPLY)).toEqual({ ok: true, problems: [] });
  expect(verdictFor(LANDING_DONE_REPLY + '\n' + LANDING_FIXED_REPLY)).toEqual({
    ok: true,
    problems: [],
  });
});
