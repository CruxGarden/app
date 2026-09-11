import { datasetToString, parseAppearanceState, parseDataset, serializeAppearanceState } from "@gephi/gephi-lite-sdk";

import { appearanceAtom } from "./core/appearance";
import { fileAtom } from "./core/file";
import { filtersAtom } from "./core/filters";
import { parseFiltersState, serializeFiltersState } from "./core/filters/utils";
import { graphDatasetActions, graphDatasetAtom } from "./core/graph";
import { layoutStateAtom } from "./core/layouts";
import { preferencesAtom } from "./core/preferences";
import { parsePreferences, serializePreferences } from "./core/preferences/utils";
import { sessionAtom } from "./core/session";
import { parseSession, serializeSession } from "./core/session/utils";
import { resetCamera } from "./core/sigma";

let connected = false;
export function connectGardenGraph() {
  const garden = window.gardenGraph;
  if (!garden || connected) return;
  const initial = garden.initial;
  if (initial) {
    const dataset = parseDataset(initial.dataset);
    const appearance = parseAppearanceState(initial.appearance);
    const filters = parseFiltersState(initial.filters);
    const session = parseSession(initial.session);
    const preferences = parsePreferences(initial.preferences);
    if (!dataset || !appearance || !filters || !session || !preferences)
      throw new Error("The saved graph could not be restored.");
    graphDatasetAtom.set(dataset);
    appearanceAtom.set(appearance);
    filtersAtom.set(filters);
    sessionAtom.set(session);
    preferencesAtom.set(preferences);
    resetCamera({ forceRefresh: true });
  }
  connected = true;
  graphDatasetAtom.bind(garden.changed);
  appearanceAtom.bind(garden.changed);
  filtersAtom.bind(garden.changed);
  sessionAtom.bind(garden.changed);
  preferencesAtom.bind(garden.changed);
  garden.connect({
    busy: () => layoutStateAtom.get().type === "running" || fileAtom.get().status.type === "loading",
    capture: () => ({
      dataset: datasetToString(graphDatasetAtom.get()),
      appearance: serializeAppearanceState(appearanceAtom.get()),
      filters: serializeFiltersState(filtersAtom.get()),
      session: serializeSession(sessionAtom.get()),
      preferences: serializePreferences(preferencesAtom.get()),
    }),
    command: (value) => {
      if (value.op === "set-title") {
        if (typeof value.title !== "string" || value.title.length > 300)
          throw new Error("Graph title must have at most 300 characters.");
        graphDatasetActions.editGraphMeta({ title: value.title });
      } else if (value.op !== "inspect") throw new Error("Unknown graph command");
      const graph = graphDatasetAtom.get();
      return {
        title: graph.metadata.title,
        nodes: graph.fullGraph.order,
        edges: graph.fullGraph.size,
        nodeFields: graph.nodeFields.map((f) => f.id),
        edgeFields: graph.edgeFields.map((f) => f.id),
        filters: filtersAtom.get().filters.length,
      };
    },
  });
}
