export interface GardenWorld {
  id: string;
  name: string;
  line: string;
  sky: string;
  ground: string;
  rock: string;
  leaf: string;
  roof: string;
  water: string;
  accent: string;
  night?: boolean;
  study?: boolean;
}

export const GARDEN_WORLDS: GardenWorld[] = [
  {
    id: 'digital-fractal-garden',
    name: 'Digital Fractal Garden',
    line: 'A bloom that keeps blooming.',
    sky: '#2a2418',
    ground: '#3a3a22',
    rock: '#574d38',
    leaf: '#c9a86e',
    roof: '#c07b53',
    water: '#5fd2a5',
    accent: '#5fd2a5',
    night: true,
  },
  {
    id: 'night-city',
    name: 'Night City',
    line: 'The city is awake.',
    sky: '#171221',
    ground: '#2a2238',
    rock: '#3a3050',
    leaf: '#6b8cff',
    roof: '#ff7bb0',
    water: '#6b8cff',
    accent: '#ff7bb0',
    night: true,
  },
  {
    id: 'coral-castle',
    name: 'Coral Castle',
    line: 'Light moves slowly down here.',
    sky: '#0f181c',
    ground: '#1e3038',
    rock: '#2c4650',
    leaf: '#58b8c8',
    roof: '#ffc98a',
    water: '#58b8c8',
    accent: '#ffc98a',
    night: true,
  },
  {
    id: 'summer-meadow',
    name: 'Summer Meadow',
    line: 'Long grass, long light.',
    sky: '#bcd6e8',
    ground: '#6a8f3a',
    rock: '#8a9a7a',
    leaf: '#a8d060',
    roof: '#c97a4a',
    water: '#8fb8d8',
    accent: '#3f6f22',
    night: false,
  },
  {
    id: 'navy-dawn',
    name: 'Navy Dawn',
    line: 'The sky is turning.',
    sky: '#0a171d',
    ground: '#1b2f3a',
    rock: '#243c48',
    leaf: '#f17b50',
    roof: '#b03d33',
    water: '#2d6a7a',
    accent: '#f17b50',
    night: true,
  },
  {
    id: 'bismuth',
    name: 'Bismuth',
    line: 'Every facet a different colour.',
    sky: '#1a1c19',
    ground: '#2c3a44',
    rock: '#516279',
    leaf: '#7395ad',
    roof: '#d7a36d',
    water: '#7395ad',
    accent: '#d7a36d',
    night: true,
  },
  {
    id: 'raster-bars',
    name: 'Raster Bars',
    line: 'Ready.',
    sky: '#080808',
    ground: '#254082',
    rock: '#212026',
    leaf: '#4fbacc',
    roof: '#c670d7',
    water: '#4fbacc',
    accent: '#4fbacc',
    night: true,
  },
  {
    id: 'mountain-grey',
    name: 'Mountain Grey',
    line: 'Fog on the ridge.',
    sky: '#dfe2dd',
    ground: '#8a8f88',
    rock: '#6d716a',
    leaf: '#a4a79b',
    roof: '#555a54',
    water: '#b8b9ac',
    accent: '#4f5a56',
    night: false,
  },
];

export const GARDEN_PLACES = [
  {
    id: 'game',
    title: 'A game to get lost in.',
    label: 'The arcade',
    kind: 'GAMES',
    description: 'A mystery to unravel. A world with your rules. A reason to play one more round.',
    query: 'game',
    action: 'Explore games',
    position: [-5, 1, 1.5],
  },
  {
    id: 'site',
    title: 'Your corner of the internet.',
    label: 'The glasshouse',
    kind: 'WEBSITES',
    description:
      'A home for your work, your small business, or the thing you can’t stop thinking about.',
    query: 'website',
    action: 'Explore websites',
    position: [0, 1, -1.5],
  },
  {
    id: 'tool',
    title: 'That useful little thing.',
    label: 'The workshop',
    kind: 'TOOLS',
    description:
      'The calculator, dashboard, or tiny application you wish somebody had made. Somebody could be you.',
    query: 'tool',
    action: 'Explore tools',
    position: [4.7, 1, 0.8],
  },
  {
    id: 'story',
    title: 'A story you can step inside.',
    label: 'The story tower',
    kind: 'STORIES',
    description:
      'An illustrated journal. An interactive tale. A collection of ideas that keeps finding new branches.',
    query: 'story',
    action: 'Explore stories',
    position: [-0.7, 1, 4.5],
  },
] as const;
export type GardenPlaceId = (typeof GARDEN_PLACES)[number]['id'];

// One draw per document load, including React StrictMode and route remounts.
// Remember only the last draw in this tab so refreshes do not immediately repeat.
let initialWorldId: string | undefined;
export function initialHomepageWorld(): string {
  if (initialWorldId) return initialWorldId;
  let previous: string | null = null;
  try {
    previous = sessionStorage.getItem('cruxgarden:homepage-world');
  } catch {
    // Random selection still works when browser storage is unavailable.
  }
  const choices = GARDEN_WORLDS.filter((world) => world.id !== previous);
  initialWorldId = choices[Math.floor(Math.random() * choices.length)]!.id;
  try {
    sessionStorage.setItem('cruxgarden:homepage-world', initialWorldId);
  } catch {
    // Persistence is optional; it only prevents immediate repeats.
  }
  return initialWorldId;
}
