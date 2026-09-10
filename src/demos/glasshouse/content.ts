/** Original, offline demo Artifacts. Each Task changes a separate file. */
export const guide = `# Glasshouse · a Tending demo

One plant shop. Several ideas growing at once.

This is a scripted example, authored for the demo. No AI ran during setup.
All files, Task conversations and Growth history are real and editable.
The shop is fictional: checkout never takes payment or sends an order.

## A five-minute walkthrough

1. Open Tending. Glasshouse contains Main and three current Tasks.
   The in-app demo marks Checkout and Accessibility as scripted results to review.
   Imported .crux files start idle: live job state is deliberately not portable.
2. Open Checkout. Add a plant to the bag and try the demo order in Preview.
   Switch to Main: checkout is still unfinished there. Each Task has its own files.
3. In Checkout, choose Review changes, inspect checkout.js, then Check combined
   result. Try the combined preview, acknowledge the review and Merge into Main.
   This static demo has no build step; the check is not an accessibility audit.
4. Repeat for Accessibility. It changes accessibility.css independently: keyboard
   focus, larger targets and reduced-motion support. Tab through the preview.
5. Open Growth → Whole Crux · branches & merges. Brand foundation was already
   merged during setup. Its branch remains visible after merging, as will yours.

## Try real parallel work

Open Autumn campaign and send the brief below using your configured collaborator.
Create another Task from Main for care tips and start that too. In Tending, watch
the real turns progress, open the right Collaboration, and review results.
Concurrency limits can queue a turn. Approvals appear only when a real agent
requests one. Keep the app window open while turns run.

Campaign prompt: Create an autumn collection page in campaign.html. Keep the
existing shop and cart working, use the existing palette, and change only
campaign.html and campaign.css. Explain how to preview your result.

Care tips prompt: Add care.html, a short care guide linked to the three plants,
with watering and light guidance. Keep checkout and the homepage unchanged.

## Take it with you

Export from Main to get one .crux file containing all Tasks and Growth, with
shared content stored by fingerprint. Import it as a copy in another garden.
No Git repository, worktrees, npm install or API key is needed for the saved demo.
An API key or configured local collaborator is needed for new live AI turns.
Publishing shares Main's website; the private .crux export carries the Task graph.
`;

export const brand = `:root { --ink:#163c30; --paper:#f5f2e8; --leaf:#d7e77b; --line:#c9cfc1; --muted:#567062; }
body { background:var(--paper); color:var(--ink); }
.eyebrow, nav, button, .tag, footer { font-family:Arial,sans-serif; }
.hero h1 { font-style:italic; }
`;

export const accessibility = `/* Accessibility Task: keyboard focus, comfortable targets, reduced motion. */
:focus-visible { outline:3px solid #174bce; outline-offset:5px; }
button, nav a, .skip-link { min-height:44px; }
.skip-link { position:fixed; top:8px; left:8px; transform:translateY(-200%); z-index:10; padding:12px; background:white; color:#163c30; }
.skip-link:focus { transform:translateY(0); }
@media (prefers-reduced-motion:reduce) { *, *::before, *::after { animation:none!important; transition:none!important; scroll-behavior:auto!important; } }
`;

export const checkout = `/* Checkout Task: a local simulation; no payment or network request. */
window.checkout = function (cart) {
  const status = document.querySelector('#cart-status');
  if (!cart.length) { status.textContent = 'Your bag is empty. Choose a little green first.'; return; }
  const count = cart.length;
  cart.splice(0);
  window.renderCart();
  status.textContent = 'Demo order placed: ' + count + (count === 1 ? ' plant' : ' plants') + '. Nothing was charged or sent. Keep growing!';
};
`;

const plant = (
  label: string,
  color: string,
  variant: number,
) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 350" role="img" aria-label="Illustration of ${label}">
<ellipse cx="160" cy="316" rx="73" ry="11" fill="#163c30" opacity=".08"/>
<g stroke="#315b3d" stroke-width="5" fill="none"><path d="M160 255 Q${120 + variant * 9} 154 155 54"/><path d="M160 239 Q210 174 240 119"/><path d="M154 211 Q96 156 71 97"/></g>
<g fill="${color}"><path d="M155 147 Q87 119 110 49 Q172 54 155 147Z"/><path d="M156 112 Q207 94 194 31 Q144 34 156 112Z"/><path d="M145 188 Q69 174 49 98 Q125 86 145 188Z"/><path d="M171 206 Q179 122 252 114 Q270 184 171 206Z"/><path d="M158 243 Q82 252 69 196 Q126 163 158 243Z"/><path d="M174 239 Q210 186 260 204 Q239 262 174 239Z"/></g>
<path d="M111 248 H210 L197 307 Q161 324 124 307Z" fill="${variant === 1 ? '#ba6d47' : variant === 2 ? '#ded8bd' : '#6a7866'}"/><ellipse cx="160" cy="249" rx="50" ry="10" fill="#614f35"/><path d="M121 261 Q159 272 201 261" fill="none" stroke="#fff" opacity=".25" stroke-width="2"/>
</svg>`;

export const files: Record<string, string> = {
  'README.md': guide,
  'brand.css':
    ':root { --ink:#163c30; --paper:#fff; --leaf:#d7e77b; --line:#c9cfc1; --muted:#567062; }',
  'accessibility.css':
    '/* Accessibility Task adds enhanced keyboard focus and reduced-motion support here. */',
  'checkout.js':
    "window.checkout = function () { document.querySelector('#cart-status').textContent = 'Checkout is growing. Open the Checkout Task to try its finished version.'; };",
  'fern.svg': plant('Bird’s nest fern', '#477a42', 1),
  'rubber.svg': plant('Rubber plant', '#31583e', 2),
  'pothos.svg': plant('Golden pothos', '#749249', 3),
  'index.html': `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Glasshouse · A little green goes a long way</title><link rel="stylesheet" href="style.css"><link rel="stylesheet" href="brand.css"><link rel="stylesheet" href="accessibility.css"><script src="checkout.js" defer></script><script src="shop.js" defer></script></head>
<body><a class="skip-link" href="#collection">Skip to plants</a>
<header><a class="wordmark" href="index.html" aria-label="Glasshouse home">glasshouse<span>✳</span></a><nav aria-label="Main navigation"><a href="#collection">The collection</a><a href="campaign.html">Field notes ↗</a><a href="#bag">Your bag <span id="bag-count">0</span></a></nav></header>
<main><section class="hero"><div><p class="eyebrow">ROOTED IN THE EVERYDAY · EST. 2026</p><h1>A little green.<br>A whole new feeling.</h1><p class="intro">Plants for your windowsill, your quiet corner,<br>and the life you're growing into.</p><a class="pill" href="#collection">Find your little green <span>↘</span></a></div><div class="hero-art"><span class="orbit">ROOM TO GROW</span><img src="fern.svg" alt="Bird’s nest fern in a warm terracotta pot"><span class="art-note">A fresh start, one leaf at a time.</span></div></section>
<section id="collection" aria-labelledby="collection-title"><div class="section-heading"><div><p class="eyebrow">GOOD COMPANY, NATURALLY</p><h2 id="collection-title">Meet your new roommates.</h2></div><span class="tag">THREE LITTLE BEGINNINGS</span></div><div class="products">
${[
  ['fern', 'Bird’s nest fern', 'A little wild. A lot of character.', 24],
  ['rubber', 'Rubber plant', 'Quiet confidence for a sunny corner.', 32],
  ['pothos', 'Golden pothos', 'Easygoing, with room to wander.', 18],
]
  .map(
    ([id, name, desc, price]) =>
      `<article><div class="product-art"><img src="${id}.svg" alt="${name} in a pot"></div><div class="product-heading"><h3>${name}</h3><span>$${price}</span></div><p>${desc}</p><button data-plant="${name}" data-price="${price}">Add to bag <span>+</span></button></article>`,
  )
  .join('\n')}
</div></section><section id="bag" class="bag" aria-labelledby="bag-title"><div><p class="eyebrow">A SMALL START</p><h2 id="bag-title">Your growing collection</h2><p id="cart-summary">Your bag is waiting for something green.</p><p id="cart-status" role="status"></p></div><button id="checkout">Try demo checkout ↗</button></section>
<aside class="demo-note"><span>GROWN IN CRUX GARDEN</span><p>One shop. Several ideas taking root. Explore Checkout, Accessibility and Autumn campaign in Tending. This is a fictional shop — no orders or payments are taken.</p></aside></main>
<footer><span class="wordmark">glasshouse✳</span><span>Less scrolling. More growing.</span><a href="README.md">Demo walkthrough ↗</a></footer></body></html>`,
  'style.css': `*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;font-family:Georgia,serif;background:#f5f2e8;color:#163c30}a{color:inherit}button,a{-webkit-tap-highlight-color:transparent}header,main,footer{max-width:1200px;margin:auto}header{padding:28px 42px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--line)}.wordmark{font-size:32px;font-weight:bold;text-decoration:none;letter-spacing:-1.5px}.wordmark span{margin-left:3px;color:#64813d}nav{display:flex;gap:28px;font-size:12px}nav a{text-decoration:none;display:flex;align-items:center;gap:8px}#bag-count{border:1px solid var(--line);border-radius:50%;padding:3px 7px}main{padding:0 42px}.hero{display:grid;grid-template-columns:1.15fr 1fr;align-items:center;padding:36px 0 40px;gap:20px}.eyebrow{font:10px Arial,sans-serif;letter-spacing:2px;margin:0 0 20px}.hero h1{font-size:clamp(38px,5.2vw,68px);font-weight:normal;line-height:1.04;letter-spacing:-2px;margin:0 0 24px}.intro{font:15px/1.7 Arial,sans-serif;color:var(--muted)}.pill{display:inline-flex;gap:30px;align-items:center;border-radius:30px;background:var(--ink);color:white;padding:16px 22px;text-decoration:none;font:12px Arial,sans-serif;margin-top:16px}.hero-art{background:#e7eadb;border-radius:50% 50% 6px 6px;position:relative;text-align:center;padding:12px 20px 24px;max-height:395px}.hero-art img{height:300px;width:100%;object-fit:contain}.orbit{position:absolute;top:40px;right:18px;background:var(--leaf);border:1px solid #829352;border-radius:50%;height:78px;width:78px;display:grid;place-items:center;transform:rotate(16deg);font:10px/1.5 Arial,sans-serif;padding:16px;letter-spacing:1px}.art-note{display:block;font-style:italic;font-size:13px}.section-heading{display:flex;align-items:end;justify-content:space-between;border-top:1px solid var(--line);padding-top:28px;margin-bottom:22px;gap:20px}.section-heading .eyebrow{margin-bottom:9px}h2{font-weight:normal;font-size:29px;letter-spacing:-.6px;margin:0}.tag{font-size:9px;letter-spacing:1px}.products{display:grid;grid-template-columns:repeat(3,1fr);gap:24px}.product-art{background:#e9e8db;border-radius:4px;height:205px;text-align:center}.product-art img{width:100%;height:100%;object-fit:contain}.products article:nth-child(2) .product-art{background:#e5e8de}.products article:nth-child(3) .product-art{background:#efdfcb}.product-heading{display:flex;justify-content:space-between;gap:8px;align-items:center;margin-top:15px}h3{font-size:19px;font-weight:normal;margin:0}.product-heading span{font:12px Arial,sans-serif}.products p{font:11px/1.5 Arial,sans-serif;color:var(--muted)}button{cursor:pointer;background:none;border:1px solid var(--line);border-radius:4px;color:var(--ink);padding:12px 14px;font:12px Arial,sans-serif}.products button{width:100%;display:flex;justify-content:space-between}.products button:hover{background:var(--leaf)}.bag{margin-top:38px;padding:26px;background:#e6ead8;display:flex;align-items:center;justify-content:space-between;gap:20px;border-radius:5px}.bag .eyebrow{margin-bottom:12px}.bag h2{font-size:25px}.bag p{font:12px/1.6 Arial,sans-serif}.bag button{background:var(--ink);color:white;white-space:nowrap}#cart-status:empty{display:none}.demo-note{display:flex;gap:30px;align-items:center;padding:26px 0;font:11px/1.7 Arial,sans-serif;color:var(--muted)}.demo-note span{flex:0 0 150px;letter-spacing:1px}.demo-note p{max-width:590px}footer{border-top:1px solid var(--line);padding:24px 42px;display:flex;align-items:center;justify-content:space-between;gap:20px;font-size:11px}footer .wordmark{font-size:24px}.skip-link{position:absolute;left:-10000px}.skip-link:focus{left:12px;top:12px;background:white;padding:12px;z-index:10}@media(max-width:650px){header,footer{padding:20px}main{padding:0 20px}header{align-items:start;gap:18px;flex-direction:column}nav{gap:20px}.hero{grid-template-columns:1fr}.hero-art{display:none}.hero h1{font-size:48px}.products{grid-template-columns:1fr}.product-art{height:220px}.section-heading{align-items:start}.tag{display:none}.bag,.demo-note,footer{align-items:start;flex-direction:column}.demo-note{gap:0}.demo-note span{flex:auto}footer{gap:12px}}`,
  'shop.js': `const cart = [];
window.renderCart = function () {
  document.querySelector('#bag-count').textContent = String(cart.length);
  document.querySelector('#cart-summary').textContent = cart.length ? cart.length + ' in your bag · $' + cart.reduce((sum, item) => sum + item.price, 0) : 'Your bag is waiting for something green.';
};
document.querySelectorAll('[data-plant]').forEach(button => button.addEventListener('click', () => {
  cart.push({ name: button.dataset.plant, price: Number(button.dataset.price) });
  window.renderCart();
  document.querySelector('#cart-status').textContent = button.dataset.plant + ' added to your bag.';
}));
document.querySelector('#checkout').addEventListener('click', () => window.checkout(cart));`,
  'campaign.html':
    '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Glasshouse · Field notes</title><link rel="stylesheet" href="style.css"><link rel="stylesheet" href="brand.css"><link rel="stylesheet" href="campaign.css"><main style="padding-top:60px"><p class="eyebrow">FIELD NOTES · A SEED OF AN IDEA</p><h1>Something seasonal is taking root.</h1><p>The Autumn campaign Task is ready for your ideas.</p><a href="index.html">← Back to the collection</a></main></html>',
  'campaign.css': '/* A place for the Autumn campaign to grow. */',
};
