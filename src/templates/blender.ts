import type { TemplateDefinition } from './index';
import { LAYOUT_WORKSHOP } from './index';

const template: TemplateDefinition = {
  files: [
    {
      path: 'brief.md',
      content:
        '# Modeling brief\n\nWhat are we making, where will it be used, and what should we preserve as we revise it?\n',
    },
    {
      path: 'blender/project.json',
      content: JSON.stringify({ version: 1, app: 'blender', scenePath: 'scene.blend' }, null, 2),
    },
  ],
  layout: LAYOUT_WORKSHOP,
  meta: { settings: { verifyOnDone: false } },
  greeting:
    'Make something together in Blender. Keep the editable scene, renders and game assets here, then share outputs with your Cruxspace.',
  context:
    'Blender external-app POC. Use the separately configured Blender MCP tools through Claude Code to inspect and edit the actual native scene. Inspect before editing and preserve manual contributions. Save scene.blend in this Project Folder, pack resources and save PNG/GLB outputs here. Unsaved Blender changes are not in Growth. Do not create a website to operate Blender. A headless render or local script alone does not prove live native collaboration. Never overwrite another open scene or claim connection from window placement alone.',
};
export default template;
