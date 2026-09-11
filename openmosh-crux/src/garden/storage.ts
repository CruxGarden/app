/** Garden persistence for OpenMosh's own IndexedDB records and settings. */
export const databases: Record<
	string,
	{ version: number; stores: Record<string, string> }
> = {
	"openmosh-sequence-media": {
		version: 5,
		stores: {
			media: "id",
			pools: "key",
			sessions: "key",
			timelines: "key",
			proxies: "id",
		},
	},
	"openmosh-tracks": { version: 1, stores: { tracks: "id" } },
	"openmosh-fonts": { version: 1, stores: { fonts: "id" } },
};
export type NativeDocument = {
	version: 1;
	app: "openmosh";
	local: Record<string, string>;
	databases: Record<string, Record<string, any[]>>;
};
type Call = (request: Record<string, unknown>) => Promise<any>;
const binaryCache = new WeakMap<object, any>();
const written = new Map<string, any>();
const pending = new Set<Promise<void>>();
let storageError: Error | null = null;
let changed: () => void = () => {};
const originals = {
	transaction: IDBDatabase.prototype.transaction,
	put: IDBObjectStore.prototype.put,
	add: IDBObjectStore.prototype.add,
	remove: Storage.prototype.removeItem,
	set: Storage.prototype.setItem,
};
function keyOf(db: string, store: string, key: unknown) {
	return JSON.stringify([db, store, key]);
}
function retainedClone(value: any): any {
	if (value instanceof Blob) return value;
	if (value instanceof ArrayBuffer) return value.slice(0);
	if (Array.isArray(value)) return value.map(retainedClone);
	if (value && typeof value === "object")
		return Object.fromEntries(
			Object.entries(value).map(([k, v]) => [k, retainedClone(v)]),
		);
	return value;
}
export function observeStorage(onChange: () => void) {
	changed = onChange;
	IDBDatabase.prototype.transaction = function (
		this: IDBDatabase,
		...args: any[]
	) {
		const tx = (originals.transaction as any).apply(
			this,
			args,
		) as IDBTransaction;
		if (Object.hasOwn(databases, this.name) && args[1] === "readwrite") {
			let done!: () => void;
			const wait = new Promise<void>((resolve) => {
				done = resolve;
			});
			pending.add(wait);
			tx.addEventListener(
				"complete",
				() => {
					pending.delete(wait);
					done();
					changed();
				},
				{ once: true },
			);
			tx.addEventListener(
				"abort",
				() => {
					storageError = tx.error ?? new Error("OpenMosh storage write failed");
					pending.delete(wait);
					done();
					changed();
				},
				{ once: true },
			);
		}
		return tx;
	} as typeof IDBDatabase.prototype.transaction;
	for (const method of ["put", "add"] as const) {
		IDBObjectStore.prototype[method] = function (
			value: any,
			key?: IDBValidKey,
		) {
			if (Object.hasOwn(databases, this.transaction.db.name)) {
				const id = key ?? value[this.keyPath as string];
				written.set(
					keyOf(this.transaction.db.name, this.name, id),
					retainedClone(value),
				);
			}
			return originals[method].call(
				this,
				value,
				...(key === undefined ? [] : [key]),
			);
		};
	}
	Storage.prototype.setItem = function (key: string, value: string) {
		const previous = this.getItem(key);
		originals.set.call(this, key, value);
		if (
			this === localStorage &&
			key.startsWith("openmosh") &&
			previous !== String(value)
		)
			changed();
	};
	Storage.prototype.removeItem = function (key: string) {
		const previous = this.getItem(key);
		originals.remove.call(this, key);
		if (
			this === localStorage &&
			key.startsWith("openmosh") &&
			previous !== null
		)
			changed();
	};
}
async function open(name: string) {
	const schema = databases[name]!;
	return new Promise<IDBDatabase>((resolve, reject) => {
		const request = indexedDB.open(name, schema.version);
		request.onupgradeneeded = () => {
			for (const [store, keyPath] of Object.entries(schema.stores))
				if (!request.result.objectStoreNames.contains(store))
					request.result.createObjectStore(store, { keyPath });
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
		request.onblocked = () =>
			reject(
				new Error(
					"Close another OpenMosh instance before reloading this project.",
				),
			);
	});
}
export async function drainWrites() {
	while (pending.size) await Promise.all([...pending]);
	if (storageError) throw storageError;
}
async function encode(value: any, call: Call): Promise<any> {
	if (value instanceof Blob || value instanceof ArrayBuffer) {
		const cached = binaryCache.get(value);
		if (cached) return cached;
		const blob = value instanceof Blob ? value : new Blob([value]);
		const type = blob.type || "application/octet-stream";
		const imported = await call({
			op: "native-import",
			bytes: await blob.arrayBuffer(),
			mimeType: type,
		});
		const ref = {
			__cruxBinary: {
				path: imported.path,
				type,
				size: blob.size,
				kind:
					value instanceof File
						? "file"
						: value instanceof Blob
							? "blob"
							: "buffer",
				...(value instanceof File
					? { name: value.name, lastModified: value.lastModified }
					: {}),
			},
		};
		binaryCache.set(value, ref);
		return ref;
	}
	// Keep transport buffers bounded to one original, even for many videos.
	if (Array.isArray(value)) {
		const result = [];
		for (const item of value) result.push(await encode(item, call));
		return result;
	}
	if (value && typeof value === "object") {
		const entries: [string, unknown][] = [];
		for (const [key, item] of Object.entries(value))
			entries.push([key, await encode(item, call)]);
		return Object.fromEntries(entries);
	}
	return value;
}
async function decode(value: any, call: Call): Promise<any> {
	if (value?.__cruxBinary) {
		const ref = value.__cruxBinary;
		if (!/^assets\/[a-f0-9]{64}\.bin$/.test(ref.path))
			throw new Error("Invalid project media path.");
		const { bytes } = await call({ op: "native-read", path: ref.path });
		if (!(bytes instanceof ArrayBuffer) || bytes.byteLength !== ref.size)
			throw new Error("The saved media is incomplete.");
		const data =
			ref.kind === "buffer"
				? bytes
				: ref.kind === "file"
					? new File([bytes], ref.name, {
							type: ref.type,
							lastModified: ref.lastModified,
						})
					: new Blob([bytes], { type: ref.type });
		binaryCache.set(data, value);
		return data;
	}
	// Keep transport buffers bounded to one original, even for many videos.
	if (Array.isArray(value)) {
		const result = [];
		for (const item of value) result.push(await decode(item, call));
		return result;
	}
	if (value && typeof value === "object") {
		const entries: [string, unknown][] = [];
		for (const [key, item] of Object.entries(value))
			entries.push([key, await decode(item, call)]);
		return Object.fromEntries(entries);
	}
	return value;
}
export async function hydrateNative(doc: NativeDocument, call: Call) {
	if (doc.version !== 1 || doc.app !== "openmosh")
		throw new Error("Choose an OpenMosh project.");
	for (const key of Object.keys(localStorage))
		if (key.startsWith("openmosh")) originals.remove.call(localStorage, key);
	for (const [key, value] of Object.entries(doc.local))
		if (key.startsWith("openmosh"))
			originals.set.call(localStorage, key, value);
	for (const [name, schema] of Object.entries(databases)) {
		const contents: Record<string, any[]> = {};
		for (const store of Object.keys(schema.stores))
			contents[store] = await decode(doc.databases[name]?.[store] ?? [], call);
		const db = await open(name);
		try {
			await new Promise<void>((resolve, reject) => {
				const tx = originals.transaction.call(
					db,
					Object.keys(schema.stores),
					"readwrite",
				);
				for (const [store, rows] of Object.entries(contents)) {
					const table = tx.objectStore(store);
					table.clear();
					for (const row of rows) {
						originals.put.call(table, row);
						written.set(keyOf(name, store, row[schema.stores[store]!]), row);
					}
				}
				tx.oncomplete = () => resolve();
				tx.onerror = () => reject(tx.error);
				tx.onabort = () => reject(tx.error);
			});
		} finally {
			db.close();
		}
	}
}
export async function captureNative(call: Call): Promise<NativeDocument> {
	await drainWrites();
	const document: NativeDocument = {
		version: 1,
		app: "openmosh",
		local: {},
		databases: {},
	};
	for (const key of Object.keys(localStorage).sort())
		if (key.startsWith("openmosh"))
			document.local[key] = localStorage.getItem(key)!;
	for (const [name, schema] of Object.entries(databases)) {
		const db = await open(name);
		const records: Record<string, any[]> = {};
		try {
			await new Promise<void>((resolve, reject) => {
				const stores = Object.keys(schema.stores).filter(
					(s) => s !== "proxies",
				);
				const tx = originals.transaction.call(db, stores, "readonly");
				for (const store of stores) {
					const req = tx.objectStore(store).getAll();
					req.onsuccess = () => {
						records[store] = req.result.map(
							(row) =>
								written.get(keyOf(name, store, row[schema.stores[store]!])) ??
								row,
						);
					};
				}
				tx.oncomplete = () => resolve();
				tx.onerror = () => reject(tx.error);
				tx.onabort = () => reject(tx.error);
			});
		} finally {
			db.close();
		}
		document.databases[name] = await encode(records, call);
	}
	return document;
}
