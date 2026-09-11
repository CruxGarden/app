import { startGarden } from "../../../garden/bridge.js";

async function boot() {
  if (window.parent !== window) window.gardenGraph = await startGarden();
  await import("./index");
}
boot().catch(console.error);
