/** Authoring inputs, not a runtime or a second package format. The authoring job
 * applies these through the outside MCP interface and exports real Cruxspaces. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import catalog from '../src/data/cruxspace-templates.json';
const root = resolve(__dirname, '..');
export const undertakings = catalog;
const json = (value: unknown) => JSON.stringify(value, null, 2) + '\n';
const sourceJson = (path: string, changes: Record<string, unknown>) =>
  json({ ...JSON.parse(readFileSync(resolve(root, path), 'utf8')), ...changes });
export function brief(entry: (typeof catalog)[number]) {
  return `${entry.name}\n\n${entry.description}\n\nFIRST CHANGE — on your own\n${entry.firstTask}\n\nWITH A COLLABORATOR\n${entry.collaboratorTask}\n\nFINISH LINE\n${entry.finishLine}\n\nUse Share when you choose to publish. A ready example has not been published on your behalf.\n\nEXAMPLE HISTORY\nThe worked example was authored through real file-writing and snapshot calls by Codex. Its checkpoints record those actual edits, not a simulated conversation or a record of a person's work. All named people and businesses in the sample content are fictional. Open History → Walkthrough to inspect the steps.\n\nNEXT\nMake the first change, inspect it, then save a Growth checkpoint with a name that describes the result. You can restore any earlier checkpoint.`;
}
const style = `:root{color-scheme:dark}body{margin:0;background:#101e25;color:#eef3df;font:18px/1.6 system-ui,sans-serif}main{max-width:800px;margin:auto;padding:48px 24px}h1{font-size:clamp(2.2rem,6vw,4rem);line-height:1.1}button{font:inherit;border:0;border-radius:12px;padding:12px 24px;background:#d7ee93;color:#152329;cursor:pointer}a{color:#d7ee93}.muted{color:#adc2c0}svg{width:100%;height:auto}code{font-size:.9em}p{max-width:65ch}`;
const gameHtml = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pocket game</title><style>${style}#field{height:300px;border:1px solid #729086;border-radius:18px;position:relative;background:radial-gradient(ellipse at bottom,#284f46,#142630)}#firefly{position:absolute;left:40%;top:40%;width:56px;height:56px;border-radius:50%;padding:0;box-shadow:0 0 30px #d7ee9366}#score{font-variant-numeric:tabular-nums}</style><main><p class="muted">A pocket game · made to be remixed</p><h1 id="title">Pocket game</h1><p>Catch the firefly. Use the glowing button, or focus it and press Space. Every catch moves it somewhere new.</p><p id="score" role="status" aria-live="polite"></p><div id="field"><button id="firefly" aria-label="Catch the firefly">✦</button></div><p><button id="again">Start again</button></p><p class="muted">No timer. Take your time and collect a little light.</p><script src="game.js"></script></main></html>`;
const gameJs = `fetch('game.json').then(r=>{if(!r.ok)throw Error('Could not load game settings');return r.json()}).then(config=>{document.title=config.title;document.querySelector('#title').textContent=config.title;const target=Math.max(1,Math.min(100,Number(config.target)||5));const fly=document.querySelector('#firefly'),score=document.querySelector('#score');let caught=0;function show(){score.textContent=caught>=target?'You caught them all — a little light to take with you.':caught+' / '+target+' fireflies';fly.disabled=caught>=target;}fly.onclick=()=>{caught++;fly.style.left=(10+(caught*29)%65)+'%';fly.style.top=(10+(caught*17)%65)+'%';show()};document.querySelector('#again').onclick=()=>{caught=0;show();fly.focus()};show()}).catch(e=>document.querySelector('#score').textContent=e.message);`;
const findingsHtml = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Seed trial</title><style>${style}table{border-collapse:collapse;width:100%}td,th{text-align:left;padding:8px;border-bottom:1px solid #49655e}circle{fill:#d7ee93}text{fill:#eef3df;font:14px system-ui}</style><main><p class="muted">A small question, made inspectable</p><h1>Does more light mean taller seedlings?</h1><p>This is a synthetic practice dataset. It illustrates a pattern; it is not evidence from a real experiment.</p><svg id="chart" viewBox="0 0 700 340" role="img" aria-label="Seedling height by daily hours of light"></svg><p id="finding" role="status"></p><table><thead><tr><th>Seedling</th><th>Light (hours/day)</th><th>Height (cm)</th></tr></thead><tbody></tbody></table><h2>What this does and does not tell us</h2><p>A trend in a small sample cannot establish causation. Seed type, watering, temperature and measurement differences could matter. For a real follow-up, control these conditions, randomize groups, and record every observation.</p><p><a href="observations.csv" download>Download the observations</a></p><script src="findings.js"></script></main></html>`;
const findingsJs = `fetch('observations.csv').then(r=>{if(!r.ok)throw Error('Could not load observations');return r.text()}).then(text=>{const rows=text.trim().split(/\\r?\\n/).slice(1).map(l=>l.split(',')).filter(r=>r.length===3&&r[0]&&r.slice(1).every(v=>v.trim()!==''&&Number.isFinite(Number(v)))).map(([id,x,y])=>({id,x:Number(x),y:Number(y)}));if(!rows.length)throw Error('Add at least one numeric observation.');const svg=document.querySelector('#chart'),ns='http://www.w3.org/2000/svg';function node(tag,attrs,content){const e=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,String(v));if(content)e.textContent=content;svg.append(e)}const maxX=Math.max(1,...rows.map(r=>r.x)),maxY=Math.max(1,...rows.map(r=>r.y));node('path',{d:'M 60 20 V 290 H 680',fill:'none',stroke:'#729086'});node('text',{x:270,y:330},'Daily light (hours)');node('text',{x:65,y:18},'Height (cm)');for(const r of rows){node('circle',{cx:60+r.x/maxX*580,cy:290-r.y/maxY*240,r:7});const tr=document.createElement('tr');for(const v of [r.id,r.x,r.y]){const td=document.createElement('td');td.textContent=String(v);tr.append(td)}document.querySelector('tbody').append(tr)}const avg=rows.reduce((s,r)=>s+r.y,0)/rows.length;document.querySelector('#finding').textContent=rows.length+' observations. Mean height: '+avg.toFixed(2)+' cm. The chart updates from observations.csv.'}).catch(e=>document.querySelector('#finding').textContent=e.message);`;

export function memberTemplate(id: string): string {
  return (
    {
      'home-page': 'astro-homepage',
      'small-game': 'blank',
      'short-book': 'notes',
      'small-business': 'business-page',
      'research-question': 'blank',
      'family-history': 'astro-blog',
    } as Record<string, string>
  )[id]!;
}
export function planningFiles(
  entry: (typeof catalog)[number],
  stage: number,
): Record<string, string> {
  return {
    'notebook/Start here.md': `# ${entry.name}\n\n${brief(entry)}\n`,
    'notebook/Plan.md': `# A plan you can change\n\n## Who is this for?\n${stage ? 'One interested reader, player or customer. A small useful result beats an unfinished large one.' : 'Choose one person you would like to make this for.'}\n\n## Next action\n${entry.firstTask}\n\n## Milestones\n- ${stage > 0 ? '[x]' : '[ ]'} Make the first change\n- ${stage > 1 ? '[x]' : '[ ]'} Inspect the result\n- [ ] Ask someone to try it\n- [ ] Publish when ready\n\nChecking these boxes is your judgment; it does not claim a deployment happened.\n`,
    'notebook/publish.json': json({ title: `${entry.name} — planning`, pages: [] }),
  };
}
export function projectFiles(
  entry: (typeof catalog)[number],
  stage: number,
): Record<string, string> {
  const finished = stage > 0;
  const files: Record<string, string> = {
    'START-HERE.md': `# ${entry.name}\n\n${brief(entry)}\n`,
    'AUTHORING.md':
      '# About this example\n\nOriginal sample content authored for Crux Garden by Codex through its MCP tools. The Growth checkpoints capture actual successive file revisions. They are not invented chat turns or backdated history. Names and stories are fictional; research data is synthetic. Upstream themes and their licenses remain with the Crux.\n',
  };
  if (entry.id === 'home-page')
    Object.assign(files, {
      'src/config.json': sourceJson('homepage-crux/src/config.json', {
        name: finished ? 'Moss & Morning' : 'Your name',
        tagline: finished ? 'Small useful things, made slowly.' : 'What you make, in one line.',
        about:
          stage > 1
            ? 'I make small ceramic vessels and write about the everyday rituals that make a room feel like home. This is a fictional maker’s sample page.'
            : 'Tell a reader what you make and what you care about.',
      }),
      'src/content/blog/hello.md': `---\ntitle: 'A place for small things'\npublishDate: '${new Date().toISOString()}'\ntags: [making]\ndescription: 'A first note from this home page.'\n---\n\n${finished ? 'A cup does not need to be perfect to become a favorite. This week I am working on a handle that sits comfortably between two fingers.' : 'Write a short welcome. What will someone find here, and why does it matter to you?'}\n`,
    });
  if (entry.id === 'small-game')
    Object.assign(files, {
      'index.html': gameHtml,
      'game.js': gameJs,
      'game.json': json({
        title: finished ? 'Firefly Catch' : 'My pocket game',
        target: stage > 1 ? 8 : 5,
      }),
    });
  if (entry.id === 'research-question')
    Object.assign(files, {
      'index.html': findingsHtml,
      'findings.js': findingsJs,
      'observations.csv': `seedling,light_hours,height_cm\nA,2,3.1\nB,4,5.0\nC,6,7.2\nD,8,8.8\n${finished ? 'E,10,10.9\n' : ''}${stage > 1 ? 'F,12,12.6\n' : ''}`,
    });
  if (entry.id === 'short-book')
    Object.assign(files, {
      'notebook/The first page.md': `# The first page\n\n${finished ? 'Before the street wakes, the kitchen belongs to the kettle. It clicks once, then fills the room with the sound of water becoming weather.' : 'Write one observed moment here. Start with something you can hear, see or touch.'}\n\n${stage > 1 ? 'I open the window a little. A delivery bicycle passes below; somewhere a shutter rolls up. The day arrives in small sounds before it asks anything of me.' : ''}\n`,
      'notebook/On the way home.md': `# On the way home\n\n${finished ? 'The shop on the corner has changed its sign again. The old letters left pale rectangles on the brick, like spaces in a sentence nobody has finished.' : 'Choose a second moment that changes how the first one feels.'}\n`,
      'notebook/publish.json': json({
        title: finished ? 'Small Hours' : 'My short book',
        layout: 'separate-pages',
        format: 'epub',
        pages: ['The first page.md', 'On the way home.md'],
      }),
    });
  if (entry.id === 'small-business')
    Object.assign(files, {
      ...Object.fromEntries(
        [
          'src/data/json-files/faqData.json',
          'src/pages/faq.astro',
          'src/layouts/Layout.astro',
          'UPSTREAM.md',
        ].map((path) => [path, readFileSync(resolve(root, 'business-crux', path), 'utf8')]),
      ),
      'src/pages/index.astro': `---
import settings from '../config.json';
---
<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>{settings.name}</title><meta name="description" content={settings.description}/></head>
<body><header><a href="/">{settings.name}</a><a href="#contact">Start a conversation ↗</a></header>
<main><section class="hero"><p class="eyebrow">An independent illustration studio</p><h1>{settings.name}</h1><p class="intro">{settings.description}</p><a class="button" href="#offer">A small place to start ↓</a><div class="flower" aria-hidden="true">✳</div></section>
<section id="offer"><p class="eyebrow">One useful offer</p><h2>${finished ? 'A little character for your shop.' : 'Describe the first thing someone can buy.'}</h2><p>${finished ? 'A window illustration, a shelf card and a small print, drawn as one family. We begin with your space and the story you want it to tell.' : 'Name a concrete outcome, who it helps, and what is included.'}</p><div class="steps"><article><span>01</span><h3>Talk it through</h3><p>Bring one photograph of your space and a few words about the people you welcome.</p></article><article><span>02</span><h3>Find the shape</h3><p>Review a rough direction together before working on the details.</p></article><article><span>03</span><h3>Make it yours</h3><p>Agree on the finished files and where you will use them.</p></article></div></section>
<section id="contact"><p class="eyebrow">A good beginning</p><h2>Tell us about your corner of the world.</h2><p>${finished ? 'Bloom & Ink is an imaginary studio, made as a worked example. Replace this invitation with your own contact details before sharing it as your business.' : 'Add your email address or preferred contact link here before publishing.'}</p><a href="/faq/">Questions about working together ↗</a></section></main><footer>{settings.name} · A Crux Garden worked example</footer>
<style> :global(*){box-sizing:border-box} :global(html){scroll-behavior:smooth} :global(body){margin:0;background:#f7f3e9;color:#173d32;font:18px/1.65 system-ui,sans-serif} header,main,footer{max-width:1120px;margin:auto;padding:30px} header{display:flex;justify-content:space-between;border-bottom:1px solid #b6c6a9;font-size:14px} a{color:inherit} header a:first-child{font-weight:750;text-decoration:none} section{padding:70px 0;border-bottom:1px solid #b6c6a9} .hero{position:relative;padding:90px 0 110px;overflow:hidden} h1{font-family:Georgia,serif;font-size:clamp(3rem,9vw,7rem);letter-spacing:-.06em;line-height:1;margin:24px 0} h2{font-family:Georgia,serif;font-size:clamp(2rem,4vw,3rem);line-height:1.15;max-width:750px} .intro{font-size:24px;max-width:700px} .eyebrow{text-transform:uppercase;letter-spacing:.14em;font-size:12px;font-weight:750} .button{display:inline-block;padding:12px 20px;border-radius:30px;background:#173d32;color:#f7f3e9;text-decoration:none;margin-top:20px} .flower{position:absolute;right:0;top:0;font-size:170px;color:#dd835c;z-index:-1} .steps{display:grid;grid-template-columns:repeat(3,1fr);gap:32px;margin-top:45px} .steps span{font-size:14px;color:#9d4829} footer{font-size:13px} @media(max-width:650px){.steps{grid-template-columns:1fr}header{gap:20px}.flower{display:none}} </style></body></html>`,
      'src/config.json': sourceJson('business-crux/src/config.json', {
        name: finished ? 'Bloom & Ink' : 'My small business',
        description:
          stage > 1
            ? 'Warm, hand-drawn illustrations for independent shops. Start with one window, one shelf, or one story.'
            : 'Describe one offer for one audience.',
      }),
    });
  if (entry.id === 'family-history')
    Object.assign(files, {
      'src/config.json': sourceJson('blog-crux/src/config.json', {
        title: finished ? 'The blue kitchen' : 'Our family journal',
        description: 'Places, objects and the stories we choose to keep.',
        author: 'A family storyteller',
      }),
      'content/posts/hello-from-the-garden.md': `---\ntitle: '${finished ? 'The blue kitchen' : 'A place I remember'}'\ndescription: 'A short memory about a familiar room.'\npublishDate: '${new Date().toISOString()}'\ntags: [memories]\npinned: true\n---\n\n${finished ? 'The blue in the kitchen was never quite the blue anyone remembered. In photographs it looked gray. In my aunt’s stories it was bright as a swimming pool. I remember it best at dusk, when the window reflected the table instead of the garden.' : 'Name a place, describe one object in it, and write down what you remember. Mark anything you are unsure about.'}\n\n${stage > 1 ? 'This is an invented sample, not a real family account. When writing yours, ask permission before sharing another person’s words or photographs, and keep uncertain dates labeled as estimates.' : ''}\n`,
    });
  return files;
}
