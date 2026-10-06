import { describe, it, expect } from 'vitest';
import { asName, paneLabelFrom, DEFAULT_PANE_LABELS } from './pane-labels';

describe('the garden names its panes and itself', () => {
  it('answers the default word until a token says otherwise', () => {
    expect(paneLabelFrom('collaboration', '')).toBe('Collaboration');
    expect(paneLabelFrom('collaboration', 'Interview room')).toBe('Interview room');
    expect(paneLabelFrom('artifacts', "'Case files'")).toBe('Case files');
    expect(paneLabelFrom('workshop', undefined)).toBe(DEFAULT_PANE_LABELS.workshop);
    expect(asName('Floyd County Police Department')).toBe('Floyd County Police Department');
  });

  it('treats none and blank as no name', () => {
    expect(paneLabelFrom('collaboration', 'none')).toBe('Collaboration');
    expect(asName('  ')).toBe('');
    expect(asName(null)).toBe('');
  });
});
