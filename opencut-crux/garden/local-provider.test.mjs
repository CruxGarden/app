import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { validateProject } from "./model.js";
import { validateExport } from "./validate-export.mjs";
const { chromium } = await import(
	new URL("../../electron/node_modules/playwright/index.mjs", import.meta.url)
);
const root = resolve(fileURLToPath(new URL("../runtime/", import.meta.url)));
const scratch = await mkdtemp(join(tmpdir(), "crux-opencut-provider-"));
await mkdir(join(scratch, "assets"));
const ffmpeg = fileURLToPath(
	new URL("../../electron/node_modules/ffmpeg-static/ffmpeg", import.meta.url),
);
for (const [color, hz] of [
	["red", 440],
	["blue", 660],
]) {
	execFileSync(ffmpeg, [
		"-v",
		"error",
		"-f",
		"lavfi",
		"-i",
		`color=c=${color}:s=320x180:r=24:d=2`,
		"-f",
		"lavfi",
		"-i",
		`sine=frequency=${hz}:duration=2`,
		"-c:v",
		"libx264",
		"-pix_fmt",
		"yuv420p",
		"-c:a",
		"aac",
		join(scratch, color + ".mp4"),
	]);
}

let expectConflict = false;
let content = JSON.stringify({ version: 1, app: "opencut", project: null });
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const host = `<!doctype html><style>html,body,iframe{margin:0;width:100%;height:100%;border:0}</style><iframe src="/runtime/index.html"></iframe><script>
addEventListener('message',async event=>{if(event.source!==document.querySelector('iframe').contentWindow||event.origin!==location.origin)return;const message=event.data;if(message?.type!=='crux:app'||!['read','write','native-read','native-import'].includes(message.op))return;
try{const value={...message};if(value.bytes){value.bytes=Array.from(new Uint8Array(value.bytes));}const r=await fetch('/host',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(value)});const result=await r.json();if(!r.ok)throw Error(result.error);if(result.bytes)result.bytes=new Uint8Array(result.bytes).buffer;event.source.postMessage({type:'crux:app:result',id:message.id,result},event.origin);}catch(error){event.source.postMessage({type:'crux:app:result',id:message.id,error:error.message},event.origin);}});
</script>`;
const importedCounts = new Map();
const requests = [],
	failures = [],
	errors = [];
const server = createServer(async (req, res) => {
	try {
		const path = new URL(req.url, "http://local").pathname;
		if (path === "/") {
			res.setHeader("Content-Type", "text/html");
			res.end(host);
			return;
		}
		if (path === "/host" && req.method === "POST") {
			let body = "";
			for await (const chunk of req) body += chunk;
			const value = JSON.parse(body);
			let result;
			if (value.op === "read") result = { content, fingerprint: hash(content) };
			else if (value.op === "write") {
				if (value.expected !== hash(content))
					throw Error("Saved project changed. Reload before saving.");
				validateProject(JSON.parse(value.content));
				content = value.content;
				await writeFile(join(scratch, "project.json"), content);
				result = { fingerprint: hash(content) };
			} else if (value.op === "native-import") {
				const bytes = Buffer.from(value.bytes);
				const fingerprint = hash(bytes);
				importedCounts.set(
					fingerprint,
					(importedCounts.get(fingerprint) || 0) + 1,
				);
				const path = `assets/${fingerprint}.bin`;
				await writeFile(join(scratch, path), bytes);
				result = { path, fingerprint };
			} else if (value.op === "native-read") {
				if (!/^assets\/[a-f0-9]{64}\.bin$/.test(value.path))
					throw Error("Invalid original path");
				result = { bytes: [...(await readFile(join(scratch, value.path)))] };
			} else throw Error("Unknown host operation");
			res.setHeader("Content-Type", "application/json");
			res.end(JSON.stringify(result));
			return;
		}
		if (!path.startsWith("/runtime/")) throw Error("Not found");
		const file = resolve(root, "." + path.slice("/runtime".length));
		if (!file.startsWith(root + "/")) throw Error("Not found");
		const bytes = await readFile(file);
		res.setHeader(
			"Content-Type",
			{
				".js": "text/javascript",
				".mjs": "text/javascript",
				".css": "text/css",
				".html": "text/html",
				".json": "application/json",
				".png": "image/png",
				".svg": "image/svg+xml",
				".wasm": "application/wasm",
			}[extname(file)] || "application/octet-stream",
		);
		res.end(bytes);
	} catch (error) {
		res.writeHead(expectConflict && req.url === "/host" ? 409 : 404, {
			"Content-Type": "application/json",
		});
		res.end(JSON.stringify({ error: error.message }));
	}
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
try {
	const page = await browser.newPage({
		viewport: { width: 1600, height: 1000 },
	});
	page.on("pageerror", (e) => {
		errors.push(e.stack);
		console.log("PAGE", e.stack);
	});
	page.on("console", (m) => {
		if (["error", "warning"].includes(m.type()))
			console.log("BROWSER", m.type(), m.text());
	});
	page.on("response", (r) => {
		if (
			r.status() >= 400 &&
			!(expectConflict && r.status() === 409 && r.url() === origin + "/host")
		) {
			failures.push(r.url());
			console.log("HTTP", r.status(), r.url());
		}
	});
	await page.route("**/*", (r) => {
		if (
			r.request().url().startsWith(origin) ||
			r.request().url().startsWith("blob:")
		)
			return r.continue();
		requests.push(r.request().url());
		return r.abort();
	});
	await page.goto(origin);
	const frame = page
		.frames()
		.find((f) => f.url().includes("/runtime/index.html"));
	await frame
		.locator("#garden-project [role=status]")
		.filter({ hasText: "Saved to Garden" })
		.waitFor({ timeout: 60000 });
	await frame
		.getByText("Welcome to OpenCut Beta! 🎉", { exact: true })
		.first()
		.waitFor({ timeout: 30000 });
	await frame.getByRole("button", { name: "Next", exact: true }).click();
	await frame.getByRole("button", { name: "Next", exact: true }).click();
	await frame.getByRole("button", { name: "Finish", exact: true }).click();
	const chooser = page.waitForEvent("filechooser");
	await frame.getByRole("button", { name: "Import", exact: true }).click();
	await (
		await chooser
	).setFiles([join(scratch, "red.mp4"), join(scratch, "blue.mp4")]);
	await frame.waitForFunction(
		() => window.gardenEditor.media.getAssets().length === 2,
		null,
		{ timeout: 30000 },
	);
	await frame
		.getByTitle("red.mp4", { exact: true })
		.locator("..")
		.getByRole("button")
		.click();
	await frame.evaluate(() => {
		const e = window.gardenEditor;
		const t = e.scenes.getActiveScene().tracks.main;
		e.timeline.splitElements({
			elements: [{ trackId: t.id, elementId: t.elements[0].id }],
			splitTime: 120000,
			retainSide: "left",
		});
		e.playback.seek({ time: 120000 });
	});
	await frame
		.getByTitle("blue.mp4", { exact: true })
		.locator("..")
		.getByRole("button")
		.click();
	await frame.evaluate(() => window.gardenEditor.playback.seek({ time: 0 }));
	await frame.getByRole("button", { name: "Text", exact: true }).click();
	await frame
		.getByText("Default text", { exact: true })
		.locator("..")
		.locator("..")
		.getByRole("button")
		.click();
	await frame.evaluate(() => {
		const e = window.gardenEditor;
		const t = e.scenes
			.getActiveScene()
			.tracks.overlay.find((t) => t.type === "text");
		const el = t.elements[0];
		e.timeline.updateElements({
			updates: [
				{
					trackId: t.id,
					elementId: el.id,
					patch: {
						duration: 360000,
						params: { ...el.params, content: "Garden proof", fontSize: 30 },
					},
				},
			],
		});
	});
	const result = await frame.evaluate(async () => {
		const e = window.gardenEditor;
		await window.gardenSession.flush();
		const r = await e.project.export({
			options: { format: "webm", quality: "medium", includeAudio: true },
		});
		return {
			...r,
			buffer: r.buffer ? [...new Uint8Array(r.buffer)] : undefined,
		};
	});
	console.log("EXPORT", { ...result, buffer: result.buffer?.length });
	if (!result.success || !result.buffer)
		throw Error(result.error || "Export failed");
	await writeFile(join(scratch, "export.webm"), Buffer.from(result.buffer));
	await page.screenshot({ path: join(scratch, "opencut-local.png") });
	console.log(
		"SCENE",
		JSON.stringify(
			await frame.evaluate(() => window.gardenEditor.scenes.getActiveScene()),
		),
	);
	console.log(
		"ASSETS",
		await frame.evaluate(() =>
			window.gardenEditor.media
				.getAssets()
				.map(({ id, name, type, duration, width, height }) => ({
					id,
					name,
					type,
					duration,
					width,
					height,
				})),
		),
	);

	await frame
		.getByRole("button", { name: "Save project", exact: true })
		.click();
	await frame
		.locator("#garden-project [role=status]")
		.filter({ hasText: "Saved to Garden" })
		.waitFor({ timeout: 60000 });
	const tool = (command) =>
		page.evaluate(
			(command) =>
				new Promise((resolve, reject) => {
					const frame = document.querySelector("iframe"),
						id = crypto.randomUUID();
					const timer = setTimeout(() => {
						removeEventListener("message", receive);
						reject(Error("Tool result timeout"));
					}, 60000);
					function receive(event) {
						if (
							event.source !== frame.contentWindow ||
							event.origin !== location.origin ||
							event.data?.op !== "tool-result" ||
							event.data.commandId !== id
						)
							return;
						clearTimeout(timer);
						removeEventListener("message", receive);
						event.data.error
							? reject(Error(event.data.error))
							: resolve(event.data.result);
					}
					addEventListener("message", receive);
					frame.contentWindow.postMessage(
						{ type: "crux:app:command", id, command },
						location.origin,
					);
				}),
			command,
		);
	const inspected = await tool({ op: "inspect" });
	const title = inspected.elements.find((e) => e.type === "text");
	assert.ok(title);
	await tool({ op: "set-text", elementId: title.id, content: "Agent title" });
	assert.equal(
		(await tool({ op: "inspect" })).elements.find((e) => e.id === title.id)
			.content,
		"Agent title",
	);
	await frame.evaluate(() => window.gardenEditor.command.undo());
	assert.equal(
		(await tool({ op: "inspect" })).elements.find((e) => e.id === title.id)
			.content,
		"Garden proof",
	);
	await frame.evaluate(() => window.gardenEditor.command.redo());
	await tool({ op: "set-name", name: "Garden film" });
	assert.equal((await tool({ op: "inspect" })).project.name, "Garden film");
	const before = await frame.evaluate(() =>
		JSON.parse(
			JSON.stringify(window.gardenEditor.scenes.getActiveScene().tracks),
		),
	);
	await page.reload();
	const reopened = page
		.frames()
		.find((f) => f.url().includes("/runtime/index.html"));
	await reopened
		.locator("#garden-project [role=status]")
		.filter({ hasText: "Saved to Garden" })
		.waitFor({ timeout: 60000 });
	await reopened.waitForFunction(
		() => window.gardenEditor?.media.getAssets().length === 2,
		null,
		{ timeout: 30000 },
	);
	assert.deepEqual(
		await reopened.evaluate(
			() => window.gardenEditor.scenes.getActiveScene().tracks,
		),
		before,
	);
	const repeated = await reopened.evaluate(async () => {
		const r = await window.gardenEditor.project.export({
			options: { format: "webm", quality: "medium", includeAudio: true },
		});
		return {
			...r,
			buffer: r.buffer ? [...new Uint8Array(r.buffer)] : undefined,
		};
	});
	assert.equal(repeated.success, true, repeated.error);
	await writeFile(join(scratch, "reopened.webm"), Buffer.from(repeated.buffer));
	// A host close/export must include an edit made in the current event loop,
	// before native SaveManager's 800ms debounce writes its record.
	await reopened
		.getByRole("button", { name: "Save project", exact: true })
		.click();
	await reopened
		.locator("#garden-project [role=status]")
		.filter({ hasText: "Saved to Garden" })
		.waitFor();
	await reopened.evaluate(async () => {
		const e = window.gardenEditor;
		const t = e.scenes
				.getActiveScene()
				.tracks.overlay.find((t) => t.type === "text"),
			el = t.elements[0];
		e.timeline.updateElements({
			updates: [
				{
					trackId: t.id,
					elementId: el.id,
					patch: { params: { ...el.params, content: "Immediate draft" } },
				},
			],
		});
		await window.gardenSession.flush();
	});
	const savedRecords = await Promise.all(
		Object.values(JSON.parse(content).project)
			.filter((v) => v.__cruxBinary?.type === "application/json")
			.map((v) => readFile(join(scratch, v.__cruxBinary.path), "utf8")),
	);
	assert.ok(
		savedRecords.some((record) => record.includes("Immediate draft")),
		"Immediate native edit must be included in confirmed flush",
	);
	// Corrupt only the native runtime date to exercise a real serialization error.
	// A rejected native save must stay dirty and reject the host flush.
	const failure = await reopened.evaluate(async () => {
		const e = window.gardenEditor,
			s = e.scenes.getActiveScene(),
			original = s.createdAt;
		s.createdAt = null;
		e.save.markDirty();
		let error = "";
		try {
			await window.gardenSession.flush();
		} catch (e) {
			error = e.message;
		}
		const dirty = e.save.getIsDirty();
		s.createdAt = original;
		return { error, dirty };
	});
	assert.ok(
		failure.error,
		"Native serialization failure must reject a confirmed save",
	);
	assert.equal(failure.dirty, true);
	await reopened.evaluate(() => window.gardenSession.flush());
	validateExport(join(scratch, "reopened.webm"), ffmpeg);
	for (const color of ["red", "blue"]) {
		const original = await readFile(join(scratch, color + ".mp4"));
		assert.deepEqual(
			await readFile(join(scratch, "assets", hash(original) + ".bin")),
			original,
		);
		assert.equal(
			importedCounts.get(hash(original)),
			1,
			"Unchanged original imported once",
		);
	}
	// Keep the native library usable and portable within this video Crux.
	await reopened
		.getByRole("img", { name: "Project thumbnail", exact: true })
		.locator("..")
		.click();
	await reopened
		.getByRole("menuitem", { name: "Exit project", exact: true })
		.click();
	await reopened
		.getByRole("button", { name: "List view", exact: true })
		.click();
	await reopened
		.getByRole("button", { name: "New project", exact: true })
		.click();
	await reopened.waitForFunction(
		() =>
			window.gardenEditor.project.getActiveOrNull()?.metadata.name ===
			"New project",
	);
	await reopened
		.getByRole("img", { name: "Project thumbnail", exact: true })
		.locator("..")
		.click();
	await reopened
		.getByRole("menuitem", { name: "Exit project", exact: true })
		.click();
	await reopened
		.getByRole("button", { name: "Save project", exact: true })
		.click();
	await reopened
		.locator("#garden-project [role=status]")
		.filter({ hasText: "Saved to Garden" })
		.waitFor();
	await page.reload();
	const library = page
		.frames()
		.find((f) => f.url().includes("/runtime/index.html"));
	await library.getByText("Garden film", { exact: true }).waitFor();
	assert.equal(
		await library
			.getByRole("button", { name: "List view", exact: true })
			.getAttribute("aria-pressed"),
		"true",
	);
	await library.getByText("Garden film", { exact: true }).dblclick();
	await library.waitForFunction(
		() => window.gardenEditor.media.getAssets().length === 2,
	);
	assert.equal(
		await library.evaluate(
			() =>
				window.gardenEditor.scenes
					.getActiveScene()
					.tracks.overlay.find((t) => t.type === "text").elements[0].params
					.content,
		),
		"Immediate draft",
	);
	await library
		.getByRole("button", { name: "Save project", exact: true })
		.click();
	await library
		.locator("#garden-project [role=status]")
		.filter({ hasText: "Saved to Garden" })
		.waitFor();
	// A competing save must reject both save and native exit, retaining the draft.
	expectConflict = true;
	content += "\n";
	await library.evaluate(() => {
		const e = window.gardenEditor,
			t = e.scenes
				.getActiveScene()
				.tracks.overlay.find((t) => t.type === "text"),
			el = t.elements[0];
		e.timeline.updateElements({
			updates: [
				{
					trackId: t.id,
					elementId: el.id,
					patch: { params: { ...el.params, content: "Conflicting draft" } },
				},
			],
		});
	});
	await library
		.getByRole("button", { name: "Save project", exact: true })
		.click();
	await library
		.locator("#garden-project [role=status]")
		.filter({ hasText: "changed" })
		.waitFor();
	await library
		.getByRole("img", { name: "Project thumbnail", exact: true })
		.locator("..")
		.click();
	await library
		.getByRole("menuitem", { name: "Exit project", exact: true })
		.click();
	await library
		.getByText("Your draft is still open", { exact: true })
		.waitFor();
	assert.equal(
		await library.evaluate(
			() =>
				window.gardenEditor.scenes
					.getActiveScene()
					.tracks.overlay.find((t) => t.type === "text").elements[0].params
					.content,
		),
		"Conflicting draft",
	);
	await library
		.getByRole("button", { name: "Reload saved project", exact: true })
		.click();
	await library
		.getByRole("dialog", { name: "Discard unsaved video changes?" })
		.getByRole("button", { name: "Discard and reload", exact: true })
		.click();
	expectConflict = false;
	const restored = page
		.frames()
		.find((f) => f.url().includes("/runtime/index.html"));
	await restored
		.locator("#garden-project [role=status]")
		.filter({ hasText: "Saved to Garden" })
		.waitFor();
	await restored.waitForFunction(() =>
		window.gardenEditor?.scenes
			.getActiveSceneOrNull()
			?.tracks.overlay.some((t) => t.type === "text"),
	);
	assert.equal(
		await restored.evaluate(
			() =>
				window.gardenEditor.scenes
					.getActiveScene()
					.tracks.overlay.find((t) => t.type === "text").elements[0].params
					.content,
		),
		"Immediate draft",
	);
	assert.deepEqual(errors, []);
	assert.deepEqual(requests, []);
	assert.deepEqual(failures, []);
	console.log(
		JSON.stringify({
			passed: true,
			scratch,
			records: Object.keys(JSON.parse(content).project).length,
			imports: [...importedCounts.values()],
		}),
	);
} finally {
	await browser.close();
	server.close();
}
