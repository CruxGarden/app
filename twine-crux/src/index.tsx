import {startGarden} from '../garden/bridge.js';
import {installStorage, validateState} from '../garden/model.js';
async function start() {
	const garden = await startGarden();
	if (garden.initial) validateState(garden.initial);
	window.gardenTwine = {
		garden,
		pending: new Set(),
		captureStorage: installStorage(garden.initial, garden.changed)
	};
	await import('./native-entry');
}
start().catch(error => {
	const status = document.querySelector('#garden-project [role=status]');
	if (status) status.textContent = error.message;
});
