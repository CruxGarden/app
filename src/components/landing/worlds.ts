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
    id: 'the-keeper',
    name: 'The Keeper',
    line: 'A place where ideas take root.',
    sky: '#101d25',
    ground: '#356949',
    rock: '#183c3b',
    leaf: '#b9f46d',
    roof: '#ff774b',
    water: '#65f7df',
    accent: '#ceff5f',
  },
  {
    id: '8-bit',
    name: '8-bit',
    line: 'A playground for things that don’t exist yet.',
    sky: '#bfcfde',
    ground: '#81af69',
    rock: '#b38964',
    leaf: '#397651',
    roof: '#c97355',
    water: '#62bcd0',
    accent: '#344c61',
  },
  {
    id: '80s-fantasy',
    name: '80s Fantasy',
    line: 'A workshop for making the imagined real.',
    sky: '#e0dce9',
    ground: '#989e9e',
    rock: '#a59ab1',
    leaf: '#676e8e',
    roof: '#806083',
    water: '#a9cacc',
    accent: '#674e73',
  },
  {
    id: 'glitchcore',
    name: 'Glitchcore',
    line: 'A laboratory for your strange ideas.',
    sky: '#161e30',
    ground: '#384456',
    rock: '#252c43',
    leaf: '#85d6c0',
    roof: '#ed88ad',
    water: '#85c4da',
    accent: '#abefd5',
    night: true,
  },
  {
    id: 'siberian-blizzard',
    name: 'Siberian Blizzard',
    line: 'A warm light. An unfinished idea. Time to build.',
    sky: '#c7d5de',
    ground: '#e4ecec',
    rock: '#a3b4bb',
    leaf: '#8dabae',
    roof: '#8b7163',
    water: '#9bbdcb',
    accent: '#365361',
  },
  {
    id: 'glumlot',
    name: 'GLUMLOT',
    line: 'A doorway into something unfamiliar.',
    sky: '#271c36',
    ground: '#665273',
    rock: '#352a47',
    leaf: '#b5a2da',
    roof: '#e2986d',
    water: '#b58abf',
    accent: '#ead9a7',
    night: true,
  },
  {
    id: 'ancient-egypt',
    name: 'Ancient Egypt',
    line: 'A place to give your ideas form.',
    sky: '#eee2c5',
    ground: '#c4ab76',
    rock: '#b78e62',
    leaf: '#527856',
    roof: '#c59459',
    water: '#68aeb2',
    accent: '#775233',
    study: true,
  },
  {
    id: 'paper-theatre',
    name: 'Paper theatre',
    line: 'For the cultivation of implausible notions.',
    sky: '#e4dfcf',
    ground: '#b4ba99',
    rock: '#aa9a83',
    leaf: '#708063',
    roof: '#aa7664',
    water: '#a5bbc1',
    accent: '#584f44',
    study: true,
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
