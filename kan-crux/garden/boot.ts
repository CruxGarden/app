import '../apps/web/src/utils/i18n';
import { startGarden } from './bridge.js';
import { installState, embedded } from './state';
async function boot() {
  if (embedded) installState(await startGarden());
  await import('./app');
}
void boot().catch((error) => {
  const root = document.getElementById('root');
  if (root) root.textContent = error instanceof Error ? error.message : String(error);
});
