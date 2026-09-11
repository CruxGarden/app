import "fake-indexeddb/auto";
import { expect, test } from "bun:test";
// Storage is the browser API observed by the adapter, not an app-specific model.
class TestStorage {
	getItem(key: string) {
		return Object.hasOwn(this, key) ? (this as any)[key] : null;
	}
	setItem(key: string, value: string) {
		Object.defineProperty(this, key, {
			value: String(value),
			writable: true,
			configurable: true,
			enumerable: true,
		});
	}
	removeItem(key: string) {
		delete (this as any)[key];
	}
}
Object.assign(globalThis, {
	Storage: TestStorage,
	localStorage: new TestStorage(),
});
const { hydrateNative, captureNative, observeStorage } =
	await import("./storage");
test("round trips native media, audio, fonts, settings and timelines, excludes proxy cache, refuses failed transactions", async () => {
	const assets = new Map<string, ArrayBuffer>();
	let imports = 0;
	let active = 0,
		peak = 0;
	async function call(request: any) {
		active++;
		peak = Math.max(peak, active);
		await Bun.sleep(1);
		active--;
		if (request.op === "native-import") {
			const hash = new Bun.CryptoHasher("sha256")
				.update(request.bytes)
				.digest("hex");
			const path = `assets/${hash}.bin`;
			assets.set(path, request.bytes);
			imports++;
			return { path };
		}
		return { bytes: assets.get(request.path)!.slice(0) };
	}
	await hydrateNative(
		{ version: 1, app: "openmosh", local: {}, databases: {} },
		call,
	);
	observeStorage(() => {});
	async function put(name: string, store: string, rows: any[]) {
		const db = await new Promise<IDBDatabase>((resolve, reject) => {
			const request = indexedDB.open(name);
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		await new Promise<void>((resolve, reject) => {
			const tx = db.transaction(store, "readwrite");
			for (const row of rows) tx.objectStore(store).put(row);
			tx.oncomplete = () => resolve();
			tx.onabort = () => reject(tx.error);
		});
		db.close();
	}
	const video = new File(["original video"], "clip.webm", {
		type: "video/webm",
		lastModified: 42,
	});
	await put("openmosh-sequence-media", "media", [
		{ id: "v", name: video.name, blob: video, type: video.type, addedAt: 1 },
	]);
	await put("openmosh-sequence-media", "media", [
		{
			id: "w",
			name: "still.png",
			blob: new Blob(["still"], { type: "image/png" }),
			type: "image/png",
			addedAt: 1,
		},
	]);
	await put("openmosh-sequence-media", "timelines", [
		{
			key: "sequence:v",
			state: { segments: [{ sourceId: "v", start: 0, end: 2 }], bpm: 110 },
		},
	]);
	await put("openmosh-sequence-media", "proxies", [
		{ id: "v", blob: new Blob(["derived"]) },
	]);
	await put("openmosh-tracks", "tracks", [
		{
			id: "song",
			name: "music.wav",
			blob: new Blob(["audio"], { type: "audio/wav" }),
			addedAt: 1,
		},
	]);
	await put("openmosh-fonts", "fonts", [
		{
			id: "font",
			family: "Custom",
			data: new TextEncoder().encode("font").buffer,
		},
	]);
	localStorage.setItem("openmosh-settings", '{"mode":"sequence"}');
	localStorage.setItem("another-app", "private");
	const saved = await captureNative(call);
	expect(saved.local).toEqual({ "openmosh-settings": '{"mode":"sequence"}' });
	expect(saved.databases["openmosh-sequence-media"]!.proxies).toBeUndefined();
	expect(imports).toBe(4);
	expect(
		saved.databases["openmosh-sequence-media"]!.media![0].blob.__cruxBinary
			.lastModified,
	).toBe(42);
	await captureNative(call);
	expect(imports).toBe(4);
	await hydrateNative(saved, call);
	expect(await captureNative(call)).toEqual(saved);
	expect(peak).toBe(1);
	expect(localStorage.getItem("another-app")).toBe("private");
	const bad = structuredClone(saved);
	bad.databases["openmosh-sequence-media"]!.media![0].blob.__cruxBinary.path =
		"../escape";
	await expect(hydrateNative(bad, call)).rejects.toThrow(
		"Invalid project media path",
	);
	const db = await new Promise<IDBDatabase>((resolve) => {
		const req = indexedDB.open("openmosh-tracks");
		req.onsuccess = () => resolve(req.result);
	});
	const tx = db.transaction("tracks", "readwrite");
	tx.abort();
	await expect(captureNative(call)).rejects.toThrow("storage write failed");
	db.close();
});
