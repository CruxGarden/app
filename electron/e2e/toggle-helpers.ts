import { expect, type Locator } from '@playwright/test';

/** Visible pixels, including the track border: both vertical gaps and the
 * active end's horizontal inset must match, regardless of Mood dimensions. */
export async function expectToggleCentered(toggle: Locator) {
  await expect
    .poll(
      async () => {
        const geometry = await toggle.evaluate((element) => {
          const track = element.getBoundingClientRect();
          const thumb = element.querySelector('.toggle-thumb')!.getBoundingClientRect();
          return {
            top: thumb.top - track.top,
            bottom: track.bottom - thumb.bottom,
            end:
              element.getAttribute('aria-checked') === 'true'
                ? track.right - thumb.right
                : thumb.left - track.left,
          };
        });
        return Math.max(
          Math.abs(geometry.top - geometry.bottom),
          Math.abs(geometry.top - geometry.end),
        );
      },
      { message: 'The switch thumb must have equal top/bottom/end insets' },
    )
    .toBeLessThan(0.1);
}
