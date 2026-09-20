// functions/menu.js — what the desk sells. One source of truth: the page reads it,
// functions/order.js validates against it. Edit the list; the page follows.
export const SHOP = 'Bloom & Ink';
export const TAGLINE = 'Prints, cards and posters, made to order.';
export const ITEMS = [
  { name: 'A3 poster', price: '$18' },
  { name: 'Greeting card (pack of 5)', price: '$12' },
  { name: 'Business cards (100)', price: '$35' },
  { name: 'Sticker sheet', price: '$6' },
];
export default async function () {
  return { shop: SHOP, tagline: TAGLINE, items: ITEMS };
}
