import { expect, it } from 'vitest';
import { actionFailure } from './action-failure';

it('keeps partial-completion context when adding a disk-space next step', () => {
  const error = new Error('Error invoking remote method: ENOSPC: no space left');
  const failure = actionFailure(
    error,
    'Recovery cleanup could not finish. Some files may already be in Trash. Refresh before retrying.',
  );
  expect(failure.message).toContain('Some files may already be in Trash');
  expect(failure.message).toContain('Make room on the drive');
  expect(failure.detail).toBe(error.message);
});

it('gives permission guidance without claiming a failed operation preserved everything', () => {
  const failure = actionFailure(
    new Error('EACCES: permission denied'),
    'Could not import the Garden. Check what was added before retrying.',
  );
  expect(failure.message).toContain('Check what was added');
  expect(failure.message).toContain('Check that you can write');
  expect(failure.message).not.toMatch(/everything.*preserved/i);
});
