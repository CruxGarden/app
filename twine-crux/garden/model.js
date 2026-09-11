const keyPattern =
	/^twine-(stories|passages|prefs|storyformats)(-[a-zA-Z0-9-]+)?$/;
export function validateState(state) {
	if (
		!state ||
		typeof state !== 'object' ||
		Array.isArray(state) ||
		Object.keys(state).length > 20000
	)
		throw new Error('Invalid Twine library');
	for (const [key, value] of Object.entries(state))
		if (
			!keyPattern.test(key) ||
			typeof value !== 'string' ||
			value.length > 16000000
		)
			throw new Error('Invalid story, passage or preference');
}
export function validateProject(doc) {
	if (!doc || doc.version !== 1 || doc.app !== 'twine')
		throw new Error('Invalid Twine project');
	if (doc.project === null) return;
	if (
		!doc.project ||
		typeof doc.project !== 'object' ||
		Array.isArray(doc.project) ||
		Object.keys(doc.project).length > 20000
	)
		throw new Error('Invalid Twine library');
	for (const [key, value] of Object.entries(doc.project)) {
		const ref = value?.__cruxBinary;
		if (
			!keyPattern.test(key) ||
			!ref ||
			!/^assets\/[a-f0-9]{64}\.bin$/.test(ref.path) ||
			ref.kind !== 'buffer' ||
			ref.type !== 'application/json' ||
			!Number.isSafeInteger(ref.size) ||
			ref.size < 1 ||
			ref.size > 32000000
		)
			throw new Error('Invalid story Artifact');
	}
}
export function installStorage(initial, changed) {
	const values = new Map(Object.entries(initial || {}));
	Object.defineProperty(window, 'localStorage', {
		configurable: true,
		value: {
			get length() {
				return values.size;
			},
			key(index) {
				return [...values.keys()][index] ?? null;
			},
			getItem(key) {
				return values.get(String(key)) ?? null;
			},
			setItem(key, value) {
				key = String(key);
				value = String(value);
				if (values.get(key) === value) return;
				values.set(key, value);
				if (keyPattern.test(key)) changed();
			},
			removeItem(key) {
				if (values.delete(String(key)) && keyPattern.test(key)) changed();
			},
			clear() {
				values.clear();
				changed();
			}
		}
	});
	return () => {
		const state = Object.fromEntries(
			[...values].filter(([key]) => keyPattern.test(key))
		);
		validateState(state);
		return state;
	};
}
