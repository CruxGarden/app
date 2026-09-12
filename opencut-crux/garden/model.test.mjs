import { test } from "node:test";
import assert from "node:assert/strict";
import { validateProject } from "./model.js";
const state = { route: "#/editor/project-1", preferences: { theme: "dark" } };
const document = (project) => ({ version: 1, app: "opencut", project });
test("preserves native records and separately identified original bytes", () => {
	const doc = document({
		state,
		'record-["projects","projects","project-1"]': {
			id: "project-1",
			scenes: [],
		},
		'file-["media","clip"]': {
			bytes: new Uint8Array([0, 1, 255]),
			type: "video/mp4",
		},
		'info-["media","clip"]': { name: "clip.mp4", lastModified: 1 },
	});
	assert.doesNotThrow(() => validateProject(doc));
	delete doc.project['info-["media","clip"]'];
	assert.throws(() => validateProject(doc), /information/);
});
test("rejects broken identities, external content references and invalid preference types", () => {
	const ref = {
		__cruxBinary: {
			path: "assets/" + "a".repeat(64) + ".bin",
			kind: "buffer",
			type: "application/json",
			size: 100,
		},
	};
	assert.doesNotThrow(() => validateProject(document({ state: ref })));
	assert.throws(
		() =>
			validateProject(
				document({ state: { ...state, preferences: { theme: false } } }),
			),
		/preferences/,
	);
	assert.throws(
		() => validateProject(document({ state, 'record-["db"]': {} })),
		/identity/,
	);
	assert.throws(
		() =>
			validateProject(
				document({
					state: {
						__cruxBinary: {
							...ref.__cruxBinary,
							path: "https://example.com/file",
						},
					},
				}),
			),
		/reference/,
	);
	assert.throws(
		() =>
			validateProject(
				document({ state: { ...state, route: "#/../../other" } }),
			),
		/preferences/,
	);
});
