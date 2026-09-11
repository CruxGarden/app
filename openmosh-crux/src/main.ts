import { mount } from "svelte";
import "./app.css";
import { startGarden } from "./garden/bridge";
startGarden()
	.then(async () => {
		const { default: App } = await import("./App.svelte");
		mount(App, { target: document.getElementById("app")! });
	})
	.catch((error) => {
		const target = document.getElementById("app")!;
		target.textContent = `Unable to open the saved project: ${error.message}`;
	});
