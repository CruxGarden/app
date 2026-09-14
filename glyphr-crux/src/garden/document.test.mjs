import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateProject } from './document.js';

const gs2 = {
	settings: { project: { name: 'Moss Sans' }, font: { family: 'Moss Sans' } },
	glyphs: {},
};
test('accepts an empty Crux and a saved project', () => {
	validateProject({ version: 1, app: 'glyphr', project: null });
	validateProject({
		version: 1,
		app: 'glyphr',
		project: { name: 'Moss Sans', gs2, saved: '2026-09-14T00:00:00.000Z' },
	});
});
test('refuses other apps, extra fields, bad names, non-projects and bad times', () => {
	assert.throws(
		() => validateProject({ version: 1, app: 'p5', project: null }),
		/Invalid font project/
	);
	assert.throws(
		() => validateProject({ version: 1, app: 'glyphr', project: null, extra: 1 }),
		/Invalid font project/
	);
	assert.throws(
		() =>
			validateProject({
				version: 1,
				app: 'glyphr',
				project: { name: '', gs2, saved: '2026-09-14T00:00:00.000Z' },
			}),
		/Name the font/
	);
	assert.throws(
		() =>
			validateProject({
				version: 1,
				app: 'glyphr',
				project: { name: 'x', gs2: { glyphs: {} }, saved: '2026-09-14T00:00:00.000Z' },
			}),
		/not a Glyphr Studio project/
	);
	assert.throws(
		() =>
			validateProject({
				version: 1,
				app: 'glyphr',
				project: { name: 'x', gs2, saved: 'yesterday' },
			}),
		/save time/
	);
	assert.throws(
		() =>
			validateProject({
				version: 1,
				app: 'glyphr',
				project: { name: 'x', gs2, saved: '2026-09-14T00:00:00.000Z', other: 1 },
			}),
		/fields/
	);
});
