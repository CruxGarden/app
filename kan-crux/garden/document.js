const object = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const binary = (value) =>
	object(value) &&
	Object.keys(value).length === 1 &&
	object(value.__cruxBinary);
export function validateProject(doc) {
	if (
		!object(doc) ||
		doc.version !== 1 ||
		doc.app !== "kan" ||
		Object.keys(doc).some((k) => !["version", "app", "project"].includes(k))
	)
		throw Error("Invalid Kan project.");
	if (doc.project === null) return;
	if (
		!object(doc.project) ||
		!Object.hasOwn(doc.project, "state") ||
		Object.keys(doc.project).length > 10000
	)
		throw Error("Invalid Kan records.");
	for (const [key, value] of Object.entries(doc.project)) {
		if (key !== "state") {
			const prefix = ["record-", "file-", "info-"].find((p) =>
				key.startsWith(p),
			);
			if (!prefix || key.length > 1000)
				throw Error("Invalid native record name.");
			const parts = JSON.parse(key.slice(prefix.length));
			if (
				!Array.isArray(parts) ||
				parts.length !== (prefix === "record-" ? 3 : 2) ||
				parts.some((p) => typeof p !== "string" || !p || p.length > 250)
			)
				throw Error("Invalid native record identity.");
            if (prefix === "record-" ? parts[0] !== "kan" || parts[1] !== "board" || !/^[\w-]{12}$/.test(parts[2]) : parts[0] !== "attachments" || !/^[\w-]{12}$/.test(parts[1])) throw Error("Invalid Kan record namespace.");
		}
		if (binary(value)) {
			const r = value.__cruxBinary;
			if (
				!/^assets\/[a-f0-9]{64}\.bin$/.test(r.path) ||
				r.kind !== "buffer" ||
				typeof r.type !== "string" ||
				!Number.isSafeInteger(r.size) ||
				r.size < 0 ||
				r.size > 64000000 ||
				Object.keys(r).some(
					(k) => !["path", "kind", "type", "size"].includes(k),
				)
			)
				throw Error("Invalid native content reference.");
			continue;
		}
		if (key.startsWith("file-")) {
			if (
				!object(value) ||
				!(value.bytes instanceof Uint8Array) ||
				value.bytes.byteLength > 64000000 ||
				typeof value.type !== "string"
			)
				throw Error("Invalid original media.");
			if (!Object.hasOwn(doc.project, "info-" + key.slice(5)))
				throw Error("Original media information is missing.");
		} else if (key === "state") {
			if (
				!object(value) ||
				typeof value.route !== "string" ||
				value.route.length > 2000 ||
				(!/^#\/(boards(?:\/[\w-]{12})?|cards\/[\w-]{12}|templates(?:\/[\w-]{12}(?:\/cards\/[\w-]{12})?)?)(?:\?[^#]*)?$/.test(value.route) &&
					value.route !== "") ||
				!object(value.preferences) ||
                value.version !== 1 || !Number.isSafeInteger(value.cardNumber) || value.cardNumber < 0 ||
				Object.values(value.preferences).some((v) => typeof v !== "string")
			)
				throw Error("Invalid editor preferences.");
		} else if (key.startsWith("info-")) {
			if (
				!object(value) ||
				typeof value.name !== "string" ||
				value.name.length > 1000 ||
				!Number.isFinite(value.lastModified) ||
				!Object.hasOwn(doc.project, "file-" + key.slice(5))
			)
				throw Error("Invalid original file information.");
		} else if (!object(value)) throw Error("Invalid native project record.");
	}
}
