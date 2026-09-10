import { it, expect } from 'vitest';
import { createTaskSlots } from './task-slots';
it('queues within one Crux, leaves other Cruxes independent, and releases exactly once', async () => {
  const slots = createTaskSlots(() => 1);
  const signal = new AbortController().signal;
  const releaseA = await slots.acquire('a', signal);
  let started = false;
  const next = slots.acquire('a', signal).then((release) => {
    started = true;
    return release;
  });
  const releaseB = await slots.acquire('b', signal);
  expect(started).toBe(false);
  releaseA();
  releaseA();
  const releaseNext = await next;
  expect(started).toBe(true);
  expect(slots.busy('a')).toBe(true);
  releaseNext();
  releaseB();
  expect(slots.busy('a')).toBe(false);
});
it('stopping a waiting task removes it without consuming the next slot', async () => {
  const slots = createTaskSlots(() => 1);
  const controller = new AbortController();
  const release = await slots.acquire('a', new AbortController().signal);
  const waiting = slots.acquire('a', controller.signal);
  controller.abort();
  await expect(waiting).rejects.toThrow('Stopped');
  release();
  expect(slots.busy('a')).toBe(false);
});
