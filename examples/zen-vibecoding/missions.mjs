const boundaries =
  '\nWork only on the named output files in this Task and any automatic provenance metadata their tools create. Read existing files first. Do not edit the game, mark a mission complete, fabricate another agent’s work, publish, install tools or use paid services beyond this conversation. If a capability is unavailable, report it clearly. Use report_progress at meaningful milestones with your best estimate and current activity; use null when uncertain. End with the exact paths changed.';
const json = (path, fields, brief) =>
  `${brief}\nWrite ${path} as valid JSON with these fields: ${fields}.${boundaries}`;
export const missions = [
  {
    title: 'Plant one small idea',
    label: 'Seed',
    reward: 'A seed takes root. You made a change without disturbing Main.',
    description:
      'One Crux, one Task, one small win. Give your garden a name and its first living thing.',
    steps: [
      'Keep this game open in Main. In Settings → AI, enable AI Tools and connect your provider if needed; then choose a model in Collaboration. Real turns use your provider account; the game never starts them itself.',
      'Open Panels → Tasks → New task, name it “Plant a seed”, then choose “Save and start task”. Paste the prompt into that Task’s Collaboration.',
      'Let the agent finish. Return to Main: the seed should still be waiting. In the Task choose “Review changes”, then “Check combined result”. Inspect the file, check the confirmation and “Merge into Main”.',
      'Back in Main, press “Check my garden”. Keep the game in Main for all checks; a Task preview sees its own unmerged files.',
    ],
    tip: 'A Task is a separate Working Copy. An agent works inside it; reviewing and merging brings its work into Main. You can always return to this guide.',
    prompts: [
      [
        'Plant a seed',
        json(
          'garden/seed.json',
          '"name": a short garden name you invent, "color": a six-digit hex color such as "#dfa66d"',
          'Invent a charming name for our tiny garden and choose a flower color.',
        ),
      ],
    ],
    checks: [{ path: 'garden/seed.json', fields: ['name', 'color'], color: true }],
    observations: ['I checked Main before merging, then reviewed and merged the Task.'],
  },
  {
    title: 'Let two things grow',
    label: 'Parallel',
    reward: 'A pond and a tree. Two independent paths, one shared garden.',
    description:
      'Give two Tasks different jobs. Start the second while the first is still working, if you can.',
    steps: [
      'From Main, create “Shape the pond”. Send its prompt. Switch back to Main and create “Grow the tree”; send the second prompt.',
      'Switch between the two Tasks while they work. Look for “Working”, the agent’s progress bar and short status, completion feedback and the conversation attached to each Task. A percentage is an estimate; it may change when the agent learns more. If a turn finishes too quickly, that is useful feedback too.',
      'Review and merge each Task separately. Both add different files, so neither needs to overwrite the other’s work. Check the garden from Main.',
    ],
    tip: 'Parallel work is easiest when ownership is explicit: one agent owns the pond file; the other owns the tree file. No shared file to fight over.',
    prompts: [
      [
        'Shape the pond',
        json(
          'garden/pond.json',
          '"name": a pond name, "detail": one sensory sentence',
          'Design a quiet pond for the garden.',
        ),
      ],
      [
        'Grow the tree',
        json(
          'garden/tree.json',
          '"name": a tree name, "detail": one sensory sentence',
          'Invent a tree that belongs beside a quiet pond.',
        ),
      ],
    ],
    checks: [
      { path: 'garden/pond.json', fields: ['name', 'detail'] },
      { path: 'garden/tree.json', fields: ['name', 'detail'] },
    ],
    observations: [
      'I switched between the Tasks and noted whether ongoing and completed work was easy to spot.',
    ],
  },
  {
    title: 'Meet your collaborators',
    label: 'Agents',
    reward: 'Words and light arrive from two collaborators.',
    description:
      'Two Tasks are not automatically two kinds of agent. Now deliberately choose who does each job.',
    steps: [
      'From Main, create “Lantern maker” and “Garden poet”. For each Task, select the model or agent in Collaboration before sending its prompt.',
      'Try different configured models, or a built-in collaborator and an installed external agent. If only one is configured, use it in both separate Tasks and record that limitation; you can replay later.',
      'Notice which Task owns each response and which agent is selected after switching. Review and merge each result, then check from Main.',
    ],
    tip: 'There is no prize for the most expensive model. The experiment is whether assigning work, following it and understanding who did what feels clear.',
    prompts: [
      [
        'Lantern maker',
        json(
          'garden/lantern.json',
          '"name": a lantern name, "detail": its warm greeting',
          'Design a tiny lantern for our garden. Read the seed, pond and tree for context.',
        ),
      ],
      [
        'Garden poet',
        json(
          'garden/poem.json',
          '"text": a short three-line poem (use JSON newline escapes), "author": the model or agent name if known, otherwise "not reported"',
          'Read the garden files and write a playful three-line poem about them. Do not invent your provider identity.',
        ),
      ],
    ],
    checks: [
      { path: 'garden/lantern.json', fields: ['name', 'detail'] },
      { path: 'garden/poem.json', fields: ['text', 'author'] },
    ],
    observations: [
      'I selected the collaborators deliberately and recorded which ones I used in the field journal.',
    ],
  },
  {
    title: 'Listen for a little bell',
    label: 'Attention',
    reward: 'A quiet pause can be useful. Your practice leaf is still safe.',
    description:
      'A good workspace helps you notice when it needs you, even when you are somewhere else.',
    steps: [
      'From Main, create “Tend the leaf”. Use the built-in collaborator with file deletion approval enabled in its tool permissions. The only target is the supplied practice leaf.',
      'Send the prompt, then switch to Main or another Task before answering. Look for “Needs approval” on the Task. If your permissions auto-allow deletion, stop here and restore the leaf in that Task; do not merge it.',
      'Return to the waiting Task and choose “Keep”. Confirm the leaf remains. Do not merge this practice Task. Record what actually appeared, or what was missing, in the journal.',
      'Check this mission from Main. The game checks the Main leaf; it relies on your observation for the approval flow. No OS notification is promised.',
    ],
    prompts: [
      [
        'Tend the leaf',
        'Please use delete_file to remove only garden/practice-leaf.txt from this Task. Use the normal approval flow; do not bypass it, run a shell deletion, edit the game, or delete anything else. If I decline, leave it intact and acknowledge that choice. Do not merge.',
      ],
    ],
    checks: [
      { path: 'garden/practice-leaf.txt', text: 'This leaf is here for the attention lesson.' },
    ],
    observations: [
      'I declined the Task’s deletion request and checked that its practice leaf remains.',
      'I wrote down where attention appeared and whether I noticed it while elsewhere.',
    ],
    tip: 'If you cannot produce the approval prompt, record a Blocked observation and revisit this lesson. A missing cue is a finding, not a failure by you.',
  },
  {
    title: 'Build a bridge between tools',
    label: 'Tools',
    reward: 'A real handoff. Your garden has a postcard and a story.',
    description:
      'Make a field note in Notes and a picture in Media Tools, then bring the results home.',
    steps: [
      'In this same Garden, add a Notes Crux called “Garden field notes” and a Media Tools Crux called “Garden postcard”. Keep this game open so you can return to it.',
      'In Notes, use its actual editor or collaborator to write three lines about your experience. Copy or export that text into garden/field-notes.md in a new Task of this game.',
      'Make a postcard of your growing garden: use Screenshot in this game’s Workshop preview bar (it saves exports/preview.jpg), then drag that image into the Media Tools Crux. Send the conversion prompt there and inspect its PNG in exports/. The shipped FFmpeg handles this; no optional installation is required.',
      'In a Task of this game, send the handoff prompt. It discovers the actual ready output from the same Garden and copies it into garden/postcard.png. Use a PNG output. Alternatively drag the actual PNG into Artifacts at that path.',
      'Review and merge the handoff Task(s). Check Main. Open the Notes and Media Tools conversations/log to see whether the work’s origin is easy to follow.',
    ],
    prompts: [
      [
        'Make the postcard',
        'Use media_tools and probe_media to inspect the garden screenshot I added to this Media Tools Crux. Convert that actual image to a PNG named exports/garden-postcard.png using run_ffmpeg, with a maximum width of 800 pixels and the original aspect ratio. Inspect the result. Do not install tools, fetch remote images, overwrite my source or fabricate a conversion. If no image is present, ask me to add it first.',
      ],
      [
        'Bring the postcard home',
        'Discover ready outputs in this Garden using list_cruxspace_assets. Find the actual PNG made in the Crux named Garden postcard, inspect its origin, and use copy_cruxspace_asset to copy that exact output into garden/postcard.png. If it is missing, stop and explain what is missing. Do not manufacture a substitute image or claim an unperformed conversion.' +
          boundaries,
      ],
    ],
    checks: [
      { path: 'garden/field-notes.md', minText: 30 },
      { path: 'garden/postcard.png', png: true },
    ],
    observations: [
      'I used the Notes editor and ran a real Media Tools conversion; I inspected both results.',
    ],
    tip: 'A copied output is a fixed version, not a live link. Its provenance lives under cruxspace-assets/. If discovery or moving files is awkward, capture that moment.',
  },
  {
    title: 'Host a tiny garden festival',
    label: 'Festival',
    reward: 'The garden is yours. Keep playing, keep noticing, keep making it better.',
    description:
      'Your final experiment: coordinate work across Cruxes, while keeping each collaborator’s job small.',
    steps: [
      'Add a Calendar Crux called “Garden festival” to the same Garden. Pick a date and time you are happy to use for a local practice event. Nothing needs publishing or sending.',
      'In the Garden’s Collaboration (Console), send the festival prompt with your chosen date/time. It asks the Garden collaborator to delegate to the Notes and Calendar collaborators and report their real results. Select each Crux’s collaborator first. Review any approval in its owning workspace.',
      'While it works, switch into Notes and Calendar. Verify the invitation and event actually exist. Look for progress and attention cues across Cruxes. You may also run separate turns in those Cruxes to compare that flow.',
      'In a final Task of this game, write garden/festival.json with the exact titles of the Notes and Calendar Cruxes, the event time and a short reflection. Review and merge it.',
      'Check Main, then download your field journal. You have a small working project and a useful record of what felt delightful or frustrating.',
    ],
    prompts: [
      [
        'Coordinate the festival',
        'First ask me for the intended local date/time if I have not included it. Discover garden tools via list_garden_tools. Find only the existing Cruxes named Garden field notes and Garden festival in this Garden. Use the discovered run_turn tool through call_garden_tool to delegate one bounded job to each Crux’s own collaborator: append a playful garden-festival invitation in Notes; create one matching Calendar event in Calendar. Tell each collaborator to inspect existing state, use its actual Crux Tools with expected-state tokens, preserve other work and avoid duplicates on retries. run_turn waits for its result; do not claim the jobs ran concurrently unless they did. Do not do their work yourself or answer their approvals. No publishing, sending invitations, tool installations or invented success. If a tool is missing, stop and explain. Report each actual reply and where I can inspect the changes.',
      ],
      [
        'Keep the festival receipt',
        json(
          'garden/festival.json',
          '"notesCrux": the actual Notes Crux title, "calendarCrux": the actual Calendar Crux title, "eventTime": the local event date/time I verified, "reflection": my own brief reaction',
          'Ask me for the actual results and reflection. Record only what I verified; do not invent another Crux’s work.',
        ),
      ],
    ],
    checks: [
      {
        path: 'garden/festival.json',
        fields: ['notesCrux', 'calendarCrux', 'eventTime', 'reflection'],
      },
    ],
    observations: [
      'I opened both Cruxes and verified the invitation and Calendar event.',
      'I saved an observation about coordination, feedback or fun in the field journal.',
    ],
    tip: 'The receipt proves a file exists here. Your inspection establishes what happened in the other Cruxes. This game has no privileged access to them.',
  },
];

export function validateArtifact(check, bytes) {
  if (bytes.byteLength > (check.png ? 5 * 1024 * 1024 : 65536))
    return 'File exceeds the lesson size limit.';
  if (check.png)
    return [137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => bytes[i] === n)
      ? null
      : 'Expected a real PNG image.';
  const text = new TextDecoder().decode(bytes);
  if (check.text)
    return text.includes(check.text) ? null : 'The practice leaf’s original text is missing.';
  if (check.minText)
    return text.trim().length >= check.minText
      ? null
      : 'Add at least three short lines of your own notes (30 characters).';
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    return 'This file is not valid JSON yet.';
  }
  if (!value || Array.isArray(value) || typeof value !== 'object') return 'Expected a JSON object.';
  for (const field of check.fields)
    if (typeof value[field] !== 'string' || !value[field].trim() || value[field].length > 2000)
      return `Add a nonempty ${field} string (at most 2,000 characters).`;
  if (check.color && !/^#[0-9a-f]{6}$/i.test(value.color))
    return 'Use a six-digit hex color, such as #dfa66d.';
  return null;
}

export function newProgress() {
  return { version: 1, chapter: 0, completed: [], observations: {}, notes: [] };
}
export function restoreProgress(value) {
  if (
    !value ||
    value.version !== 1 ||
    !Number.isInteger(value.chapter) ||
    value.chapter < 0 ||
    value.chapter >= missions.length ||
    !Array.isArray(value.completed) ||
    !value.completed.every((n) => Number.isInteger(n) && n >= 0 && n < missions.length) ||
    !Array.isArray(value.notes) ||
    value.notes.length > 500 ||
    !value.notes.every(
      (n) =>
        n &&
        typeof n.title === 'string' &&
        typeof n.feeling === 'string' &&
        typeof n.text === 'string' &&
        typeof n.at === 'string' &&
        n.text.length <= 3000,
    )
  )
    throw Error('This is not a valid Zen of Vibecoding journal.');
  const observations = {};
  for (let i = 0; i < missions.length; i++)
    observations[i] = missions[i].observations.map((_, j) => value.observations?.[i]?.[j] === true);
  return {
    version: 1,
    chapter: value.chapter,
    completed: [...new Set(value.completed)],
    observations,
    notes: value.notes.map((n) => ({
      title: n.title.slice(0, 120),
      feeling: n.feeling.slice(0, 40),
      text: n.text,
      at: n.at.slice(0, 60),
    })),
  };
}
