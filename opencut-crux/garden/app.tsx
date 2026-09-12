import React from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { TooltipProvider } from "../apps/web/src/components/ui/tooltip";
import Editor from "../apps/web/src/app/editor/[project_id]/page";
import ProjectsPage from "../apps/web/src/app/projects/page";
import { EditorCore } from "../apps/web/src/core";
import { captureState, pendingOperations } from "./state";
import { usePathname, RouteProvider } from "./navigation";
import "../apps/web/src/app/globals.css";

export async function mount(session: any) {
	const core = EditorCore.getInstance();
	(window as any).gardenEditor = core;
	if (!location.hash) {
		const id = await core.project.createNewProject({ name: "My video" });
		location.hash = "/editor/" + id;
	}
	function App() {
		const route = usePathname();
		return (
			<ThemeProvider attribute="class" defaultTheme="dark">
				<TooltipProvider>
					<RouteProvider route={route}>
						{route === "/projects" ? <ProjectsPage /> : <Editor />}
					</RouteProvider>
					<Toaster />
				</TooltipProvider>
			</ThemeProvider>
		);
	}
	createRoot(document.getElementById("root")!).render(<App />);
	// Native timeline changes are debounced; flush them before the bridge checks
	// whether its record revision changed (including close/export in this turn).
	session.registerDraft(async () => {
		await new Promise((resolve) => requestAnimationFrame(resolve));
		if (!core.project.getActiveOrNull() || !core.save.getIsDirty()) return;
		await core.save.flush();
		const deadline = Date.now() + 50000;
		while (core.save.getIsDirty()) {
			if (Date.now() > deadline)
				throw Error("Wait for the pending video edit to finish saving.");
			await new Promise((r) => setTimeout(r, 20));
		}
	});
	core.timeline.subscribe(() => {
		if (core.save.getIsDirty()) session.changed();
	});
	core.scenes.subscribe(() => {
		if (core.save.getIsDirty()) session.changed();
	});
	session.connect({
		capture: captureState,
		busy: () => pendingOperations() > 0 || core.project.getIsLoading(),
		command: async (command: any) => {
			const project = core.project.getActiveOrNull();
			if (command.op === "inspect") {
				const active = core.scenes.getActiveSceneOrNull();
				const tracks = active
					? [
							active.tracks.main,
							...active.tracks.overlay,
							...active.tracks.audio,
						]
					: [];
				return {
					project: project
						? {
								id: project.metadata.id,
								name: project.metadata.name,
								scenes: project.scenes.map((s) => ({ id: s.id, name: s.name })),
							}
						: null,
					elements: tracks
						.flatMap((t) =>
							t.elements.map((e) => ({
								trackId: t.id,
								id: e.id,
								type: e.type,
								name: e.name,
								startTime: e.startTime,
								duration: e.duration,
								...(e.type === "text"
									? { content: String(e.params.content || "").slice(0, 1000) }
									: {}),
							})),
						)
						.slice(0, 100),
					media: core.media
						.getAssets()
						.slice(0, 100)
						.map((a) => ({
							id: a.id,
							name: a.name,
							type: a.type,
							duration: a.duration,
						})),
				};
			}
			if (
				command.op === "set-text" &&
				project &&
				typeof command.content === "string" &&
				command.content.length <= 10000
			) {
				const active = core.scenes.getActiveSceneOrNull();
				const track = active?.tracks.overlay.find((t) =>
					t.elements.some(
						(e) => e.id === command.elementId && e.type === "text",
					),
				);
				const element = track?.elements.find((e) => e.id === command.elementId);
				if (!track || !element || element.type !== "text")
					throw Error("Choose an existing text element in the active scene.");
				core.timeline.updateElements({
					updates: [
						{
							trackId: track.id,
							elementId: element.id,
							patch: {
								params: { ...element.params, content: command.content },
							},
						},
					],
				});
				return { id: element.id, content: command.content };
			}
			if (
				command.op === "set-name" &&
				project &&
				typeof command.name === "string" &&
				command.name.trim() &&
				command.name.length <= 200
			) {
				await core.project.renameProject({
					id: project.metadata.id,
					name: command.name,
				});
				return { name: command.name };
			}
			throw Error("Choose a supported operation with an open video project.");
		},
	});
}
