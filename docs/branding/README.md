# Repository banners

App: green; API: blue; CLI: red. Each retains “Crux Garden” and “grow anything”,
with its repository label replacing the circle-plus action. Based on the old
1200×400 README banner proportions, rendered at 2× (2400×800).

These are rendered from the app’s actual Plasma library and shared landing typography,
not an AI reconstruction. The source specimen is banner.html / banner.tsx / banner.css.
With Vite running, open `/docs/branding/banner.html?repo=app` (or api / cli), set the
viewport to 1200×400 at deviceScaleFactor 2, wait for fonts and the field to settle,
and capture a JPEG. The corresponding `.github/banner.jpg` files are used by each README.
The specimen is not a public product route or part of the app bundle.

The banners render an actual `<Plasma>` surface with the landing page’s refraction,
dispersion, iridescent rim and flow settings. Do not replace it with a CSS border.
For a still capture, `formIn={false}` starts at the completed panel; its liquid
distortion and lighting still render live. The capture renderer does not use the
app’s hardware-capability fallback. Production graphics policy is unchanged.
