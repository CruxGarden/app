import { startGarden } from './bridge.js';
import { installStorage, validateState } from './model.js';

async function start() {
  const garden = await startGarden();
  if (garden.initial) validateState(garden.initial);
  const storage = installStorage(garden.initial?.storage, garden.changed);
  const { mountEditor } = await import('../main.jsx');
  mountEditor(garden, storage);
}
start().catch((error) => {
  const status = document.querySelector('#garden-project [role=status]');
  if (status) status.textContent = error.message;
});
