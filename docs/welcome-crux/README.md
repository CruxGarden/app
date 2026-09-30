# First home page walkthrough

A new Garden with the site-building capability offers an ordinary **Hello, world**
Crux during setup. It uses the existing Astro Keel Home Page starter and can be
omitted with the setup checkbox. Existing and restored Gardens are not modified.
No model, provider key or generated conversation is required.

The private workspace guide opens the existing settings form, preview, Growth
and Share. Image fields upload a new PNG, JPEG, WebP or GIF (up to 10 MB) into
`public/images`; old files remain intact. The guide's selected step is a local
presentation preference. The published page contains the person's content,
without the workspace guide.

## Behavioral evidence

`electron/e2e/welcome-crux.spec.ts` drives the actual isolated Electron app with
AI disabled throughout. It accepts the default setup option, opens the Crux,
changes name/tagline/about, refuses a non-image upload, saves exact photo bytes,
opens the real Astro preview and checks that the portrait loads. It then marks
a named Growth version, restarts the app, resumes the same walkthrough step,
signs in through the API fixture and shares through the ordinary UI. The test
checks the built HTML and exact published photo bytes, upstream LICENSE and
absence of the private guide in the output. Returning Home shows one welcome
Crux. The focused journey passes in 30.9 seconds. The combined desktop gate
passes **59/59 in 10.4 minutes**, including this journey (28.8 seconds) and both
Zen game journeys; the screenshots here record that combined run. The earlier
intermittent Zen click failure did not reproduce; no production fix is claimed.

The seeding tests use the real service/database layer to check concurrent setup,
preservation of edited files on retry, no invented conversation, and retrying a
failed bundled-asset load in the same Crux.

## Boundaries

The API's email and object storage are fixtures, so this is not a real hosted
publication or email-delivery result. Astro's first preview needs its package
dependencies; it does not require AI. Web Mode currently lacks the site-building
capability and does not offer this Astro walkthrough. A default reading copy of
the separate Documentation Crux is planned; this feature does not install it.

Reproduce after building the app, from `app/electron`:

```sh
npx playwright test --project=gate e2e/welcome-crux.spec.ts
```
