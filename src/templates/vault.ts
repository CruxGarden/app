import type { TemplateDefinition } from './index';
import type { TemplateLayout } from './index';

/** Notes layout: prominent file tree, large preview, smaller chat (20% chat | 25% files | 55% workshop) */
const LAYOUT_NOTES: TemplateLayout = {
  panes: ['collaboration', 'artifacts', 'workshop'],
  mosaic: {
    direction: 'row',
    first: 'collaboration',
    second: { direction: 'row', first: 'artifacts', second: 'workshop', splitPercentage: 30 },
    splitPercentage: 20,
  },
};

const viewerHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Vault</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css" />
  <link rel="stylesheet" href="/theme.css" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    :root {
      --bg: #0a0a0a; --bg-sidebar: #111; --bg-hover: #1a1a1a; --bg-active: #1a2a26;
      --text: #e0e0e0; --text-muted: #777; --accent: #7db3a3; --accent-hover: #a0d4c4;
      --border: #222; --surface: #151515; --radius: 6px;
    }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; background: var(--bg); color: var(--text); height: 100vh; overflow: hidden; }
    .layout { display: flex; height: 100vh; }
    .sidebar { width: 260px; min-width: 260px; background: var(--bg-sidebar); border-right: 1px solid var(--border); display: flex; flex-direction: column; overflow: hidden; }
    .sidebar-header { padding: 1rem 1rem 0.75rem; border-bottom: 1px solid var(--border); }
    .sidebar-header h1 { font-size: 0.875rem; font-weight: 600; color: var(--text); letter-spacing: 0.02em; }
    .sidebar-tree { flex: 1; overflow-y: auto; padding: 0.5rem 0; }
    .sidebar-tree::-webkit-scrollbar { width: 4px; }
    .sidebar-tree::-webkit-scrollbar-thumb { background: #333; border-radius: 2px; }
    .tree-folder { user-select: none; }
    .tree-folder-label { display: flex; align-items: center; gap: 0.375rem; padding: 0.25rem 0.75rem; font-size: 0.75rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; cursor: pointer; }
    .tree-folder-label:hover { color: var(--text); }
    .tree-folder-label .chevron { font-size: 0.625rem; transition: transform 0.15s; }
    .tree-folder.collapsed .chevron { transform: rotate(-90deg); }
    .tree-folder.collapsed .tree-folder-children { display: none; }
    .tree-file { display: block; padding: 0.3rem 0.75rem 0.3rem 1.5rem; font-size: 0.8125rem; color: var(--text-muted); text-decoration: none; cursor: pointer; border-left: 2px solid transparent; transition: all 0.1s; }
    .tree-file:hover { color: var(--text); background: var(--bg-hover); }
    .tree-file.active { color: var(--accent); background: var(--bg-active); border-left-color: var(--accent); }
    .content { flex: 1; overflow-y: auto; padding: 2.5rem 3rem; }
    .content::-webkit-scrollbar { width: 6px; }
    .content::-webkit-scrollbar-thumb { background: #333; border-radius: 3px; }
    .markdown { max-width: 720px; margin: 0 auto; line-height: 1.7; }
    .markdown h1 { font-size: 1.75rem; font-weight: 700; margin: 0 0 1rem; color: #f0f0f0; }
    .markdown h2 { font-size: 1.25rem; font-weight: 600; margin: 2rem 0 0.75rem; color: #eee; border-bottom: 1px solid var(--border); padding-bottom: 0.375rem; }
    .markdown h3 { font-size: 1.05rem; font-weight: 600; margin: 1.5rem 0 0.5rem; color: #ddd; }
    .markdown p { margin: 0 0 1rem; color: #bbb; }
    .markdown a { color: var(--accent); text-decoration: none; }
    .markdown a:hover { color: var(--accent-hover); text-decoration: underline; }
    .markdown ul, .markdown ol { margin: 0 0 1rem; padding-left: 1.5rem; color: #bbb; }
    .markdown li { margin: 0.25rem 0; }
    .markdown blockquote { border-left: 3px solid var(--accent); padding: 0.5rem 1rem; margin: 0 0 1rem; background: var(--surface); border-radius: 0 var(--radius) var(--radius) 0; color: #999; }
    .markdown code { font-family: 'JetBrains Mono', 'Fira Code', monospace; font-size: 0.85em; background: var(--surface); padding: 0.15em 0.35em; border-radius: 3px; color: var(--accent); }
    .markdown pre { margin: 0 0 1rem; border-radius: var(--radius); overflow: hidden; }
    .markdown pre code { display: block; padding: 1rem; background: var(--surface); font-size: 0.8rem; line-height: 1.6; color: #ccc; }
    .markdown table { width: 100%; border-collapse: collapse; margin: 0 0 1rem; }
    .markdown th, .markdown td { padding: 0.5rem 0.75rem; border: 1px solid var(--border); text-align: left; font-size: 0.875rem; }
    .markdown th { background: var(--surface); font-weight: 600; color: #ddd; }
    .markdown td { color: #bbb; }
    .markdown hr { border: none; border-top: 1px solid var(--border); margin: 2rem 0; }
    .markdown img { max-width: 100%; border-radius: var(--radius); margin: 0.5rem 0; }
    .markdown strong { color: #ddd; }
    .markdown mark { background: rgba(125, 179, 163, 0.25); color: var(--accent-hover); padding: 0.1em 0.2em; border-radius: 2px; }
    .markdown .tag { display: inline-block; font-size: 0.75rem; color: var(--accent); background: rgba(125, 179, 163, 0.1); padding: 0.1em 0.4em; border-radius: 3px; text-decoration: none; font-weight: 500; }
    .markdown .callout { border-left: 3px solid var(--accent); background: var(--surface); border-radius: 0 var(--radius) var(--radius) 0; padding: 0.75rem 1rem; margin: 0 0 1rem; }
    .markdown .callout-title { font-weight: 600; font-size: 0.875rem; color: var(--text); margin-bottom: 0.375rem; display: flex; align-items: center; gap: 0.375rem; }
    .markdown .callout-content { color: #999; font-size: 0.9rem; }
    .markdown .callout-content p:last-child { margin-bottom: 0; }
    .markdown .callout[data-type="warning"] { border-left-color: #f59e0b; }
    .markdown .callout[data-type="warning"] .callout-title { color: #f59e0b; }
    .markdown .callout[data-type="danger"], .markdown .callout[data-type="error"] { border-left-color: #ef4444; }
    .markdown .callout[data-type="danger"] .callout-title, .markdown .callout[data-type="error"] .callout-title { color: #ef4444; }
    .markdown .callout[data-type="tip"], .markdown .callout[data-type="hint"] { border-left-color: #22c55e; }
    .markdown .callout[data-type="tip"] .callout-title, .markdown .callout[data-type="hint"] .callout-title { color: #22c55e; }
    .markdown .callout[data-type="info"] { border-left-color: #3b82f6; }
    .markdown .callout[data-type="info"] .callout-title { color: #3b82f6; }
    .markdown .callout[data-type="question"] { border-left-color: #a855f7; }
    .markdown .callout[data-type="question"] .callout-title { color: #a855f7; }
    .markdown .embed-note { border: 1px solid var(--border); border-radius: var(--radius); padding: 1rem; margin: 0 0 1rem; background: var(--surface); }
    .markdown .embed-note h1 { font-size: 1.1rem; margin-bottom: 0.5rem; }
    .breadcrumb { font-size: 0.75rem; color: var(--text-muted); margin-bottom: 1.5rem; }
    .breadcrumb a { color: var(--text-muted); text-decoration: none; }
    .breadcrumb a:hover { color: var(--accent); }
    .breadcrumb .sep { margin: 0 0.375rem; }
    .loading { display: flex; align-items: center; justify-content: center; height: 100%; color: var(--text-muted); font-size: 0.875rem; }
    .sidebar-toggle { display: none; position: fixed; bottom: 1rem; left: 1rem; z-index: 100; width: 40px; height: 40px; border-radius: 50%; background: var(--accent); color: var(--bg); border: none; font-size: 1.25rem; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.4); }
    @media (max-width: 768px) {
      .sidebar { display: none; position: fixed; z-index: 50; height: 100%; }
      .sidebar.open { display: flex; }
      .sidebar-toggle { display: flex; align-items: center; justify-content: center; }
      .content { padding: 1.5rem 1rem; }
    }
  </style>
</head>
<body>
  <div class="layout">
    <aside class="sidebar" id="sidebar">
      <div class="sidebar-header"><h1 id="vault-title">Vault</h1></div>
      <nav class="sidebar-tree" id="tree"></nav>
    </aside>
    <article class="content" id="content"><div class="loading">Loading…</div></article>
  </div>
  <button class="sidebar-toggle" id="sidebar-toggle" aria-label="Toggle sidebar">☰</button>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
  <script>
    (function(){
      // Detect base path — published cruxes use __CRUX_BASENAME__ ('/'),
      // workspace preview uses /__preview/{cruxId}/ (derived from current URL).
      var basename=window.__CRUX_BASENAME__;
      if(!basename){
        var p=location.pathname;
        var idx=p.indexOf('/index.html');
        if(idx>0)basename=p.slice(0,idx);
        else{var parts=p.split('/').filter(Boolean);basename=parts.length>=2?'/'+parts[0]+'/'+parts[1]:'/';}
        if(!basename.endsWith('/'))basename+='/';
      }
      var manifest=null,currentPath=null;
      var renderer=new marked.Renderer();
      var IMG_EXT=/\\.(png|jpe?g|gif|svg|webp|bmp|ico|avif)$/i;
      function obsidianPreprocess(md){
        // Strip %%comments%%
        md=md.replace(/%%[\\s\\S]*?%%/g,'');
        // ==highlights== → <mark>
        md=md.replace(/==(.*?)==/g,'<mark>$1</mark>');
        // #tags (not headings) → clickable tag spans
        md=md.replace(/(^|\\s)#([a-zA-Z][\\w/-]*)/g,'$1<span class="tag">#$2</span>');
        // ![[image.png]] → standard image embed
        md=md.replace(/!\\[\\[([^\\]|]+?)(\\|([^\\]]*?))?\\]\\]/g,function(_,target,_2,alt){
          var t=target.trim();
          if(IMG_EXT.test(t))return '!['+( alt||t)+']('+t+')';
          // ![[note]] embed — render as placeholder, loaded async
          var slug=t.replace(/\\.md$/,'');
          return '<div class="embed-note" data-embed="'+slug+'">Loading '+slug+'...</div>';
        });
        // [[link#heading]] and [[link#^block]] → links with fragment
        md=md.replace(/\\[\\[([^\\]|]+)(?:\\|([^\\]]+))?\\]\\]/g,function(_,target,display){
          var t=target.trim();
          var slug=t.replace(/\\.md$/,'').replace(/#/g,'__hash__');
          var text=display?display.trim():t.split('/').pop().replace(/#.*$/,'');
          return '['+text+'](#/'+slug+')';
        });
        // Callouts: > [!type] title\\n> content
        md=md.replace(/^(> *)\\[!([a-zA-Z]+)\\]\\s*(.*)/gm,function(_,prefix,type,title){
          return prefix+'<div class="callout" data-type="'+type.toLowerCase()+'"><div class="callout-title">'+( title||type)+'</div><div class="callout-content">';
        });
        // Close callouts at end of blockquote
        var lines=md.split('\\n'),inCallout=false,out=[];
        for(var i=0;i<lines.length;i++){
          if(lines[i].indexOf('callout-content')!==-1){inCallout=true;out.push(lines[i]);continue;}
          if(inCallout&&!lines[i].match(/^>/)){ inCallout=false;out.push('</div></div>');out.push('');out.push(lines[i]);continue;}
          if(inCallout){out.push(lines[i].replace(/^> ?/,''));continue;}
          out.push(lines[i]);
        }
        if(inCallout)out.push('</div></div>');
        return out.join('\\n');
      }
      renderer.link=function(o){
        var href=o.href,text=o.text;
        if(href&&href.startsWith('#/')){
          var path=href.slice(2);
          return '<a href="javascript:void(0)" data-navigate="'+path+'">'+text+'</a>';
        }
        var t=href&&(href.startsWith('http://')||href.startsWith('https://'))?'  target="_blank" rel="noopener"':'';
        return '<a href="'+href+'"'+t+'>'+text+'</a>';
      };
      marked.setOptions({renderer:renderer,highlight:function(code,lang){if(lang&&hljs.getLanguage(lang))return hljs.highlight(code,{language:lang}).value;return hljs.highlightAuto(code).value;},gfm:true,breaks:false});
      // Strip the notes/ prefix for display; keep full path for fetching
      var NOTES_PREFIX='notes/';
      function stripPrefix(f){return f.startsWith(NOTES_PREFIX)?f.slice(NOTES_PREFIX.length):f;}
      function buildTree(files){var tree={};for(var f of files){var display=stripPrefix(f);var parts=display.split('/');var node=tree;for(var i=0;i<parts.length-1;i++){if(!node[parts[i]])node[parts[i]]={};node=node[parts[i]];}node[parts[parts.length-1]]=f;}return tree;}
      function renderTree(node,container){
        var entries=Object.entries(node).sort(function(a,b){var af=typeof a[1]==='object',bf=typeof b[1]==='object';if(af!==bf)return af?-1:1;return a[0].localeCompare(b[0]);});
        for(var[name,value]of entries){
          if(typeof value==='object'){
            var folder=document.createElement('div');folder.className='tree-folder';
            var label=document.createElement('div');label.className='tree-folder-label';label.innerHTML='<span class="chevron">▼</span> '+name;
            label.onclick=function(f){return function(){f.classList.toggle('collapsed');};}(folder);
            folder.appendChild(label);var children=document.createElement('div');children.className='tree-folder-children';renderTree(value,children);folder.appendChild(children);container.appendChild(folder);
          }else{
            var link=document.createElement('a');link.className='tree-file';link.textContent=name.replace(/\\.md$/,'');link.href='javascript:void(0)';
            var fp=stripPrefix(value).replace(/\\.md$/,'');link.dataset.path=fp;
            link.onclick=function(p){return function(e){e.preventDefault();navigateTo(p);};}(fp);
            container.appendChild(link);
          }
        }
      }
      function updateActiveLink(){document.querySelectorAll('.tree-file').forEach(function(el){el.classList.toggle('active',el.dataset.path===currentPath);});}
      function getPathFromUrl(){var path=decodeURIComponent(window.location.pathname);var base=basename.replace(/\\/$/,'');var rel=base&&path.startsWith(base)?path.slice(base.length):path;var clean=rel.replace(/^\\//,'').replace(/\\.md$/,'').replace(/index\\.html$/,'');return clean||'welcome';}
      function navigateTo(path){if(path===currentPath)return;currentPath=path;history.pushState(null,'',basename.replace(/\\/$/,'')+'/'+path);updateActiveLink();renderPage(path);}
      function renderPage(path){
        var el=document.getElementById('content');
        var filePath=manifest.files.find(function(f){var d=stripPrefix(f).replace(/\\.md$/,'');return d===path||d===decodeURIComponent(path)||f===path||stripPrefix(f)===path+'.md';});
        if(!filePath){el.innerHTML='<div class="markdown"><h1>Not Found</h1><p>No page at <code>'+path+'</code></p></div>';document.title='Not Found';return;}
        fetch(basename.replace(/\\/$/,'')+'/'+filePath).then(function(r){if(!r.ok)throw new Error(r.status);return r.text();}).then(function(md){
          md=md.replace(/^---\\n[\\s\\S]*?\\n---\\n/,'');md=obsidianPreprocess(md);
          var parts=path.split('/'),breadcrumb='';
          if(parts.length>1){breadcrumb='<div class="breadcrumb">';for(var i=0;i<parts.length;i++)breadcrumb+='<span class="sep">/</span><span>'+parts[i]+'</span>';breadcrumb+='</div>';}
          var html=marked.parse(md);el.innerHTML=breadcrumb+'<div class="markdown">'+html+'</div>';
          var h1=el.querySelector('h1');document.title=h1?h1.textContent+' — '+manifest.title:manifest.title;
          el.querySelectorAll('[data-navigate]').forEach(function(a){a.onclick=function(e){e.preventDefault();navigateTo(a.dataset.navigate);};});
          el.scrollTop=0;
          // Load note embeds (![[note]])
          el.querySelectorAll('[data-embed]').forEach(function(div){
            var slug=div.dataset.embed;
            var embedFile=manifest.files.find(function(f){return f.replace(/\\.md$/,'')=== slug||f===slug;});
            if(!embedFile){div.innerHTML='<em>Note not found: '+slug+'</em>';return;}
            fetch(basename.replace(/\\/$/,'')+'/'+embedFile).then(function(r){return r.text();}).then(function(emd){
              emd=emd.replace(/^---\\n[\\s\\S]*?\\n---\\n/,'');emd=obsidianPreprocess(emd);
              div.innerHTML=marked.parse(emd);
              div.querySelectorAll('[data-navigate]').forEach(function(a){a.onclick=function(e){e.preventDefault();navigateTo(a.dataset.navigate);};});
            }).catch(function(){div.innerHTML='<em>Failed to load '+slug+'</em>';});
          });
        }).catch(function(){el.innerHTML='<div class="markdown"><h1>Error</h1><p>Failed to load <code>'+path+'</code></p></div>';});
      }
      function init(){
        fetch(basename.replace(/\\/$/,'')+'/manifest.json').then(function(r){return r.json();}).then(function(m){
          manifest=m;document.getElementById('vault-title').textContent=m.title;document.title=m.title;
          renderTree(buildTree(m.files),document.getElementById('tree'));
          window.addEventListener('popstate',function(){currentPath=null;navigateTo(getPathFromUrl());});
          document.getElementById('sidebar-toggle').onclick=function(){document.getElementById('sidebar').classList.toggle('open');};
          navigateTo(getPathFromUrl());
        }).catch(function(){document.getElementById('content').innerHTML='<div class="markdown"><h1>Error</h1><p>Could not load manifest.json</p></div>';});
      }
      init();
    })();
  </script>
</body>
</html>`;

const template: TemplateDefinition = {
  context:
    'This is a markdown vault — a collection of .md files rendered as a navigable site with a sidebar, wiki links, and syntax highlighting. ' +
    'All notes live in the notes/ folder. The viewer (index.html) reads manifest.json for the file list. ' +
    'The manifest auto-updates when .md files change in the notes/ folder. ' +
    'Help the user add, edit, and organize their notes. Create new .md files inside notes/. ' +
    'Wiki links use [[page-name]] or [[path/to/page|display text]] syntax. ' +
    'The theme is customizable via theme.css.',
  greeting:
    "Your vault is ready. Drop your `.md` files into the **notes** folder in the file tree, or ask me to create new notes. " +
    "The sidebar and manifest update automatically. " +
    "Use `[[page-name]]` to link between notes, and edit `theme.css` to customize the look.",
  layout: LAYOUT_NOTES,
  files: [
    { path: 'index.html', content: viewerHtml },
    {
      path: 'theme.css',
      content: `/* Vault Theme — edit these variables to customize your vault */
:root {
  --bg: #0a0a0a;
  --bg-sidebar: #111;
  --bg-hover: #1a1a1a;
  --bg-active: #1a2a26;
  --text: #e0e0e0;
  --text-muted: #777;
  --accent: #7db3a3;
  --accent-hover: #a0d4c4;
  --border: #222;
  --surface: #151515;
  --radius: 6px;
}

/* Uncomment for a light theme:
:root {
  --bg: #fafafa;
  --bg-sidebar: #f0f0f0;
  --bg-hover: #e8e8e8;
  --bg-active: #d4ebe4;
  --text: #1a1a1a;
  --text-muted: #666;
  --accent: #2d8a6e;
  --accent-hover: #1f6b54;
  --border: #ddd;
  --surface: #fff;
}
*/

/* Add custom styles below */
`,
    },
    {
      path: 'manifest.json',
      content: JSON.stringify({
        title: 'My Vault',
        files: ['notes/welcome.md'],
      }, null, 2),
    },
    {
      path: 'notes/welcome.md',
      content: `# Welcome to your Vault

Drop your \`.md\` files into the **notes** folder to get started.

> [!tip] Import from Obsidian
> Drag your entire Obsidian vault folder into the \`notes\` folder in the file tree. Wiki links, callouts, image embeds, highlights, and tags are all supported. The sidebar updates automatically.

## Supported syntax

| Syntax | What it does |
|--------|-------------|
| \`[[page-name]]\` | Link to another note |
| \`[[page\\|display text]]\` | Link with custom text |
| \`[[page#Heading]]\` | Link to a heading |
| \`![[image.png]]\` | Embed an image |
| \`![[note]]\` | Embed another note inline |
| \`> [!note] Title\` | Callout (note, tip, warning, danger, info, question) |
| \`==text==\` | ==Highlighted text== |
| \`#tag\` | Inline #tag |
| \`%%comment%%\` | Hidden comment (stripped from output) |

## Customizing

Edit \`theme.css\` to change colors, fonts, and spacing. A commented-out light theme is included — just uncomment it.

## How it works

- Every \`.md\` file in the \`notes\` folder becomes a navigable page
- Subfolders become collapsible sections in the sidebar
- The manifest updates automatically — you don't need to edit it
- The viewer supports syntax highlighting, tables, task lists, and GFM
`,
    },
  ],
};

export default template;
