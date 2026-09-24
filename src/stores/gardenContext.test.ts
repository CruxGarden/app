import { beforeEach, expect, it } from 'vitest';
import { captureGardenId, gardenPath, inGarden, useGardenContext } from './gardenContext';
beforeEach(() => useGardenContext.setState({ root: null, garden: null, navigatorOpen: false }));
it('serializes the shallow Garden/Crux pair without losing Task or Growth selection', () => {
  useGardenContext
    .getState()
    .initialize({ id: 'root', title: 'Root', slug: 'root', kind: 'garden' });
  expect(inGarden('/c/project?task=task&growth=snapshot')).toBe(
    '/c/project?task=task&growth=snapshot&garden=root',
  );
  expect(inGarden(gardenPath('child'))).toBe('/home?garden=child');
  expect(inGarden('/plans')).toBe('/plans');
});
it('keeps a captured destination when the visible Garden changes', () => {
  useGardenContext
    .getState()
    .initialize({ id: 'root', title: 'Root', slug: 'root', kind: 'garden' });
  const captured = captureGardenId();
  useGardenContext
    .getState()
    .select({ id: 'child', title: 'Child', slug: 'child', kind: 'garden' });
  expect(inGarden('/c/new', captured)).toBe('/c/new?garden=root');
  expect(inGarden('/home')).toBe('/home?garden=child');
});
