# One Big Sky desktop evidence

Captured 2026-09-10 with the real Electron app in an isolated Garden, using `electron/e2e/onebigsky.spec.ts`. `title.png` shows the game title screen in Workshop with the One Big Sky Mood; `match.png` shows a keyboard-and-bot match after its countdown. These are application screenshots, not generated mockups.

The desktop test verifies font bytes, gamepad permission delegation, keyboard setup/play, pause/resume, focus-loss pause, external source ingestion, a Growth checkpoint and reopening the modified game after a full app restart. Actual physical controller hardware and saved player progress are not claimed. The upstream game keeps matches in memory.

The original Mood background is `src/assets/moods/one-big-sky/sky.png`, generated with the image-generation tool. Prompt:

> Use case: stylized-concept. Asset type: widescreen background for the One Big Sky Mood in Crux Garden, a local creative workspace paired with a cheerful flying-creature arcade game. Create an original expansive pixel-art sky landscape: floating grassy islands with tiny wildflowers, hanging roots and little waterfalls, luminous clouds over a distant sea, huge sense of open air. Beautiful carefully clustered 16-bit pixel art with crisp deliberate pixels and layered atmospheric depth; playful but not childish. Warm peach and gold sunset horizon, airy periwinkle and cyan sky, deeper indigo in the lower corners. Keep the central portion spacious and calm so application panels can sit over it, with interesting island detail near the edges. Landscape 16:9 composition. No text, logos, interface, frames, watermarks, or characters. This is environment artwork, not a screenshot. Save the generated image as a local file.

Licensing is tracked separately in the root document `docs/CREATIVE-CRUX-LICENSE-REVIEW.md`. Technical verification is not distribution clearance.
