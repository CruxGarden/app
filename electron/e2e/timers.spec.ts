import { test, expect } from '@playwright/test';
import { launchApp } from './launch';
import { enterGarden } from './multi-crux-helpers';

/**
 * Timers and Mood schedules (GARDEN-SCHEDULER-PLAN): a pomodoro built from
 * the preset with one-minute phases counts down in the TopBar, pauses and
 * resumes, and alerts when Focus ends; a second timer starts itself when
 * the first changes phase; wearing Ember Horizon brings its dusk schedule
 * along, marked as the Mood's and behind the Mood switch, and it goes when
 * another Mood is worn.
 */
test('a pomodoro counts down in the TopBar, chains a second timer, and a Mood brings its schedules', async () => {
  test.setTimeout(240_000);
  const { app, page } = await launchApp();
  try {
    await enterGarden(page);
    await page.locator('header').getByRole('link', { name: 'Tending' }).click();
    const section = page.getByTestId('schedules');
    const openForm = () => section.getByRole('button', { name: 'Schedule…' }).click();
    const add = () => page.getByRole('button', { name: 'Add', exact: true }).click();

    // 1. The Pomodoro preset, shortened to one-minute phases so the test can see a change.
    await openForm();
    await page.getByLabel('Title', { exact: true }).fill('Pomodoro');
    await page.getByLabel('When', { exact: true }).selectOption('timer');
    await expect(page.getByLabel('Phase 1 name')).toHaveValue('Focus');
    await expect(page.getByLabel('Phase 2 name')).toHaveValue('Break');
    await expect(page.getByLabel('Rounds')).toHaveValue('4');
    await page.getByLabel('Phase 1 minutes').fill('1');
    await page.getByLabel('Phase 2 minutes').fill('1');
    await page.getByLabel('Rounds').fill('1');
    await page.getByRole('button', { name: '+ Play a cue' }).click();
    await add();
    const pomodoro = section.getByTestId('schedule').filter({ hasText: 'Pomodoro' });
    await expect(pomodoro).toContainText('Focus 1 · Break 1 × 1');
    await expect(page.getByTestId('timer-chip')).toHaveCount(0);

    // 2. A second timer that starts itself when a timer changes phase.
    await openForm();
    await page.getByLabel('Title', { exact: true }).fill('Stretch');
    await page.getByLabel('When', { exact: true }).selectOption('timer');
    await page.getByLabel('Preset').selectOption('egg');
    await expect(page.getByLabel('Phase 1 name')).toHaveValue('Timer');
    await page.getByLabel('Phase 1 minutes').fill('1');
    await page.getByLabel('Starts').selectOption('timerPhase');
    await add();
    const stretch = section.getByTestId('schedule').filter({ hasText: 'Stretch' });
    await expect(stretch).toContainText('starts when a timer changes phase');

    // 3. Start, pause, resume: the chip in the TopBar shows the phase and the countdown.
    await pomodoro.getByRole('button', { name: 'Start' }).click();
    const chip = page.getByTestId('timer-chip');
    await expect(chip).toHaveCount(1);
    await expect(chip).toContainText(/Focus 0:5\d/);
    await expect(pomodoro.getByTestId('timer-remaining')).toContainText(/Focus 0:5\d/);
    await pomodoro.getByRole('button', { name: 'Pause' }).click();
    await expect(chip).toHaveCount(0);
    const paused = await pomodoro.getByTestId('timer-remaining').textContent();
    await page.waitForTimeout(2000);
    await expect(pomodoro.getByTestId('timer-remaining')).toHaveText(paused!);
    await pomodoro.getByRole('button', { name: 'Resume' }).click();
    await expect(chip).toHaveCount(1);

    // 4. Focus ends: the alert says so, the Break runs, and Stretch started itself.
    await expect(page.getByTestId('alerts-count')).toHaveText('1', { timeout: 90_000 });
    await page.getByTestId('alerts-bell').click();
    await expect(page.getByTestId('alerts-menu').getByTestId('alert')).toContainText(
      'Focus done — Break for 1 min.',
    );
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('timer-chip')).toHaveCount(2);
    await expect(stretch.getByTestId('timer-remaining')).toContainText(/Timer 0:\d\d/);
    await stretch.getByRole('button', { name: 'Pause' }).click();
    await pomodoro.getByRole('button', { name: 'Reset' }).click();
    await expect(pomodoro.getByRole('button', { name: 'Start' })).toBeVisible();
    await expect(page.getByTestId('timer-chip')).toHaveCount(0);

    // 5. Wearing Ember Horizon brings its dusk schedule; Last Light replaces it with dawn.
    await page.locator('header').getByRole('button', { name: 'Mood', exact: true }).click();
    await page.getByTestId('bundled-ember-horizon').getByRole('button', { name: 'Apply' }).click();
    await page.keyboard.press('Escape');
    await page.locator('header').getByRole('link', { name: 'Tending' }).click();
    const dusk = section.getByTestId('schedule').filter({ hasText: 'Dusk: wear Last Light' });
    await expect(dusk).toHaveAttribute('data-source', 'mood');
    await expect(dusk).toContainText('Wear Last Light');
    const moodSwitch = section
      .getByTestId('mood-switch')
      .getByRole('switch', { name: 'Let the Mood schedule' });
    await expect(moodSwitch).toHaveAttribute('aria-checked', 'true');
    await moodSwitch.click();
    await expect(moodSwitch).toHaveAttribute('aria-checked', 'false');
    await moodSwitch.click();

    await page.locator('header').getByRole('button', { name: 'Mood', exact: true }).click();
    await page.getByTestId('bundled-last-light').getByRole('button', { name: 'Apply' }).click();
    await page.keyboard.press('Escape');
    await page.locator('header').getByRole('link', { name: 'Tending' }).click();
    await expect(dusk).toHaveCount(0);
    await expect(
      section.getByTestId('schedule').filter({ hasText: 'Dawn: wear Ember Horizon' }),
    ).toHaveAttribute('data-source', 'mood');
    // The person's own schedules are untouched.
    await expect(pomodoro).toHaveCount(1);
    await expect(stretch).toHaveCount(1);
  } finally {
    await app.close();
  }
});
