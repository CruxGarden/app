// The public edition: the saved map, read-only, with its places listed. The
// data is baked into the page at build time (vite.config.ts, --mode edition).
import { addFeatureLayers, createMap, emptyProject, featureTitle, fitTo, type MapProject } from './shared';
const project = ((window as unknown as { __MAP__?: MapProject | null }).__MAP__ ?? emptyProject()) as MapProject;
document.title = project.name;
document.getElementById('edition-title')!.textContent = project.name;
const list = document.getElementById('place-list')!;
const map = createMap(document.getElementById('map')!, project, (m) => {
  addFeatureLayers(m, project.features);
  fitTo(m, project.features);
});
project.features.forEach((f, i) => {
  const li = document.createElement('li');
  li.textContent = featureTitle(f, i) + (f.properties?.notes ? ` — ${f.properties.notes}` : '');
  li.onclick = () => fitTo(map, [f]);
  list.append(li);
});
