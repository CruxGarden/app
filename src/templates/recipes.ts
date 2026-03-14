import type { TemplateDefinition } from './index';
import { LAYOUT_BALANCED } from './index';

const template: TemplateDefinition = {
  context:
    'This is a data-driven recipe book template. ' +
    'The recipe content lives in config.json — the user can edit it via the form view in the workshop. ' +
    'render.js reads config.json and builds the DOM. Help them add recipes with ingredients, steps, and photos.',
  greeting:
    "I've set up a recipe book with a listing page and a sample recipe with ingredients and steps. " +
    "Switch to the Form tab on config.json to add your dishes, or edit the data directly. " +
    "The preview updates live as you make changes.",
  schema: {
    fields: [
      { key: 'title', label: 'Title', type: 'text', placeholder: 'Recipe Book' },
      {
        key: 'recipes',
        label: 'Recipes',
        type: 'repeater',
        fields: [
          { key: 'name', label: 'Recipe Name', type: 'text', placeholder: 'My Recipe' },
          { key: 'description', label: 'Description', type: 'textarea', placeholder: 'A short description of the dish' },
          { key: 'prepTime', label: 'Prep Time', type: 'text', placeholder: '10 min' },
          { key: 'cookTime', label: 'Cook Time', type: 'text', placeholder: '30 min' },
          { key: 'servings', label: 'Servings', type: 'number', placeholder: '4' },
          { key: 'imageUrl', label: 'Image', type: 'image' },
          {
            key: 'ingredients',
            label: 'Ingredients',
            type: 'repeater',
            fields: [
              { key: 'item', label: 'Ingredient', type: 'text', placeholder: '1 cup flour' },
            ],
          },
          {
            key: 'steps',
            label: 'Steps',
            type: 'repeater',
            fields: [
              { key: 'step', label: 'Step', type: 'text', placeholder: 'Preheat oven to 350°F' },
            ],
          },
        ],
      },
    ],
  },
  files: [
    {
      path: 'index.html',
      content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Recipe Book</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <header>
    <h1 id="site-title"></h1>
  </header>
  <main id="recipes" class="recipes"></main>
  <div id="recipe-detail" class="recipe-page" hidden>
    <a href="#" class="back" id="back-link">&larr; All Recipes</a>
    <header>
      <h1 id="detail-name"></h1>
      <p id="detail-meta" class="meta"></p>
    </header>
    <div id="detail-image-wrap"></div>
    <div class="recipe-body">
      <div class="ingredients">
        <h2>Ingredients</h2>
        <ul id="detail-ingredients"></ul>
      </div>
      <div class="steps">
        <h2>Instructions</h2>
        <ol id="detail-steps"></ol>
      </div>
    </div>
  </div>
  <script src="render.js"></script>
</body>
</html>`,
    },
    {
      path: 'style.css',
      content: `* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: system-ui, sans-serif; color: var(--text, #333); background: var(--bg, #faf9f6); }
header { text-align: center; padding: 3rem 1rem 2rem; }
header h1 { font-size: 2rem; font-weight: 700; }
header p { color: var(--text-muted, #888); margin-top: 0.25rem; }
.recipes {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 1.5rem; padding: 1rem 2rem 3rem; max-width: 900px; margin: 0 auto;
}
.recipe-card {
  text-decoration: none; color: inherit; cursor: pointer;
  background: var(--surface, white); border-radius: 12px; overflow: hidden;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
  transition: transform 0.2s;
}
.recipe-card:hover { transform: translateY(-3px); }
.thumb {
  aspect-ratio: 16/10; background: linear-gradient(135deg, #e8e4de, #d8d4ce);
  display: flex; align-items: center; justify-content: center; color: var(--text-muted, #aaa);
  overflow: hidden;
}
.thumb img { width: 100%; height: 100%; object-fit: cover; }
.card-info { padding: 1rem; }
.card-info h3 { font-size: 1rem; }
.card-info .desc { color: var(--text-muted, #888); font-size: 0.8rem; margin-top: 0.25rem; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.meta { color: var(--text-muted, #888); font-size: 0.8rem; margin-top: 0.25rem; }
.recipe-page { max-width: 700px; margin: 0 auto; padding: 2rem 1.5rem; }
.back { color: var(--text-muted, #888); text-decoration: none; font-size: 0.85rem; }
.back:hover { color: var(--text, #333); }
.recipe-page header { text-align: left; padding: 1rem 0 1.5rem; }
.detail-image { width: 100%; max-height: 400px; object-fit: cover; border-radius: 12px; margin-bottom: 1.5rem; }
.recipe-body { display: grid; grid-template-columns: 1fr 2fr; gap: 2rem; }
.ingredients h2, .steps h2 {
  font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.08em;
  color: var(--text-muted, #888); margin-bottom: 0.75rem;
}
ul, ol { padding-left: 1.25rem; }
li { margin-bottom: 0.5rem; line-height: 1.5; }
@media (max-width: 600px) { .recipe-body { grid-template-columns: 1fr; } }`,
    },
    {
      path: 'config.json',
      content: JSON.stringify(
        {
          title: 'Recipe Book',
          recipes: [
            {
              name: 'First Recipe',
              description: 'A simple and delicious dish to get you started.',
              prepTime: '10 min',
              cookTime: '30 min',
              servings: 4,
              imageUrl: '',
              ingredients: [
                { item: '1 cup ingredient one' },
                { item: '2 tbsp ingredient two' },
                { item: 'A pinch of something' },
              ],
              steps: [
                { step: 'First, do this.' },
                { step: 'Then, do that.' },
                { step: 'Finally, plate and enjoy.' },
              ],
            },
            {
              name: 'Another Dish',
              description: 'Something tasty for the whole family.',
              prepTime: '15 min',
              cookTime: '45 min',
              servings: 6,
              imageUrl: '',
              ingredients: [
                { item: '2 cups main ingredient' },
                { item: '1 tbsp seasoning' },
              ],
              steps: [
                { step: 'Prepare the ingredients.' },
                { step: 'Cook until golden.' },
                { step: 'Serve warm.' },
              ],
            },
          ],
        },
        null,
        2,
      ),
    },
    {
      path: 'render.js',
      content: `// Render recipe book from config.json — re-run on every preview refresh
fetch('./config.json')
  .then((r) => r.json())
  .then((data) => {
    const siteTitle = document.getElementById('site-title');
    const recipesGrid = document.getElementById('recipes');
    const detail = document.getElementById('recipe-detail');
    const backLink = document.getElementById('back-link');

    siteTitle.textContent = data.title || 'Recipe Book';
    document.title = data.title || 'Recipe Book';

    function showListing() {
      recipesGrid.hidden = false;
      recipesGrid.previousElementSibling.hidden = false; // header
      detail.hidden = true;
    }

    function showDetail(recipe) {
      recipesGrid.hidden = true;
      recipesGrid.previousElementSibling.hidden = true; // header
      detail.hidden = false;

      document.getElementById('detail-name').textContent = recipe.name || 'Untitled';

      var parts = [];
      if (recipe.servings) parts.push('Serves ' + recipe.servings);
      if (recipe.prepTime) parts.push('Prep: ' + escapeHtml(recipe.prepTime));
      if (recipe.cookTime) parts.push('Cook: ' + escapeHtml(recipe.cookTime));
      document.getElementById('detail-meta').innerHTML = parts.join(' &middot; ');

      var imageWrap = document.getElementById('detail-image-wrap');
      imageWrap.innerHTML = '';
      if (recipe.imageUrl) {
        var img = document.createElement('img');
        img.src = recipe.imageUrl;
        img.alt = recipe.name || '';
        img.className = 'detail-image';
        imageWrap.appendChild(img);
      }

      var ul = document.getElementById('detail-ingredients');
      ul.innerHTML = '';
      for (var ing of recipe.ingredients || []) {
        var li = document.createElement('li');
        li.textContent = ing.item || '';
        ul.appendChild(li);
      }

      var ol = document.getElementById('detail-steps');
      ol.innerHTML = '';
      for (var s of recipe.steps || []) {
        var li = document.createElement('li');
        li.textContent = s.step || '';
        ol.appendChild(li);
      }
    }

    backLink.addEventListener('click', function (e) {
      e.preventDefault();
      showListing();
    });

    // Build recipe cards
    recipesGrid.innerHTML = '';
    for (var i = 0; i < (data.recipes || []).length; i++) {
      var recipe = data.recipes[i];
      var card = document.createElement('div');
      card.className = 'recipe-card';

      var thumbHtml = '';
      if (recipe.imageUrl) {
        thumbHtml = '<img src="' + escapeHtml(recipe.imageUrl) + '" alt="' + escapeHtml(recipe.name || '') + '">';
      } else {
        thumbHtml = 'Photo';
      }

      var metaParts = [];
      if (recipe.cookTime) metaParts.push(escapeHtml(recipe.cookTime));
      if (recipe.servings) metaParts.push(recipe.servings + ' servings');

      card.innerHTML =
        '<div class="thumb">' + thumbHtml + '</div>' +
        '<div class="card-info">' +
          '<h3>' + escapeHtml(recipe.name || 'Untitled') + '</h3>' +
          '<p class="desc">' + escapeHtml(recipe.description || '') + '</p>' +
          '<p class="meta">' + metaParts.join(' &middot; ') + '</p>' +
        '</div>';

      card.addEventListener('click', (function (r) {
        return function () { showDetail(r); };
      })(recipe));

      recipesGrid.appendChild(card);
    }
  })
  .catch(function (err) { console.warn('render.js: could not load config.json', err); });

function escapeHtml(str) {
  var div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}`,
    },
  ],
  layout: LAYOUT_BALANCED,
};

export default template;
