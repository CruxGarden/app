import { getServices } from '@/services';
import { getSetting, setSetting } from '@/services/settings';
import { loadTemplate } from '@/templates';
import { SettingsKey } from '@/lib/constants';

/**
 * Seed the "Tutorial - The Board" crux into a new garden.
 * Runs once — sets a flag in settings so it doesn't re-run.
 */
export async function seedTutorialCrux(): Promise<void> {
  if (getSetting(SettingsKey.TutorialSeeded)) return;

  const { crux: cruxService, artifact: artifactService } = getServices();

  // Check if garden already has cruxes (returning user, imported data, etc.)
  const existing = await cruxService.listAll();
  if (existing.length > 0) {
    setSetting(SettingsKey.TutorialSeeded, 'true');
    return;
  }

  const template = await loadTemplate('board');
  if (!template) {
    setSetting(SettingsKey.TutorialSeeded, 'true');
    return;
  }

  const slug = 'tutorial-the-board';

  const crux = await cruxService.create({
    slug,
    title: 'Tutorial - The Board',
    type: 'workspace',
    kind: 'webapp',
    data: '',
    meta: {
      messages: [
        {
          role: 'assistant',
          content: template.greeting,
        },
      ],
      summary: null,
      settings: {
        model: 'claude-sonnet-4-20250514',
        systemPrompt: template.context,
      },
    },
  });

  // Create the template files as artifacts
  for (const file of template.files) {
    await artifactService.create({
      resourceId: crux.id,
      content: file.content,
      meta: { path: file.path },
    });
  }

  setSetting(SettingsKey.TutorialSeeded, 'true');
}
