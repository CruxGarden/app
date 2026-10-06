import { expect, it, vi } from 'vitest';

// Git's Windows checkout changes text to CRLF before Vite's raw imports.
// Exercise registry initialization: a parse error here prevents the whole UI boot.
vi.mock('./5ws.md?raw', () => ({
  default: '# Skill: 5ws\r\nUse when: planning a project.\r\n\r\nAsk the five questions.\r\n',
}));
vi.mock('./keeper/tour.md?raw', () => ({
  default: '# Skill: tour\r\nUse when: giving a tour.\r\n\r\nWelcome to the Garden.\r\n',
}));
import { getSkill } from './index';

it('loads CRLF Crux and Keeper skills with the same text as an LF checkout', () => {
  expect(getSkill('5ws')).toEqual({
    name: '5ws',
    summary: 'planning a project.',
    text: '# Skill: 5ws\nUse when: planning a project.\n\nAsk the five questions.',
  });
  expect(getSkill('tour')?.summary).toBe('giving a tour.');
  expect(getSkill('tour')?.text).not.toContain('\r');
});
