import type { AppToolDefinition } from '@/services/embedded-app-tool-registry';
const STYLES = ['liberty', 'bright', 'positron', 'dark'];
export const MAPS_TOOLS: AppToolDefinition[] = [
  { name: 'inspect_map', description: 'Read the open map: its name, basemap, view, and its places, routes and areas (id, kind, title, notes, colour, coordinates).', input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false }, writes: [] },
  { name: 'set_map_name', description: 'Name the map and save it in Garden.', input_schema: { type: 'object', properties: { name: { type: 'string', minLength: 1, maxLength: 200 } }, required: ['name'], additionalProperties: false }, writes: ['data/project.json'] },
  { name: 'set_map_style', description: 'Choose the basemap: liberty, bright, positron or dark.', input_schema: { type: 'object', properties: { style: { type: 'string', enum: STYLES } }, required: ['style'], additionalProperties: false }, writes: ['data/project.json'] },
  { name: 'add_map_place', description: 'Add a place (a point) at a longitude and latitude with a title, optional notes and colour; saves the map.', input_schema: { type: 'object', properties: { title: { type: 'string', minLength: 1, maxLength: 200 }, lng: { type: 'number', minimum: -180, maximum: 180 }, lat: { type: 'number', minimum: -90, maximum: 90 }, notes: { type: 'string', maxLength: 2000 }, color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' } }, required: ['title', 'lng', 'lat'], additionalProperties: false }, writes: ['data/project.json'] },
  { name: 'remove_map_place', description: 'Remove a place, route or area by its id (from inspect_map) and save the map.', input_schema: { type: 'object', properties: { id: { type: 'string', minLength: 1, maxLength: 64 } }, required: ['id'], additionalProperties: false }, writes: ['data/project.json'] },
  { name: 'fit_map', description: 'Move the view to show every place, route and area, and save the view.', input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false }, writes: ['data/project.json'] },
  { name: 'save_map_image', description: 'Save the map as it looks now as a named PNG output of this Crux (exports/), for a site or a notebook.', input_schema: { type: 'object', properties: { name: { type: 'string', minLength: 1, maxLength: 120 } }, required: ['name'], additionalProperties: false }, writes: ['data/project.json', 'exports/'] },
];
export function mapsCommand(name: string, input: Record<string, unknown>) {
  if (name === 'inspect_map' && !Object.keys(input).length) return { op: 'inspect' };
  if (name === 'fit_map' && !Object.keys(input).length) return { op: 'fit' };
  if (name === 'set_map_name') {
    if (Object.keys(input).length !== 1 || typeof input.name !== 'string' || !input.name.trim() || input.name.length > 200) throw new Error('Name the map (up to 200 characters).');
    return { op: 'set-name', name: input.name.trim() };
  }
  if (name === 'set_map_style') {
    if (Object.keys(input).length !== 1 || typeof input.style !== 'string' || !STYLES.includes(input.style)) throw new Error(`Choose a basemap: ${STYLES.join(', ')}.`);
    return { op: 'set-style', style: input.style };
  }
  if (name === 'add_map_place') {
    if (Object.keys(input).some((k) => !['title', 'lng', 'lat', 'notes', 'color'].includes(k))) throw new Error('A place has title, lng, lat, notes and color only.');
    if (typeof input.title !== 'string' || !input.title.trim() || input.title.length > 200) throw new Error('Give the place a title (up to 200 characters).');
    if (typeof input.lng !== 'number' || typeof input.lat !== 'number' || input.lng < -180 || input.lng > 180 || input.lat < -90 || input.lat > 90) throw new Error('Give lng (-180..180) and lat (-90..90).');
    if (input.notes !== undefined && (typeof input.notes !== 'string' || input.notes.length > 2000)) throw new Error('Use notes up to 2000 characters.');
    if (input.color !== undefined && (typeof input.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(input.color))) throw new Error('Use a colour like #2f6f4e.');
    return { op: 'add-place', ...input };
  }
  if (name === 'remove_map_place') {
    if (Object.keys(input).length !== 1 || typeof input.id !== 'string' || !input.id.trim()) throw new Error('Name the id to remove.');
    return { op: 'remove-place', id: input.id };
  }
  if (name === 'save_map_image') {
    if (Object.keys(input).length !== 1 || typeof input.name !== 'string' || !input.name.trim() || input.name.length > 120) throw new Error('Name the output (up to 120 characters).');
    return { op: 'save-image', label: input.name.trim() };
  }
  throw new Error(`Unknown map tool ${name}.`);
}
