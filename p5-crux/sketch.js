// The sketch. Edit anything here: this is an ordinary p5.js sketch that
// runs in this Crux's preview and on its shared page. `garden` (garden/bridge.js)
// hands in the seed, the name and a way to save a frame; standalone it is a stand-in.
// Restart reloads this file in place, so top-level variables use `var` (a
// top-level `let` or `const` would already be declared the second time).
var seed = window.garden ? window.garden.seed : Math.floor(Math.random() * 1e6);
var PARTICLES = 900;
var particles = [];
var hue0 = 0;

function setup() {
  const stage = document.getElementById('stage');
  const size = Math.min(stage.clientWidth, stage.clientHeight) - 24;
  createCanvas(Math.max(320, size), Math.max(320, size));
  colorMode(HSB, 360, 100, 100, 100);
  randomSeed(seed);
  noiseSeed(seed);
  hue0 = random(360);
  particles = [];
  background(12, 10, 6);
  for (let i = 0; i < PARTICLES; i++) particles.push(createVector(random(width), random(height)));
}

function draw() {
  noStroke();
  for (const p of particles) {
    const angle = noise(p.x * 0.0035, p.y * 0.0035, frameCount * 0.0015) * TWO_PI * 2;
    const hue = (hue0 + noise(p.x * 0.002, p.y * 0.002) * 120) % 360;
    fill(hue, 55, 92, 18);
    circle(p.x, p.y, 2.2);
    p.x += cos(angle) * 1.4;
    p.y += sin(angle) * 1.4;
    if (p.x < 0 || p.x > width || p.y < 0 || p.y > height) p.set(random(width), random(height));
  }
  if (window.garden) window.garden.frame(frameCount);
}

// S saves the current frame into the Crux's outputs (Save frame in the bar does the same).
function keyPressed() {
  if ((key === 's' || key === 'S') && window.garden) window.garden.saveFrame();
}
