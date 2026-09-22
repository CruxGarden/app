import { test, expect } from '@playwright/test';
import { readdirSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { launchApp } from './launch';
import { enterGarden, createCrux } from './multi-crux-helpers';

test('real Codex discovers Garden tools and saves an Artifact from Collaboration', async () => {
  test.skip(
    process.env.CRUX_LIVE_CODEX !== '1',
    'Explicit real-provider smoke test; uses the local Codex account.',
  );
  test.setTimeout(360_000);
  const { app, page, dir } = await launchApp({ env: { CRUX_AI_MOCK: '1' } });
  console.log(`Codex live evidence profile: ${dir}`);
  // Keep bounded diagnostics even if the native provider stalls or the test is interrupted.
  // Record event kinds only, not account details or external tool payloads.
  await page.evaluate(() => {
    const evidence: { type: string; at: number }[] = [];
    (window as Window & { __codexReadinessEvents?: typeof evidence }).__codexReadinessEvents =
      evidence;
    window.electronAPI!.agent.onEvent((_runId, event) => {
      if (evidence.length < 2000) evidence.push({ type: event.type, at: Date.now() });
    });
  });
  let persistedCruxId = '';
  try {
    await enterGarden(page);
    persistedCruxId = await createCrux(page, 'Codex readiness check');
    const chat = page.getByTestId('pane-body-collaboration');
    if (!(await chat.isVisible()))
      await page.getByRole('button', { name: 'Toggle collaboration' }).click();
    await chat.getByTestId('model-selector').click();
    await page.getByTestId('model-group-codex').getByRole('button', { name: 'Codex' }).click();
    const composer = page.getByPlaceholder('Send a message...');
    await composer.fill(
      'This is an isolated product integration test, not creative demo authoring. Use garden_search_tools to discover write_file and then garden_call_tool to write a NEW file named codex-readiness.md with exactly this content: "Garden Codex connection verified." Do not use shell, external apps, web, or any other files. Do not publish. After the tool succeeds, reply exactly "GARDEN_CODEX_READY" and finish.',
    );
    await composer.press('Enter');
    // Garden combines progress text and the final response in one paragraph.
    // Match the final marker without requiring that paragraph to contain only it.
    await expect(chat.locator('p').filter({ hasText: /GARDEN_CODEX_READY$/ })).toBeVisible({
      timeout: 150_000,
    });
    await expect(chat.getByRole('button', { name: 'Stop', exact: true })).toHaveCount(0);
    const read = () => {
      const garden = join(dir, 'garden');
      const folder = readdirSync(garden).find((name) =>
        existsSync(join(garden, name, 'codex-readiness.md')),
      );
      return folder ? readFileSync(join(garden, folder, 'codex-readiness.md'), 'utf8').trim() : '';
    };
    await expect.poll(read).toBe('Garden Codex connection verified.');
    const folder = readdirSync(join(dir, 'garden')).find((name) =>
      existsSync(join(dir, 'garden', name, 'codex-readiness.md')),
    )!;
    const humanEdit = 'Garden Codex connection verified.\nHuman edit: keep this line.';
    writeFileSync(join(dir, 'garden', folder, 'codex-readiness.md'), humanEdit);
    await expect
      .poll(() =>
        page.evaluate(async (id) => {
          const artifact = await window.electronAPI!.sqlite.get(
            'SELECT fingerprint FROM artifacts WHERE resource_id = ? AND path = ?',
            [id, 'codex-readiness.md'],
          );
          return (artifact as { fingerprint: string } | null)?.fingerprint;
        }, persistedCruxId),
      )
      .toBe(createHash('sha256').update(humanEdit).digest('hex'));
    await composer.fill(
      'Read codex-readiness.md using the provided Garden tools. Preserve the human edit exactly and append one line: Agent continued the human edit. Do not use shell, external apps, web or any other files. Do not publish. Then reply exactly GARDEN_CODEX_EDITED.',
    );
    await composer.press('Enter');
    await expect(chat.locator('p').filter({ hasText: /GARDEN_CODEX_EDITED$/ })).toBeVisible({
      timeout: 150000,
    });
    await expect
      .poll(read)
      .toBe(
        'Garden Codex connection verified.\nHuman edit: keep this line.\nAgent continued the human edit.',
      );

    await page.getByRole('button', { name: 'Toggle history' }).click();
    await expect(page.getByTestId('pane-body-history')).toBeVisible();
    await expect(page.getByTestId('pane-body-history').getByText('No snapshots yet')).toHaveCount(
      0,
    );
    await page.screenshot({ path: join(dir, 'codex-readiness.png') });
    console.log(`Codex live evidence profile: ${dir}`);
  } finally {
    const evidence = await page
      .evaluate(
        () =>
          (window as Window & { __codexReadinessEvents?: { type: string; at: number }[] })
            .__codexReadinessEvents ?? [],
      )
      .catch(() => []);
    writeFileSync(join(dir, 'codex-readiness-events.json'), JSON.stringify(evidence, null, 2));
    await page.screenshot({ path: join(dir, 'codex-readiness-last.png') }).catch(() => {});
    await app.close();
  }
  const again = await launchApp({ dir, env: { CRUX_AI_MOCK: '1' } });
  try {
    await again.page.getByRole('button', { name: 'Enter', exact: true }).click();
    await expect(again.page.locator('[data-workspace-id]')).toHaveAttribute(
      'data-workspace-id',
      persistedCruxId,
    );
    const folder = readdirSync(join(dir, 'garden')).find((name) =>
      existsSync(join(dir, 'garden', name, 'codex-readiness.md')),
    )!;
    expect(readFileSync(join(dir, 'garden', folder, 'codex-readiness.md'), 'utf8').trim()).toBe(
      'Garden Codex connection verified.\nHuman edit: keep this line.\nAgent continued the human edit.',
    );
  } finally {
    await again.app.close();
  }
});
