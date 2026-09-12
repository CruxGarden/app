/** Runtime adapters for native OpenCut serialization; Garden owns durable content. */
export const records = new Map<string, any>();
export const originals = new Map<string, { bytes: Uint8Array; type: string }>();
let preferences = new Map<string, string>();
let route = "";
let session: any;
let pendingFiles = 0;
export const keyFor = (prefix: string, parts: string[]) =>
	prefix + JSON.stringify(parts);
export const changed = () => session?.changed();
export const pendingOperations = () => pendingFiles;
export const flushGarden = () => session.flush();

export function installState(nextSession: any) {
	session = nextSession;
	const initial = session.initial;
	for (const [key, value] of Object.entries(initial || {})) {
		if (key.startsWith("file-")) originals.set(key, value as any);
		else if (key !== "state") records.set(key, value);
	}
	preferences = new Map(Object.entries(initial?.state?.preferences || {}));
	route = initial?.state?.route || "";
	const storage = {
		get length() {
			return preferences.size;
		},
		key(index: number) {
			return [...preferences.keys()][index] ?? null;
		},
		getItem(key: string) {
			return preferences.get(String(key)) ?? null;
		},
		setItem(key: string, value: string) {
			key = String(key);
			value = String(value);
			if (preferences.get(key) !== value) {
				preferences.set(key, value);
				changed();
			}
		},
		removeItem(key: string) {
			if (preferences.delete(String(key))) changed();
		},
		clear() {
			if (preferences.size) {
				preferences.clear();
				changed();
			}
		},
	};
	Object.defineProperty(window, "localStorage", {
		configurable: true,
		value: storage,
	});
	location.hash = route;
	addEventListener("hashchange", () => {
		if (route !== location.hash) {
			route = location.hash;
			changed();
		}
	});
}

export function captureState() {
	return Object.fromEntries([
		[
			"state",
			{ route: location.hash, preferences: Object.fromEntries(preferences) },
		],
		...records,
		...originals,
	]);
}

export class GardenRecords<T> {
	private prefix: string;
	constructor(
		options: { dbName: string; storeName: string; version?: number } | string,
		storeName?: string,
		_version?: number,
	) {
		const db = typeof options === "string" ? options : options.dbName;
		const store = typeof options === "string" ? storeName : options.storeName;
		if (!db || !store) throw Error("Choose a native project store.");
		this.prefix = keyFor("record-", [db, store]).slice(0, -1) + ",";
	}
	private key(key: string) {
		return this.prefix + JSON.stringify(key) + "]";
	}
	async get(key: string): Promise<T | null> {
		return structuredClone(records.get(this.key(key)) ?? null);
	}
	async set({ key, value }: { key: string; value: T }): Promise<void> {
		records.set(this.key(key), structuredClone({ id: key, ...value }));
		changed();
	}
	async remove(key: string): Promise<void> {
		if (records.delete(this.key(key))) changed();
	}
	async list(): Promise<string[]> {
		return [...records.keys()]
			.filter((k) => k.startsWith(this.prefix))
			.map((k) => JSON.parse(k.slice(7))[2]);
	}
	async getAll(): Promise<T[]> {
		return structuredClone(
			[...records].filter(([k]) => k.startsWith(this.prefix)).map(([, v]) => v),
		);
	}
	async clear(): Promise<void> {
		for (const key of await this.list()) await this.remove(key);
	}
}
export async function deleteGardenDatabase({ dbName }: { dbName: string }) {
	const prefix = keyFor("record-", [dbName]).slice(0, -1) + ",";
	for (const key of records.keys())
		if (key.startsWith(prefix)) records.delete(key);
	changed();
}

export class GardenFiles {
	constructor(private directoryName = "media") {}
	private key(key: string) {
		return keyFor("file-", [this.directoryName, key]);
	}
	private info(key: string) {
		return keyFor("info-", [this.directoryName, key]);
	}
	async get(key: string): Promise<File | null> {
		const value = originals.get(this.key(key));
		if (!value) return null;
		const info = records.get(this.info(key));
		if (!info) throw Error("Original media information is missing.");
		return new File([value.bytes as BlobPart], info.name, {
			type: value.type,
			lastModified: info.lastModified,
		});
	}
	async set({ key, value }: { key: string; value: File }): Promise<void> {
		if (value.size > 128_000_000)
			throw Error("Choose an original file up to 128 MB.");
		pendingFiles++;
		try {
			const bytes = new Uint8Array(await value.arrayBuffer());
			originals.set(this.key(key), {
				bytes,
				type: value.type || "application/octet-stream",
			});
			records.set(this.info(key), {
				name: value.name,
				lastModified: value.lastModified,
			});
			changed();
		} finally {
			pendingFiles--;
		}
	}
	async remove(key: string): Promise<void> {
		originals.delete(this.key(key));
		records.delete(this.info(key));
		changed();
	}
	async list(): Promise<string[]> {
		const prefix = keyFor("file-", [this.directoryName]).slice(0, -1) + ",";
		return [...originals.keys()]
			.filter((k) => k.startsWith(prefix))
			.map((k) => JSON.parse(k.slice(5))[1]);
	}
	async clear(): Promise<void> {
		for (const key of await this.list()) await this.remove(key);
	}
	static isSupported() {
		return true;
	}
}
