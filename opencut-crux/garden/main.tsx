import { startGarden } from "./bridge.js";
import { installState } from "./state";
import { guardGpuAdapter } from "./gpu-guard";
guardGpuAdapter();
const session = await startGarden();
(window as any).gardenSession = session;
installState(session);
const { mount } = await import("./app");
await mount(session);
