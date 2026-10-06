import { expect, type Page } from '@playwright/test';
export async function addGardenConnection(page: Page, name = 'Test agent') {
  const section = page.getByRole('region', { name: 'Whole garden connections' });
  await section.getByLabel('Connection name', { exact: true }).fill(name);
  await section.getByRole('button', { name: 'Add connection', exact: true }).click();
  const snippet = section.getByTestId('agents-snippet');
  await expect(snippet).toBeVisible();
  const text = await snippet.innerText();
  const url = /http:\/\/127\.0\.0\.1:\d+\/mcp/.exec(text)?.[0];
  const token = /cg_[A-Za-z0-9_-]+/.exec(text)?.[0];
  if (!url || !token) throw new Error('Connection setup did not contain a local URL and token');
  return { url, token };
}
