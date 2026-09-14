import type { TemplateDefinition } from './index';
import { LAYOUT_WORKSHOP } from './index';
// JSCAD travels with the Crux: the page, the starter model, the bridge, the validator,
// notes, licences, upstream's styles and examples as text; its released bundle, fonts
// and images as published assets (styles stay text so Vite leaves their font paths alone).
const sources = import.meta.glob(
  [
    '../../jscad-crux/{index.html,style.css,model.js,package.json,README.md,UPSTREAM.md}',
    '../../jscad-crux/{garden,licenses,css}/**/*',
    '../../jscad-crux/examples/**/*.{js,json,md}',
    '!../../jscad-crux/**/node_modules/**',
    '!../../jscad-crux/**/*.test.*',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;
const runtime = import.meta.glob(['../../jscad-crux/{dist,fonts,imgs}/**/*'], {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const template: TemplateDefinition = {
  files: [
    ...Object.entries(sources).map(([path, content]) => ({
      path: path.replace('../../jscad-crux/', ''),
      content,
    })),
    ...Object.entries(runtime).map(([path, content]) => ({
      path: path.replace('../../jscad-crux/', ''),
      content,
      encoding: 'asset-url' as const,
    })),
    { path: 'data/project.json', content: JSON.stringify({ version: 1, app: 'jscad', project: null }) },
  ],
  layout: LAYOUT_WORKSHOP,
  meta: { settings: { entryFile: 'index.html' } },
  greeting:
    'A parametric model opens in JSCAD: a rounded stone with a cord hole to start. Edit the code on the right and press shift + enter to rebuild, change the parameters below the viewer, and Save model to Cruxspace keeps an STL, 3MF, OBJ or SVG as an output for printing or cutting. Ask me to model something and I will write the code.',
  context:
    'A modelling tool around the actual JSCAD web application (2.6, MIT; upstream’s released bundle vendored unmodified with its examples). The model’s whole JSCAD source and name live in data/project.json; the bridge saves after every editor change. App Tools: inspect_model (name, source, evaluation error, export formats), set_model_name, set_model_source (the whole source; the result reports errors — CommonJS, require("@jscad/modeling"), main(params) returning geometry, optional getParameterDefinitions()), save_model (stl by default, or 3mf, obj, amf, x3d, svg, dxf into exports/). JSCAD essentials: primitives (cube, cuboid, roundedCuboid, sphere, cylinder, torus, polygon, circle, rectangle), booleans (union, subtract, intersect), transforms (translate, rotate, scale, mirror), extrusions (extrudeLinear, extrudeRotate), expansions (expand, offset), hulls, colors.colorize([r,g,b], geom); units are millimetres. Read data/project.json before editing. Sharing publishes the page as it is: visitors can edit, spin and download the model. See UPSTREAM.md.',
};
export default template;
