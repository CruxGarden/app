import { expect, it } from 'vitest';
import { initServices, ensureLocalAuthor } from './index';
import { functionOwnerId } from './functions-runner';

it('recognizes the local legacy owner without treating another author as the owner', async () => {
  const services = await initServices();
  const person = await ensureLocalAuthor();
  const local = await services.crux.create({ title: 'Local desk' });
  expect(local.authorId).not.toBe(person.id);
  expect(await functionOwnerId(local.id)).toBe(person.id);
  const foreign = await services.crux.create({ title: 'Someone else', authorId: 'another-author' });
  expect(await functionOwnerId(foreign.id)).toBe('another-author');
});
