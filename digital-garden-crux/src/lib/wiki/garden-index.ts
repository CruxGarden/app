// The link index for the site: built once per build/dev render from the
// notes on disk, so backlinks and the graph agree with the wikilink resolver.
import { resolve } from "node:path";
import { indexGarden } from "./links.mjs";

export interface GardenNode {
  id: string;
  title: string;
  growthStage: string;
  tags: string[];
  links: number;
}
export interface GardenIndex {
  nodes: GardenNode[];
  edges: { source: string; target: string }[];
  outgoing: Map<string, string[]>;
  incoming: Map<string, string[]>;
}

// Read from the project folder: at build time this module runs from dist/, not src/.
const root = resolve(process.cwd(), "src/content/wiki");

export function gardenIndex(): GardenIndex {
  return indexGarden(root) as GardenIndex;
}

export const hrefFor = (id: string) => (id === "index" ? "/wiki" : `/wiki/${id}`);
