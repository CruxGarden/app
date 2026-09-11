import { inputState, updateCode, updateCodeStore } from './util/state.svelte';
import { tick } from 'svelte';
export async function connectGarden() {
  const garden = await window.gardenReady;
  if (!garden) return;
  const inspect = () => JSON.parse(JSON.stringify(inputState));
  updateCodeStore({});
  garden.connect({
    inspect,
    async command(value: Record<string, unknown>) {
      if (value.op === 'inspect') return inspect();
      if (value.op !== 'code' || typeof value.code !== 'string' || value.code.length > 1_000_000)
        throw new Error('Choose Mermaid source up to 1 MB.');
      updateCode(value.code);
      await tick();
      return inspect();
    },
  });
}
