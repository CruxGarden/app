#!/usr/bin/env python3
"""Build the offline story guide and fail on unmapped baseline/catalog surfaces."""
import json
import re
import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent
APP = HERE.parents[1]
ROOT = APP.parent
stories = json.loads((HERE / 'story-scenarios.json').read_text())
by_id = {s['id']: s for s in stories}
assert len(by_id) == len(stories)
for s in stories:
    s['checks'] = []
    s['sources'] = []

old = (HERE / 'V1-TESTING-GUIDE.md').read_text()
checks = []
for m in re.finditer(r'^- \[ \] \*\*([^*]+)\*\* — (.*?)\n\n  \*\*Expected:\*\* (.*?)\n\n  \*\*Needs:\*\* (.*?)\. \*\*Result / notes:', old, re.M | re.S):
    checks.append(dict(id=m[1], action=m[2].strip(), expected=m[3].strip(), needs=m[4].strip(), origin='Original detailed guide'))
assert len(checks) == len(re.findall(r'^- \[ \] \*\*', old, re.M)), 'Unparsed original checks'

# These earlier specifications need their scope corrected before being reused.
patches = {
 'FUNC-03': ('Create a scheduled Function rule on a disposable published Crux using the full API. Inspect its admitted next/last run; remove it afterward.', 'The full API runs the admitted schedule and removal stops it. Desktop preview alone does not prove server cron.', 'Full API / publication'),
 'FUNC-05': ('Exercise a supported HTTP handler with query/body data and response/error cases on a test publication; compare only the capabilities exposed by desktop preview.', 'Methods, input and responses work on the full API. Differences or unavailable preview operations are explicitly recorded, not assumed parity.', 'Full API'),
 'FUNC-08': ('Through the configured Function runtime, request one allowed test endpoint and one denied endpoint.', 'Its documented egress policy is effective and errors are clear. Record the runtime; browser CORS and server isolation are different boundaries.', 'Test endpoints / full API'),
 'SCHED-10': ('Close to the menu bar where enabled, switch away from the owner Garden, sleep and restart around a due time; inspect next/last run.', 'Record the local scheduler’s actual owner/foreground/sleep limits and missed-run policy. A quit desktop is not a hosted scheduler and should not imply ongoing execution.', 'Desktop'),
}
for c in checks:
    if c['id'] in patches:
        c['action'], c['expected'], c['needs'] = patches[c['id']]
        c['origin'] = 'Original guide, corrected to current runtime boundary'

# Current app-owned choices + manifest tools, not an assumed historical count.
picker = (APP / 'src/components/garden/NewCruxModal.tsx').read_text()
own_text = picker.split('const OWN_TEMPLATES: Template[] = [')[1].split('const templates =')[0]
current_ids = set(re.findall(r"id: '([^']+)'", own_text)) - {'garden'}
assert 'FIVE_WS_TEMPLATE_ID' in own_text
current_ids.add('5ws')
manifest_paths = sorted(APP.glob('*-crux/crux-tool.json'))
manifests = {json.loads(p.read_text())['id']: (p, json.loads(p.read_text())) for p in manifest_paths}
current_ids.update(manifests)

goals = dict(line.split('|',1) for line in '''blank|make a tiny interactive page from scratch
notes|write a notebook and turn selected pages into a book
blender|bring a real 3D scene into my creative project
figma|use an existing design alongside my Garden work
moqira|plan an interface before building it
tool-excalidraw|explain an idea with a drawing
tool-univer|calculate and organize information in a spreadsheet
tool-tables|keep a useful structured collection
tool-smplr|make a rhythmic loop
tool-playcanvas|explore a small interactive 3D scene
cardinal-drone|shape a sound patch I can return to
order-desk|collect and process simple orders
private-requests|collect a private editable request from each customer
onebigsky|play and personalize a small game
astro-empty|build a website with real routes and assets
astro-homepage|give my work a home on the web
astro-blog|write a blog people can navigate
astro-recipes|keep and share my recipes
astro-storefront|present products with clear prices and destination links
digital-garden|connect my notes into a browsable knowledge garden
business-page|explain my business and how to contact me
resume|make a readable and printable résumé
photo-gallery|show a coherent collection of photographs
astro-feed|publish a stream of updates
astro-media|share a collection of audio and video
5ws|play a question game built around my own shelf
abc-app|compose a short piece in music notation
am-1-app|create a layered arpeggio
 audiomass-app|edit a clean audio clip
beepbox-app|compose a short chiptune
bentopdf-app|prepare a usable PDF from my documents
bitsy-app|tell a small playable story
blockbench-app|make a reusable 3D model
eventcalendar-app|plan events on a calendar
fmg-app|draw a world for a story or game
formjs-app|collect structured responses with a form
gdevelop-app|build a game with visible rules and events
gephi-app|understand a network visually
glsl-app|make a moving visual with a shader
glyphr-app|design a reusable typeface
hextris-app|play and customize a puzzle
jscad-app|design a parametric object
jupyterlite-app|explore data in an editable notebook
kan-app|plan a project on a board
ketcher-app|draw a chemical structure
link-app|keep a useful reference beside my work
maps-app|tell a story with places
media-app|convert media into a usable format
mermaid-app|explain a system with a diagram
minipaint-app|edit and compose an image
opencut-app|assemble a short video
openmosh-app|make a deliberate glitch visual
p5-app|build a creative coding sketch
pdfme-app|lay out a printable document
piskel-app|make a small animated sprite
playcanvas-editor-app|build an editable interactive 3D project
pptist-app|present an idea as a slide deck
rawgraphs-app|turn a dataset into a meaningful chart
recorder-app|record an idea or demonstration
runner-app|run a project script in the intended folder
signal-app|compose an editable song
stack-app|keep several related outputs together
svgedit-app|make a scalable illustration
timeline-app|explain a sequence of events
twine-app|write an interactive branching story
underrun-app|play and remix a small shooter
web-synth-app|build and sequence a synth patch
wick-editor-app|make a short interactive animation'''.strip().splitlines())
goals = {k.strip():v for k,v in goals.items()}

for c in checks:
    if c['id'].startswith('TOOL-'):
        tid = c['id'][5:]
        assert tid in current_ids, f'Old tool requires a disposition: {tid}'
        name, exercise = c['action'].split(' — ',1)
        name = name.split(' [')[0]
        s = dict(id='MAKE-'+tid, chapter='10 · Make something with every creative tool', title='I can '+goals[tid], goal=f'I want to {goals[tid]}, keep the editable original and use the result outside this session.', needs=c['needs'], steps=[f'Create a disposable {name} Crux. Read Tool Info and any installation requirement.', exercise, 'Continue by hand after one optional real-agent contribution where exposed; reopen the native document after a restart.', 'Export a complete archive, import in a second installation and edit again. Open a supported output independently.'], proof=[c['expected'].split(' Complete the tool recipe:')[0], 'The editable original survives alongside any rendered output.', 'Unsupported publishing, native formats or agent controls are identified explicitly.'], twist='Use the specific edge cases below; cancel or refuse one destructive operation. Never substitute a screenshot for proof of editable state.', prefix='',route='tools',checks=[c],sources=['docs/manual-testing/V1-TESTING-GUIDE.md#tools'], toolId=tid, toolName=name)
        if tid in manifests:
            path, manifest = manifests[tid]
            s['needs'] = ('Optional installation/catalog; ' if not manifest['bundled'] else 'Bundled tool; ') + c['needs']
            s['promise'] = manifest.get('greeting','')
            s['declaredScope'] = manifest.get('context','')
            s['sources'].append(str(path.relative_to(ROOT)))
            s['shareRule'] = 'The manifest offers website sharing; verify the actual visitor result.' if manifest.get('share') else 'The manifest does not offer website sharing. Check supported native/export routes instead.'
        else:
            s['sources'].append('app/src/components/garden/NewCruxModal.tsx')
        for suffix,action,expected in [
          ('MANUAL','Make the intended result using the native editor’s own controls, with AI off.','Real native content exists and can be edited again; no empty shell or required AI gate.'),
          ('DEPTH','Walk every visible top-level menu, toolbar, inspector, document setting and context menu for this tool. Exercise each applicable command on test content; list individual omissions or unsupported options in notes.','No visible capability is silently skipped. Record command names, expected outcomes and a reason for every unavailable or untested branch.'),
          ('AGENT','Where exposed, ask a real collaborator to inspect, change one supported property and preserve your earlier edit; then edit again manually.','Actual native state and response agree. Unsupported agent operations are recorded, not imagined.'),
          ('HISTORY','Mark a version, make a clearly different edit, restore the earlier version and inspect the native document.','The intended recoverable document is restored, not only its preview image.'),
          ('PORTABLE','Quit/reopen, then export with runtimes included and import into another isolated installation. Edit the imported native document.','Document, original assets and necessary dependencies are present; external connections identify what does not travel.'),
          ('OUTPUT','Produce every output format offered for this tool, then open each in an independent viewer; inspect website output only if supported.','The outputs match the current project and scope. Record each format separately; unavailable formats have a reason.'),
        ]:
            s['checks'].append(dict(id=f'CREATIVE-{tid}-{suffix}',action=action,expected=expected,needs=s['needs'],origin='Complete creative-tool story'))
        stories.append(s)
    else:
        matches = [s for s in stories if s['prefix'] and c['id'].split('-')[0] == s['prefix']]
        assert len(matches)==1, f'Unmapped or ambiguous check: {c["id"]}'
        matches[0]['checks'].append(c)

# The Shelf game has visitor behavior beyond the generic editor recipe.
five_ws=next(s for s in stories if s.get('toolId')=='5ws')
five_ws['needs']='Astro setup; real supported provider/key for live play; full API and test identity for daily board'
five_ws['sources'].append('app/src/templates/5ws.ts')
for n,(action,expected) in enumerate([
 ('Curate shelf.json and try the supplied alternative shelf; update a figure/voice/source and browse the shelf and transcript pages.', 'The selected Shelf determines the round and site content. Curator conversation remains separate from the hidden character; schema errors preserve editable source.'),
 ('Open /play, connect a test provider in the visitor browser and play a winning, losing, timed-out and cancelled round; export the resulting transcript and try another round.', 'Question/time limits, final reveal, score and saved transcript agree with the actual round. Missing/refused provider access gives a useful error; keys stay private and do not travel in shared transcripts.'),
 ('On a test publication, play the daily round signed out and signed in, inspect the board, then fork and repeat; try light/dark, sound and sharing the result.', 'Daily selection and counted-score policy are explained; the fork owns its own board. Visitor auth and Crux Store availability are required for their respective operations, not faked by local preview.'),
],1):
    five_ws['checks'].append(dict(id=f'FIVEWS-{n}',action=action,expected=expected,needs=five_ws['needs'],origin='Current Shelf game and visitor routes'))

# Newly added choices have first-class stories instead of being dropped from an old snapshot.
new_choices={'hello-world':'HELLO','documentation':'HELP','zen-vibecoding':'ZEN','tool-starter':'COMMUNITY-TOOL','private-requests':'PRIVATE-REQUESTS'}
for tid,sid in new_choices.items():
    s=by_id[sid]
    s['toolId']=tid
    s['checks'].append(dict(id='CREATION-'+tid, action=f'Create a fresh {tid} project; customize it, restart, export/import it and continue in a second test installation.', expected='The current starter is usable and portable, distinct from any older existing user copy. For Documentation, verify editable source, search, blog and copied-site build; for Zen use real missions; for Hello, world use name/photo and the single public page.', needs=s['needs'],origin='Current creation catalogue'))
    s['sources'].append('app/src/templates/'+tid+'.ts')

# Six distinct undertaking outcomes, kept testable individually.
undertakings=json.loads((APP/'src/data/cruxspace-templates.json').read_text())
for u in undertakings:
    by_id['UND']['checks'].append(dict(id='UNDERTAKING-'+u['id'],action=f'{u["name"]}: {u["firstTask"]} Then continue toward: {u["finishLine"]} Optional real collaboration: {u["collaboratorTask"]}',expected='Keep your own editable result and distinguish it from the worked example. Verify both example-beside and example-as-start paths, restart and complete Garden export/import.',needs='Relevant starter dependencies; AI only for optional collaborator step',origin='Current Undertaking catalogue'))

# Read each registry row independently: layout profiles now precede its label.
pane_source=(APP/'src/components/workspace/paneConfig.ts').read_text()
pane_rows=re.findall(r"^  (\w+): \{\n([\s\S]*?)^  \},",pane_source,re.M)
panes=[]
for pid,body in pane_rows:
    label=re.search(r"^    label: '([^']+)'",body,re.M)
    assert label, f'Panel {pid} has no documented label'
    panes.append((pid,label[1]))
pane_stories=dict(tasks='TASKS',history='VERSIONS',collaboration='CHAT',artifacts='FILES',workshop='WORKSHOP',details='DETAILS',sync='SYNC',publish='SHARE',export='EXPORT',store='STORE',media='MEDIA',mood='MOODS',synth='SOUND',browser='BROWSER',settings='AISET',explore='EXPLORE',home='HOME',console='KEEPER',navigator='GARDENS',tending='ATTENTION')
assert set(pane_stories)=={k for k,_ in panes},f'Unmapped panels: {set(pane_stories) ^ {k for k,_ in panes}}'
for pid,label in panes:
    by_id['PANELS']['checks'].append(dict(id='PANEL-'+pid,action=f'Open {label} from the picker and through an offered shortcut/search path; move, resize, hide, pin and reopen it.',expected=f'Panel ownership, focus, minimum size, color and state are correct. Compare Normal and Advanced layouts: primary actions remain usable, optional controls are discoverable when appropriate, and toggling modes preserves drafts. Complete the actual purpose in story {pane_stories[pid]}.',needs='Enable AI for collaboration-only panels',origin='Current panel registry'))

settings_map=dict(AppearanceSettings='MOODS',StartSettings='COMFORT',LibrarySettings='COMFORT',AccountSettings='ACCOUNT',PlanSettings='BILLING',UsageSettings='BILLING',AiSettings='AISET',MemorySettings='AISET',AgentsSettings='AGENTS',DesktopSettings='UPDATE',DataSettings='DATA',SyncSettings='SYNC',NamesSettings='PANELS',WorkspaceLayoutsSettings='PANELS')
actual_settings=set(re.findall(r'<(\w+Settings)\b',(APP/'src/components/settings/Settings.tsx').read_text()))
assert actual_settings == set(settings_map), f'Unmapped Settings sections: {actual_settings ^ set(settings_map)}'
for component,sid in settings_map.items():
    by_id[sid]['checks'].append(dict(id='SETTINGS-'+component,action=f'Inspect every control in the {component.replace("Settings", "")} settings section, including collapsed and Advanced options. Change, cancel/reset and restart as appropriate.',expected='Each setting has a clear effect, scope and persistence. Record individual unsupported/untested settings by name; do not mark the section passed after only opening it.',needs=by_id[sid]['needs'],origin='Current Settings composition'))

models=re.findall(r"id: '([^']+)',\s*name: '([^']+)',\s*contextWindow:",(APP/'src/ai/providers.ts').read_text())
models+= [('claude-code','Claude Code'),('codex','Codex')]
for mid,name in models:
    by_id['PROVIDERS']['checks'].append(dict(id='MODEL-'+mid,action=f'{name}: select this model/route and perform a real streamed read → edit → reply, then a stop/refusal case in a disposable project.',expected='Selected route, actual artifact, errors and billing/allowance explanation agree. Record model ID, provider, build and spend; fixture passes do not count.',needs='Applicable credentials/subscription/local setup and small explicit test budget',origin='Current provider catalogue'))

# The palette is a public entry point; new commands must acquire an outcome here.
palette_path=APP/'src/components/layout/CommandPalette.tsx'
palette=palette_path.read_text()
command_map={
 'garden-home':('HOME','Return from a Crux to its owning Garden.'),
 'setup-again':('INSTALL','Reopen Customize workspace, walk through the setup choices, and confirm existing projects remain intact.'),
 'advanced-mode-settings':('COMFORT','Open Advanced Mode settings, switch levels and confirm the panels adapt while existing work and AI preferences remain intact.'),
 'field-guide':('HELP','Open Help and field guide, follow a topic and return to the same work.'),
 'new-crux':('CREATE','Create one project from Garden Home and one while a Crux is open; cancel another attempt.'),
 'new-task':('TASKS','Start a Task from the correct source Crux; ensure it is not offered without a Crux.'),
 'mark-version':('VERSIONS','Mark a version and follow the confirmation to inspect the actual Growth entry.'),
 'share':('SHARE','Open Share for the intended Crux; inspect readiness and published address.'),
 'export':('EXPORT','Open Export for the intended Crux and produce a usable archive.'),
 'find-navigator':('GARDENS','Find a nested Garden/Crux without losing your active work.'),
 'explore-search':('EXPLORE','Type a search and carry that query into Explore.'),
 'theme':('MOODS','Switch light/dark and verify panels, native frames and readable contrast.'),
 'settings':('AISET','Open Settings, change a disposable preference and return.'),
 'find':('GARDENS','Search exact/partial/Unicode names, open the correct owner and try an empty result.'),
 'workspace':('PANELS','Switch between several open workspaces and inspect independent drafts and focus.'),
 'pane':('PANELS','Show and hide each available panel by its default and customized Names; repeat with AI off.'),
 'mood':('MOODS','Find and wear bundled and saved Moods by name; verify preview versus Keep for Garden ownership.'),
 'shortcuts':('DESKTOP-BASICS','Open Keyboard shortcuts and compare the list with what the keys do.'),
 'report-problem':('DESKTOP-BASICS','Open Report a problem and read what would be shared before anything opens.'),
 'about':('DESKTOP-BASICS','Open About and read the version, links and open-source notices.'),
}
actual_commands=set(re.findall(r"id: '([^']+)'",palette))|set(re.findall(r'id: `([^:]+):',palette))
assert actual_commands==set(command_map),f'Unmapped palette commands: {actual_commands ^ set(command_map)}'
for cid,(sid,exercise) in command_map.items():
    by_id[sid]['checks'].append(dict(id='COMMAND-'+cid,action='Use the command palette with keyboard only: '+exercise,expected='The command is discoverable in the appropriate scope, acts on the intended work and returns useful focus. Escape/cancel performs no action. A hidden or disabled operation has an understandable reason.',needs=by_id[sid]['needs'],origin='Current command palette'))
    by_id[sid]['sources'].append(str(palette_path.relative_to(ROOT)))

for story in stories:
    for i,c in enumerate(story.pop('extraChecks',[]),1):
        story['checks'].append(dict(id=f'{story["id"]}-DETAIL-{i}',action=c[0],expected=c[1],needs=story['needs'],origin='Current control-level acceptance'))

# Attach story-specific promises as separate results, including new surfaces absent from the old guide.
for s in stories:
    if not s['sources']: s['sources']=['docs/manual-testing/V1-TESTING-GUIDE.md', 'ROADMAP.md']
    for i,p in enumerate(s['proof'],1):
        s['checks'].insert(i-1,dict(id=f'{s["id"]}-OUTCOME-{i}', action=p,expected='Demonstrate this outcome with your own test result; retain a file, screenshot, URL or exact observation.',needs=s['needs'],origin='User-story finish line'))

mapped_creations={s['toolId'] for s in stories if s.get('toolId')}
assert current_ids == mapped_creations, f'Creation gaps: {current_ids ^ mapped_creations}'
all_checks=[c for s in stories for c in s['checks']]
assert len({c['id'] for c in all_checks})==len(all_checks), 'Duplicate criterion IDs'
assert {c['id'] for c in checks} <= {c['id'] for c in all_checks}
core=[s for s in stories if s.get('core')]
ledger=dict(coreStories=len(core),coreCriteria=sum(len(s['checks']) for s in core),baselineChecks=len(checks),baselineMapped=len(checks),creationChoices=len(current_ids),creationMapped=len(mapped_creations),panels=len(panes),settings=len(settings_map),undertakings=len(undertakings),models=len(models),commands=len(command_map),stories=len(stories),criteria=len(all_checks),unmapped=0,
            panelMap=[dict(id=k,label=v,story=pane_stories[k]) for k,v in panes],settingsMap=settings_map)
def revision(repo):
    try:
        return subprocess.check_output(['git', '-C', str(repo), 'rev-parse', '--short=9', 'HEAD'], text=True, stderr=subprocess.DEVNULL).strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        return 'not available in this checkout'
data=dict(schema=1,edition='2026-10-04',appCommit=revision(APP),apiCommit=revision(ROOT / 'api'),stories=stories,ledger=ledger)
payload=json.dumps(data,ensure_ascii=False).replace('</','<\\/')
html=(HERE/'story-guide.template.html').read_text().replace('/*__DATA__*/',payload)
assert '/*__DATA__*/' not in html
(HERE/'v1-user-stories.html').write_text(html)
(HERE/'story-coverage.json').write_text(json.dumps(ledger,indent=2,ensure_ascii=False)+'\n')
print(json.dumps({k:v for k,v in ledger.items() if k not in ['panelMap','settingsMap']},indent=2))
