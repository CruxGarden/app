import { getServices } from '@/services';
import { createTask, prepareTaskReview, verifyTaskReview, applyTaskReview } from '@/services/tasks';
import { openWorkspace } from '@/stores/workspaceRegistry';
import { files, brand, accessibility, checkout, guide } from './content';

/** A normal Crux/Task graph, authored locally. Never starts an AI turn. */
export async function createTendingDemo(progress: (message: string) => void = () => {}) {
  const services = getServices();
  progress('Planting Glasshouse…');
  const main = await services.crux.create({
    title: 'Glasshouse · Tending demo',
    type: 'workspace',
    description:
      'One plant shop, several ideas growing at once. An offline, scripted Tending demo.',
    meta: {
      demo: {
        name: 'glasshouse',
        version: 1,
        provenance: 'Scripted demo; no AI ran during setup.',
      },
      messages: [
        {
          role: 'assistant',
          content: guide,
          model: 'Scripted demo',
          timestamp: new Date().toISOString(),
        },
      ],
    },
  });
  const write = (id: string, path: string, content: string) =>
    services.artifact.create({ resourceId: id, content, meta: { path } });
  try {
    for (const [path, content] of Object.entries(files)) await write(main.id, path, content);
    progress('Growing the first branch and merge…');
    const foundation = await createTask(
      main.id,
      'Brand foundation',
      'Scripted demo brief: give Glasshouse its paper, leaf and forest palette.',
    );
    await write(foundation.id, 'brand.css', brand);
    const fw = await openWorkspace(foundation.id);
    fw.data.getState().addMessage({
      role: 'assistant',
      model: 'Scripted demo',
      content:
        'Scripted demo result: the brand palette and italic headline are ready in brand.css. This branch is merged during demo setup.',
    });
    await fw.data.getState().saveMeta();
    const review = await prepareTaskReview(foundation.id);
    await verifyTaskReview(review.id);
    await applyTaskReview(review.id);

    const results: string[] = [];
    for (const [title, path, content, explanation] of [
      [
        'Checkout',
        'checkout.js',
        checkout,
        'Add a plant, try demo checkout, and check the empty-bag message. Main still has the unfinished checkout. No order or payment leaves this page.',
      ],
      [
        'Accessibility',
        'accessibility.css',
        accessibility,
        'Tab through the preview to see focus rings and larger targets. Reduced-motion preferences are respected. These are targeted improvements, not a completed accessibility audit.',
      ],
    ]) {
      progress(`Preparing ${title}…`);
      const task = await createTask(
        main.id,
        title!,
        `Scripted demo brief: finish ${title!.toLowerCase()} independently, changing only ${path}.`,
      );
      await write(task.id, path!, content!);
      const w = await openWorkspace(task.id);
      w.data.getState().addMessage({
        role: 'assistant',
        model: 'Scripted demo',
        content: `Scripted demo result (no AI ran): ${explanation}\n\nChoose Review changes to inspect and merge this Task into Main.`,
      });
      await w.data.getState().refreshArtifacts();
      await w.data.getState().createSnapshot({ label: `${title} · scripted result`, silent: true });
      const tip = w.data.getState().growths[0]?.targetId;
      const now = new Date().toISOString();
      w.data.getState().setTurnJob({
        id: crypto.randomUUID(),
        cruxId: task.id,
        model: 'Scripted demo',
        status: 'done',
        prompt: `Scripted ${title} example`,
        startedAt: now,
        endedAt: now,
        currentStep: 0,
        plan: {
          explicit: false,
          steps: [{ title: `Prepare ${path}`, status: 'done', snapshotId: tip }],
        },
        snapshotIds: tip ? [tip] : [],
      });
      await w.data.getState().persistTurnState();
      results.push(task.id);
    }
    progress('Leaving room for your next idea…');
    const campaign = await createTask(
      main.id,
      'Autumn campaign',
      'Demo brief, not yet started: create an autumn collection in campaign.html and campaign.css. Keep the shop and cart working. Send a message to your configured collaborator when you want to begin.',
    );
    progress('Glasshouse is ready. Open a Task to explore, review and merge.');
    return {
      cruxId: main.id,
      foundationId: foundation.id,
      resultIds: results,
      campaignId: campaign.id,
    };
  } catch (error) {
    throw new Error(
      `Glasshouse setup stopped: ${error instanceof Error ? error.message : String(error)}. The partial demo is saved in your Home Garden.`,
      { cause: error },
    );
  }
}
