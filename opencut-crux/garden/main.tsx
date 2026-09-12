import { startGarden } from "./bridge.js";
import { installState } from "./state";
const session = await startGarden();
(window as any).gardenSession = session;
installState(session);
const { mount } = await import("./app");
await mount(session);
