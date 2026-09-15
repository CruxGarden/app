import { expect, it } from 'vitest';
import { acknowledgeSavedProject } from './saved-state';
import {
  commitProjectHistoryChange,
  createDefaultProject,
  createProjectHistory,
  dirtyProjectSnapshot,
} from '../lib/projectModel';
it('preserves edits and their Undo history arriving while a save is awaiting acknowledgement', () => {
  const captured = createDefaultProject(() => 'screen');
  const history = commitProjectHistoryChange(
    createProjectHistory(captured),
    (project) => ({
      ...project,
      wireframes: project.wireframes.map((frame) => ({ ...frame, name: 'Newer manual title' })),
    }),
    {},
    null,
  ).history;
  const saved = { ...captured, name: 'project' };
  const result = acknowledgeSavedProject(history, captured, saved);
  expect(result.present.wireframes[0].name).toBe('Newer manual title');
  expect(result.past).toBe(history.past);
  expect(dirtyProjectSnapshot(result.present)).not.toBe(dirtyProjectSnapshot(saved));
});
it('applies the saved filename when no newer content exists', () => {
  const captured = createDefaultProject(() => 'screen');
  const saved = { ...captured, name: 'project' };
  expect(acknowledgeSavedProject(createProjectHistory(captured), captured, saved).present).toBe(
    saved,
  );
});
