import type { ToolDefinition } from '@/ai/tools';

export type AppToolDefinition = ToolDefinition & { writes: readonly string[] };
type Controller = {
  tools: readonly AppToolDefinition[];
  execute(name: string, input: Record<string, unknown>): Promise<unknown>;
};
const controllers = new Map<string, Controller>();
// Keep mutation metadata after a frame closes: a just-completed tool still changed files.
const catalog = new Map<string, AppToolDefinition>();
export function registerAppTools(id: string, controller: Controller) {
  const names = new Set<string>();
  for (const tool of controller.tools) {
    if (names.has(tool.name)) throw new Error('Duplicate app tool name.');
    names.add(tool.name);
    const previous = catalog.get(tool.name);
    if (previous && JSON.stringify(previous) !== JSON.stringify(tool))
      throw new Error(
        `App tool ${tool.name} has incompatible definitions. Use an app-specific name.`,
      );
  }
  for (const tool of controller.tools) catalog.set(tool.name, tool);
  controllers.set(id, controller);
  return () => {
    if (controllers.get(id) === controller) controllers.delete(id);
  };
}
export function appToolDefinitions(id?: string): ToolDefinition[] {
  const tools = id ? (controllers.get(id)?.tools ?? []) : [...catalog.values()];
  return tools.map(({ name, description, input_schema }) => ({ name, description, input_schema }));
}
export function appToolFor(id: string, name: string) {
  return controllers.get(id)?.tools.find((tool) => tool.name === name);
}
export const isAppToolName = (name: string) => catalog.has(name);
export const isMutatingAppTool = (name: string) => !!catalog.get(name)?.writes.length;
export async function executeAppTool(id: string, name: string, input: Record<string, unknown>) {
  const controller = controllers.get(id);
  if (!controller || !controller.tools.some((tool) => tool.name === name))
    throw new Error('Open the app in this Crux’s Workshop before using its tools.');
  return controller.execute(name, input);
}
