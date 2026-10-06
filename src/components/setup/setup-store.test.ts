import { beforeEach, describe, expect, it } from 'vitest';
import { growthStage, useSetupWizard } from './setup-store';

const start = () =>
  useSetupWizard.getState().begin({ mode: 'first', aiAtStart: null, moodAtStart: 'plasma' });

describe('Setup wizard state', () => {
  beforeEach(() => useSetupWizard.getState().reset());

  it('walks the five steps forward and back', () => {
    start();
    const s = () => useSetupWizard.getState();
    const seen = [s().step];
    for (let i = 0; i < 5; i++) {
      s().next();
      seen.push(s().step);
    }
    expect(seen).toEqual(['need', 'garden', 'ai', 'mood', 'crux', 'crux']);
    s().back();
    s().back();
    expect(s().step).toBe('ai');
  });

  it('Back never loses a choice', () => {
    start();
    const s = () => useSetupWizard.getState();
    s().set({ need: 'website' });
    s().next();
    s().set({ gardenName: 'Moss Hollow', username: 'river' });
    s().next();
    s().set({ noAi: true });
    s().next();
    s().set({ moodId: 'parchment' });
    s().back();
    s().back();
    expect(s().step).toBe('garden');
    expect(s()).toMatchObject({
      need: 'website',
      gardenName: 'Moss Hollow',
      username: 'river',
      noAi: true,
      moodId: 'parchment',
    });
  });

  it('a second begin in the same mode resumes rather than starting over', () => {
    start();
    useSetupWizard.getState().set({ gardenName: 'Kept', step: 'mood' });
    start();
    expect(useSetupWizard.getState()).toMatchObject({ gardenName: 'Kept', step: 'mood' });
  });

  it('running again starts from today’s choices and still ends at the summary', () => {
    useSetupWizard.getState().begin({
      mode: 'again',
      need: 'music',
      gardenName: 'Studio',
      username: 'river',
      aiAtStart: 'false',
      moodAtStart: 'night-city',
    });
    const s = () => useSetupWizard.getState();
    expect(s()).toMatchObject({
      need: 'music',
      gardenName: 'Studio',
      username: 'river',
      noAi: true,
      moodId: null,
      wantsCrux: false,
    });
    s().goTo('mood');
    s().next();
    expect(s().step).toBe('crux');
  });

  it('Edit from the summary returns to it on Continue', () => {
    start();
    const s = () => useSetupWizard.getState();
    s().goTo('crux');
    s().goTo('garden');
    expect(s().returnToSummary).toBe(true);
    s().next();
    expect(s().step).toBe('crux');
    expect(s().returnToSummary).toBe(false);
  });

  it('the garden grows a stage per step and blooms when planted', () => {
    start();
    const s = () => useSetupWizard.getState();
    const stages = [growthStage(s())];
    for (let i = 0; i < 4; i++) {
      s().next();
      stages.push(growthStage(s()));
    }
    s().set({ planted: true });
    stages.push(growthStage(s()));
    expect(stages).toEqual([0, 1, 2, 3, 4, 5]);
  });
});
