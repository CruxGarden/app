import { captureNative, hydrateNative, observeStorage } from "./storage";
export const inGarden = window.parent !== window;
type Editor = {
	flush(): Promise<void>;
	inspect(): unknown;
	command(command: any): Promise<unknown>;
	frame?(): Promise<Blob>;
	stop?(): void;
};
let editor: Editor | null = null;
export function registerGardenEditor(value: Editor) {
	editor = value;
	markDirty();
	return () => {
		if (editor === value) editor = null;
	};
}
let parentOrigin: string | undefined;
const targetOrigin = () =>
	parentOrigin && parentOrigin !== "null" ? parentOrigin : "*";
const requests = new Map<
	string,
	{ resolve(v: any): void; reject(e: Error): void }
>();
function send(value: Record<string, unknown>) {
	parent.postMessage(
		{ type: "crux:app", id: crypto.randomUUID(), ...value },
		targetOrigin(),
	);
}
function call(request: Record<string, unknown>): Promise<any> {
	return new Promise((resolve, reject) => {
		const id = crypto.randomUUID();
		const timer = setTimeout(() => {
			requests.delete(id);
			reject(
				new Error(
					"Garden did not confirm the operation. Your draft is still open.",
				),
			);
		}, 60000);
		requests.set(id, {
			resolve(v) {
				clearTimeout(timer);
				resolve(v);
			},
			reject(e) {
				clearTimeout(timer);
				reject(e);
			},
		});
		send({ ...request, id });
	});
}
let expected: string | null = null;
let revision = 0,
	savedRevision = 0,
	suppressStorage = false;
let timer: ReturnType<typeof setTimeout>;
let tail: Promise<unknown> = Promise.resolve();
let commands: Promise<unknown> = Promise.resolve();
let status: HTMLElement;
function show(message: string) {
	if (status) {
		status.textContent = message;
		status.title = message;
	}
}
export function markDirty() {
	if (!inGarden) return;
	revision++;
	send({ op: "dirty", dirty: true });
	show("Unsaved changes");
	clearTimeout(timer);
	timer = setTimeout(() => {
		void save().catch(() => {});
	}, 1000);
}
function save() {
	const operation = tail.then(async () => {
		clearTimeout(timer);
		if (revision === savedRevision) return;
		const saving = revision;
		show("Saving project…");
		try {
			suppressStorage = true;
			await editor?.flush();
			const document = await captureNative(call);
			const result = await call({
				op: "write",
				path: "project.json",
				content: JSON.stringify(document),
				expected,
			});
			expected = result.fingerprint;
			savedRevision = saving;
			send({ op: "dirty", dirty: revision !== savedRevision });
			show(revision === savedRevision ? "Saved to Garden" : "Unsaved changes");
		} catch (error) {
			show(
				error instanceof Error
					? error.message
					: "Save failed. Your draft is still open.",
			);
			throw error;
		} finally {
			suppressStorage = false;
		}
	});
	tail = operation.catch(() => {});
	return operation;
}
export async function startGarden() {
	if (!inGarden) return;
	window.addEventListener("message", (event) => {
		if (
			event.source !== parent ||
			(parentOrigin !== undefined && event.origin !== parentOrigin)
		)
			return;
		parentOrigin = event.origin;
		const message = event.data;
		if (message?.type === "crux:app:result") {
			const pending = requests.get(message.id);
			requests.delete(message.id);
			if (message.error) pending?.reject(new Error(message.error));
			else pending?.resolve(message.result);
		} else if (message?.type === "crux:app:flush") {
			editor?.stop?.();
			void save().then(
				() => send({ op: "flushed", flushId: message.id }),
				(error) =>
					send({
						op: "flushed",
						flushId: message.id,
						error: String(error.message),
					}),
			);
		} else if (message?.type === "crux:app:command") {
			const operation = commands.then(async () => {
				const target = editor;
				if (!target)
					throw new Error("Import or reopen media in OpenMosh first.");
				if (message.command.op === "inspect") return target.inspect();
				await save();
				if (editor !== target)
					throw new Error(
						"The open editing session changed. Inspect it again.",
					);
				const result = await target.command(message.command);
				markDirty();
				await save();
				return result;
			});
			commands = operation.catch(() => {});
			void operation.then(
				(result) => send({ op: "tool-result", commandId: message.id, result }),
				(error) =>
					send({
						op: "tool-result",
						commandId: message.id,
						error: String(error.message),
					}),
			);
		}
	});
	document.documentElement.style.setProperty("--garden-bar-height", "34px");
	const bar = document.createElement("div");
	bar.id = "garden-project";
	bar.innerHTML =
		'<span role="status">Opening Garden project…</span><button type="button">Save project</button><button type="button">Reload saved project</button><input aria-label="Output name" value="OpenMosh frame"><button type="button">Save frame to Cruxspace</button>';
	Object.assign(bar.style, {
		height: "34px",
		display: "flex",
		alignItems: "center",
		gap: "10px",
		padding: "0 12px",
		background: "#151515",
		color: "#ddd",
		font: "12px system-ui",
	});
	const style = document.createElement("style");
	style.textContent =
		"#garden-project{box-sizing:border-box}#garden-project button,#garden-project input{background:#252525;color:#ddd;border:1px solid #444;border-radius:3px;padding:3px 6px;font:11px system-ui}#garden-project input{width:100px}#garden-project span{min-width:100px}";
	document.head.append(style);
	document.body.prepend(bar);
	status = bar.querySelector("span")!;
	status.style.flex = "1";
	const buttons = bar.querySelectorAll("button");
	buttons[0]!.onclick = () => {
		void save().catch(() => {});
	};
	buttons[1]!.onclick = () => {
		if (
			revision === savedRevision ||
			confirm("Discard the unsaved draft and reload the saved project?")
		)
			location.reload();
	};
	buttons[2]!.onclick = () => {
		void (async () => {
			if (!editor?.frame)
				throw new Error(
					"Open an image or video in Single or Editor mode first.",
				);
			await save();
			const blob = await editor.frame();
			const content = await new Promise<string>((resolve, reject) => {
				const reader = new FileReader();
				reader.onload = () => resolve(reader.result as string);
				reader.onerror = () => reject(reader.error);
				reader.readAsDataURL(blob);
			});
			await call({
				op: "save-output",
				label: bar.querySelector("input")!.value,
				content,
			});
			show("Frame saved to Cruxspace");
		})().catch((error) => show(error.message));
	};
	const loaded = await call({ op: "read", path: "project.json" });
	expected = loaded.fingerprint;
	await hydrateNative(JSON.parse(loaded.content), call);
	observeStorage(() => {
		if (!suppressStorage) markDirty();
	});
	// Inputs include edits made during playback, before native debounce writes occur.
	for (const type of ["input", "change", "pointerup", "keyup"])
		document.addEventListener(type, (event) => {
			if (event.target instanceof Node && !bar.contains(event.target))
				markDirty();
		});
	window.addEventListener("blur", () => editor?.stop?.());
	document.addEventListener("visibilitychange", () => {
		if (document.hidden) {
			editor?.stop?.();
			void save().catch(() => {});
		}
	});
	show("Saved to Garden");
	send({ op: "dirty", dirty: false });
}
