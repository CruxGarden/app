import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateProject, validateState, installStorage} from './model.js';
test('rejects unsafe record names and asset references', () => {
	validateState({'twine-passages-a': '{"text":"A passage"}'});
	assert.throws(() => validateState({'other-project': '{}'}));
	const ref = {
		__cruxBinary: {
			path: `assets/${'a'.repeat(64)}.bin`,
			kind: 'buffer',
			type: 'application/json',
			size: 20
		}
	};
	validateProject({
		version: 1,
		app: 'twine',
		project: {'twine-passages-a': ref}
	});
	assert.throws(() =>
		validateProject({
			version: 1,
			app: 'twine',
			project: {
				'twine-passages-a': {
					__cruxBinary: {...ref.__cruxBinary, path: '../private'}
				}
			}
		})
	);
});
test('isolates native story and preference storage between libraries', () => {
	global.window = {};
	let changes = 0;
	const capture = installStorage({'twine-stories': 'a'}, () => changes++);
	window.localStorage.setItem('twine-stories-a', '{"name":"First"}');
	window.localStorage.setItem('other', 'temporary');
	assert.equal(changes, 1);
	assert.deepEqual(capture(), {
		'twine-stories': 'a',
		'twine-stories-a': '{"name":"First"}'
	});
	installStorage({}, () => {});
	assert.equal(window.localStorage.getItem('twine-stories'), null);
	delete global.window;
});
