import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchApp } from '../launch';
import { enterGarden, createCrux } from '../multi-crux-helpers';

/**
 * Does the real Claude Code in the Collaboration pane see the crux_garden
 * MCP server? One short turn: call garden_search_tools("snapshot") and report.
 * Opt-in: CRUX_AGENT_PROBE=1 (needs a signed-in `claude`). Prints the reply
 * and the shell log's agent lines.
 */
test.skip(!process.env.CRUX_AGENT_PROBE, 'set CRUX_AGENT_PROBE=1');

test('the agent in the pane can reach the garden tools', async () => {
  test.setTimeout(10 * 60_000);
  const { app, page, dir } = await launchApp();
  try {
    await enterGarden(page);
    await createCrux(page, 'Probe');
    const body = page.getByTestId('pane-body-collaboration');
    if (!(await body.isVisible().catch(() => false)))
      await page.getByRole('button', { name: 'Toggle collaboration' }).click();
    await body.getByTestId('model-selector').click();
    await page
      .getByTestId('model-group-claude-code')
      .getByRole('button', { name: 'Claude Code' })
      .click();
    const composer = page.getByPlaceholder('Send a message...');
    await composer.fill(
      process.env.CRUX_AGENT_PROBE_MSG ||
        'List the MCP servers connected to this session by name. Then call the crux_garden tool garden_search_tools with query "snapshot" and quote its result verbatim. Nothing else.',
    );
    await composer.press('Enter');
    const stop = page.getByTestId('composer').getByRole('button', { name: 'Stop', exact: true });
    await expect(stop).toBeVisible({ timeout: 60_000 });
    const deadline = Date.now() + 6 * 60_000;
    while (Date.now() < deadline) {
      const allow = page.getByTestId('agent-approvals').getByRole('button', { name: 'Allow' });
      if (
        await allow
          .first()
          .isVisible()
          .catch(() => false)
      ) {
        console.log('approving:', await page.getByTestId('agent-approvals').innerText());
        await allow.first().click();
        await page.waitForTimeout(500);
        continue;
      }
      if (!(await stop.isVisible().catch(() => false))) break;
      await page.waitForTimeout(2000);
    }
    await page.screenshot({ path: 'e2e/.results/agent-garden-tools.png' });
    console.log('REPLY:\n' + (await body.innerText()).slice(-2500));
    const log = readFileSync(join(dir, 'userData', 'logs', 'main.log'), 'utf8');
    console.log(
      'LOG:\n' +
        log
          .split('\n')
          .filter((l) => /agent|claude|mcp/i.test(l))
          .join('\n'),
    );
  } finally {
    await app.close();
  }
});
