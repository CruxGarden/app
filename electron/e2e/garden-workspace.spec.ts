import { test, expect } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { launchApp } from './launch';
import { showPane } from './panel-helpers';
import { enterGarden, createCrux } from './multi-crux-helpers';

test('Garden Home, recursive Navigator, Crux moves and outside agents use the same graph', async () => {
  test.setTimeout(150_000);
  let instance = await launchApp();
  const dir = instance.dir;
  let client: Client | undefined;
  try {
    await enterGarden(instance.page);
    const { page } = instance;
    await expect(page.getByRole('button', { name: 'Garden location', exact: true })).toHaveText(
      'My Garden',
    );
    await expect.poll(() => new URL(page.url()).searchParams.get('garden')).not.toBeNull();
    const rootId = new URL(page.url()).searchParams.get('garden')!;
    await page.getByRole('button', { name: 'New Garden', exact: true }).click();
    await page.getByRole('textbox', { name: 'Garden name' }).fill('Observatory');
    const memberships = () =>
      page.evaluate(() =>
        window.electronAPI!.sqlite.all(
          "SELECT id, source_id, target_id FROM dimensions WHERE type = 'garden' AND kind = 'membership' ORDER BY id",
        ),
      );
    const membershipsBefore = await memberships();
    await page.evaluate(() =>
      window.electronAPI!.sqlite.run(`
      CREATE TRIGGER garden_workspace_refusal BEFORE INSERT ON dimensions
      WHEN NEW.type = 'garden' AND NEW.kind = 'membership'
      BEGIN SELECT RAISE(ABORT, 'Membership temporarily unavailable'); END
    `),
    );
    await page.getByRole('button', { name: 'Create Garden', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText(
      'Could not create the Garden. Keep the name and try Create Garden again.',
    );
    await expect(page.getByRole('textbox', { name: 'Garden name' })).toHaveValue('Observatory');
    await expect(page.getByRole('alert').locator('pre')).toBeHidden();
    await page.getByRole('alert').getByText('Technical details', { exact: true }).click();
    await expect(page.getByRole('alert').locator('pre')).toContainText('Dimension creation error');
    expect(
      await page.evaluate(() =>
        window.electronAPI!.sqlite.all("SELECT id FROM cruxes WHERE title = 'Observatory'"),
      ),
    ).toEqual([]);
    expect(await memberships()).toEqual(membershipsBefore);
    await page.evaluate(() =>
      window.electronAPI!.sqlite.run('DROP TRIGGER garden_workspace_refusal'),
    );
    await page.getByRole('button', { name: 'Create Garden', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Garden location', exact: true })).toHaveText(
      'Observatory',
    );
    const childId = new URL(page.url()).searchParams.get('garden')!;
    expect(childId).not.toBe(rootId);
    expect(
      await page.evaluate(() =>
        window.electronAPI!.sqlite.all("SELECT id FROM cruxes WHERE title = 'Observatory'"),
      ),
    ).toEqual([{ id: childId }]);
    expect(
      await page.evaluate(
        async (id) =>
          (await window.electronAPI!.sqlite.gardenMembership!.parents(id)).map(
            (parent) => parent.id,
          ),
        childId,
      ),
    ).toEqual([rootId]);
    const project = await createCrux(page, 'Night atlas');
    expect(new URL(page.url()).searchParams.get('garden')).toBe(childId);
    {
      await page.getByRole('button', { name: 'Garden location', exact: true }).click();
      await page
        .getByRole('dialog', { name: 'Garden location', exact: true })
        .getByRole('button', { name: 'Close crux', exact: true })
        .click();
    }
    await expect(page.getByRole('button', { name: 'Open Night atlas', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Navigator', exact: true }).click();
    const nav = page.getByRole('complementary', { name: 'Navigator' });
    await nav.getByRole('button', { name: 'My Garden', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Open Observatory', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open Night atlas', exact: true })).toHaveCount(
      0,
    );

    await page.getByRole('button', { name: 'Switch Crux workspace', exact: true }).click();
    const switcher = page.getByRole('dialog', { name: 'Switch Crux workspace', exact: true });
    await expect(switcher.getByRole('button', { name: /Night atlas/ })).toHaveCount(0);
    await switcher.getByRole('button', { name: 'Cancel', exact: true }).click();

    // Move explicitly between Gardens; one identity and one placement.
    await page.getByRole('button', { name: 'Add existing Crux', exact: true }).click();
    await page
      .getByRole('button', { name: 'Move Night atlas to this Garden', exact: true })
      .click();
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Open Night atlas', exact: true })).toBeVisible();
    expect(
      await page.evaluate(
        async (id) =>
          (await window.electronAPI!.sqlite.gardenMembership!.parents(id)).map(
            (parent) => parent.id,
          ),
        project,
      ),
    ).toEqual([rootId]);
    await nav.getByRole('button', { name: 'Observatory', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Open Night atlas', exact: true })).toHaveCount(
      0,
    );
    await page.getByRole('button', { name: 'Add existing Crux', exact: true }).click();
    await page
      .getByRole('button', { name: 'Move Night atlas to this Garden', exact: true })
      .click();
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Open Night atlas', exact: true })).toBeVisible();
    // Navigator is a view of the same Garden/Crux graph, not a Gardens-only menu.
    await expect(nav.getByRole('button', { name: 'Night atlas', exact: true })).toBeVisible();
    await nav.getByRole('button', { name: 'Night atlas', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(nav.getByRole('button', { name: 'Night atlas', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(nav.getByRole('button', { name: 'Night atlas', exact: true })).toBeInViewport();
    expect(new URL(page.url()).searchParams.get('garden')).toBe(childId);
    await page.screenshot({ path: 'e2e/.results/navigation-tree.png' });
    {
      await page.getByRole('button', { name: 'Garden location', exact: true }).click();
      await page
        .getByRole('dialog', { name: 'Garden location', exact: true })
        .getByRole('button', { name: 'Close crux', exact: true })
        .click();
      // Closing the Crux lands on its Garden's Home; let that workspace settle.
      await expect(page.getByTestId('pane-body-home')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Garden location', exact: true })).toHaveText(
        'Observatory',
      );
    }

    // Supporting surfaces are panels; Home and Navigator remain interactive.
    const settings = await showPane(page, 'Settings');
    await expect(settings).toBeVisible();
    await expect(nav).toBeVisible();
    await settings
      .getByRole('switch', { name: 'Agent access for Whole garden', exact: true })
      .click();
    const configPath = join(dir, 'userData', 'garden-agent-host', '.crux', 'mcp.json');
    await expect.poll(() => existsSync(configPath)).toBe(true);
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    client = new Client({ name: 'garden-graph-proof', version: '1' });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(config.url), {
        requestInit: { headers: { Authorization: `Bearer ${config.token}` } },
      }),
    );
    const call = async (name: string, args: Record<string, unknown>) => {
      const result = await client!.callTool({ name, arguments: args });
      expect(result.isError).not.toBe(true);
      return (result.content as { text: string }[]).map((item) => item.text).join('\n');
    };
    await page.getByRole('button', { name: 'Close Settings', exact: true }).click();
    const inspected = JSON.parse(
      await call('garden_graph', { action: 'inspect', gardenId: childId }),
    );
    expect(inspected.members.map((row: { id: string }) => row.id)).toContain(project);
    const agentGarden = JSON.parse(
      await call('garden_graph', { action: 'create', gardenId: childId, title: 'Darkroom' }),
    );
    const parents = JSON.parse(await call('garden_graph', { action: 'parents', cruxId: project }));
    expect(parents.map((parent: { id: string }) => parent.id)).toEqual([childId]);
    await call('garden_graph', {
      action: 'move',
      gardenId: agentGarden.id,
      cruxId: project,
      expectedParents: [childId],
    });
    const refused = await client!.callTool({
      name: 'garden_graph',
      arguments: { action: 'move', gardenId: childId, cruxId: project, expectedParents: [childId] },
    });
    expect(JSON.stringify(refused)).toContain('location changed');
    await call('garden_graph', {
      action: 'move',
      gardenId: childId,
      cruxId: project,
      expectedParents: [agentGarden.id],
    });
    await call('plant_crux', { title: 'Agent study', gardenId: agentGarden.id, template: 'blank' });
    await call('garden_graph', { action: 'open', gardenId: agentGarden.id });
    await expect(page.getByRole('button', { name: 'Garden location', exact: true })).toHaveText(
      'Darkroom',
    );
    await expect(page.getByRole('button', { name: 'Open Agent study', exact: true })).toBeVisible();
    expect(page.url()).not.toContain(childId);
    await expect(nav.getByRole('button', { name: 'Darkroom', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    // An outside agent's Crux link resolves its real container even while the
    // person is in another Garden. Canonicalization keeps just one history entry.
    const darkroomUrl = page.url();
    await call('show', { what: 'crux', cruxId: project });
    await expect(page.locator('[data-workspace-id]')).toHaveAttribute('data-workspace-id', project);
    await expect(page.getByRole('button', { name: 'Garden location', exact: true })).toHaveText(
      'Observatory',
    );
    expect(new URL(page.url()).searchParams.get('garden')).toBe(childId);
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page).toHaveURL(darkroomUrl);
    await expect(page.getByRole('button', { name: 'Garden location', exact: true })).toHaveText(
      'Darkroom',
    );
    // Agent-driven navigation and human Back/Forward share browser history.
    await call('garden_graph', { action: 'open', gardenId: childId });
    await expect(page.getByRole('button', { name: 'Garden location', exact: true })).toHaveText(
      'Observatory',
    );
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Garden location', exact: true })).toHaveText(
      'Darkroom',
    );
    await page.getByRole('button', { name: 'Forward', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Garden location', exact: true })).toHaveText(
      'Observatory',
    );
    // Moving Gardens does not discard the original open workspace.
    await nav.getByRole('button', { name: 'Observatory', exact: true }).click();
    await page.getByRole('button', { name: 'Switch Crux workspace', exact: true }).click();
    await expect(
      switcher.getByRole('button', { name: 'Close Night atlas workspace', exact: true }),
    ).toBeVisible();
    await switcher.getByRole('button', { name: 'Cancel', exact: true }).click();
    await nav.getByRole('button', { name: 'Darkroom', exact: true }).click();
    await page.screenshot({ path: 'e2e/.results/garden-workspace.png' });
    await client.close();
    client = undefined;
    await instance.app.close();
    instance = await launchApp({ dir });
    await instance.page.getByRole('button', { name: /enter/i }).click();
    await expect(
      instance.page.getByRole('button', { name: 'Open Observatory', exact: true }),
    ).toBeVisible();
    await instance.page.getByRole('button', { name: 'Open Observatory', exact: true }).click();
    await expect(
      instance.page.getByRole('button', { name: 'Open Night atlas', exact: true }),
    ).toBeVisible();
    await instance.page.getByRole('button', { name: 'Open Darkroom', exact: true }).click();
    await expect(
      instance.page.getByRole('button', { name: 'Open Agent study', exact: true }),
    ).toBeVisible();
  } finally {
    await client?.close().catch(() => {});
    await instance.app.close().catch(() => {});
  }
});
