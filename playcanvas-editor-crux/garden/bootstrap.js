import { startGarden } from './bridge.js';
import { configure } from './config.js';
window.gardenSession = await startGarden();
window.config = configure(window.gardenSession.initial);
const script = document.createElement('script');
script.src = new URL('../js/editor.js', import.meta.url).href;
script.onerror = () => window.gardenSession.failed(Error('The local editor runtime is missing. Rebuild this Crux.'));
document.head.append(script);
