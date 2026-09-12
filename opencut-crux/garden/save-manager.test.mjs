import { test } from "node:test";
import assert from "node:assert/strict";
import { SaveManager } from "../apps/web/src/core/managers/save-manager.ts";
function fixture(saveCurrentProject) {
	return new SaveManager({
		editor: {
			project: {
				getActive: () => ({}),
				getIsLoading: () => false,
				getMigrationState: () => ({ isMigrating: false }),
				saveCurrentProject,
			},
		},
		debounceMs: 60000,
	});
}
test("failed serialization stays dirty and a successful explicit retry clears the failure", async () => {
	let fail = true,
		calls = 0;
	const manager = fixture(async () => {
		calls++;
		if (fail) throw Error("Serialization failed");
	});
	manager.markDirty();
	await assert.rejects(manager.flush(), /Serialization failed/);
	assert.equal(manager.getIsDirty(), true);
	assert.match(String(manager.getError()), /Serialization failed/);
	fail = false;
	await manager.flush();
	assert.equal(manager.getIsDirty(), false);
	assert.equal(manager.getError(), null);
	assert.equal(calls, 2);
	manager.stop();
});
test("a flush during another save waits and preserves edits queued during that save", async () => {
	let release,
		calls = 0;
	const manager = fixture(async () => {
		calls++;
		if (calls === 1)
			await new Promise((resolve) => {
				release = resolve;
			});
	});
	manager.markDirty();
	const first = manager.flush();
	manager.markDirty();
	let acknowledged = false;
	const second = manager.flush().then(() => {
		acknowledged = true;
	});
	await new Promise((resolve) => setTimeout(resolve, 5));
	assert.equal(acknowledged, false);
	release();
	await Promise.all([first, second]);
	assert.equal(calls, 2);
	assert.equal(manager.getIsDirty(), false);
	manager.stop();
});
