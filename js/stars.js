// A sparse, quiet star field drawn on a 2D canvas behind the globe.

const canvas = document.getElementById('stars');
const ctx = canvas.getContext('2d');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const DENSITY = 7500; // one star per this many square CSS pixels
const TINTS = ['236, 241, 255', '255, 246, 232', '214, 226, 255'];

let stars = [];
let width = 0;
let height = 0;

// Small seeded PRNG so resizing doesn't reshuffle the sky.
function seeded(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function build() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const rand = seeded(1907);
  // Lay stars over a fixed-height field so the sky doesn't shift when a
  // phone's address bar changes the viewport height.
  const fieldHeight = Math.max(height, window.screen?.height || 0, window.screen?.width || 0);
  const count = Math.round((width * fieldHeight) / DENSITY);
  stars = [];
  for (let i = 0; i < count; i++) {
    const bright = rand() < 0.06;
    stars.push({
      x: rand() * width,
      y: rand() * fieldHeight,
      r: bright ? 0.8 + rand() * 0.5 : 0.3 + rand() * 0.45,
      a: bright ? 0.55 + rand() * 0.35 : 0.1 + rand() * 0.4,
      bright,
      tint: TINTS[Math.floor(rand() * TINTS.length)],
      // Only some stars twinkle, and slowly.
      speed: rand() < 0.3 ? 0.25 + rand() * 0.8 : 0,
      phase: rand() * Math.PI * 2,
    });
  }
}

// Stars that don't twinkle are painted once onto their own layer; each frame
// only copies that layer and redraws the few that twinkle.
let still = null;
let twinklers = [];

function paintStar(g, s, alpha) {
  if (s.bright) {
    g.fillStyle = `rgba(${s.tint}, ${alpha * 0.08})`;
    g.beginPath();
    g.arc(s.x, s.y, s.r * 3.5, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = `rgba(${s.tint}, ${alpha})`;
  g.beginPath();
  g.arc(s.x, s.y, s.r, 0, Math.PI * 2);
  g.fill();
}

function prepareLayers() {
  const visible = stars.filter((s) => s.y <= height + 4);
  still = document.createElement('canvas');
  still.width = canvas.width;
  still.height = canvas.height;
  const g = still.getContext('2d');
  g.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
  for (const s of visible) if (!s.speed || reduceMotion) paintStar(g, s, s.a);
  twinklers = reduceMotion ? [] : visible.filter((s) => s.speed);
}

function draw(time) {
  // A hidden or zero-size window has nothing to draw yet.
  if (!width || !height || !still?.width || !still?.height) return;
  const t = time / 1000;
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(still, 0, 0, width, height);
  for (const s of twinklers) paintStar(ctx, s, s.a * (0.6 + 0.4 * Math.sin(t * s.speed + s.phase)));
}

// Nothing is drawn while another view covers the page.
const COVERS = ['place-open', 'work-open', 'sky-open', 'contact-struck'];
function loop(time) {
  if (!COVERS.some((c) => document.body.classList.contains(c))) draw(time);
  requestAnimationFrame(loop);
}

build();
prepareLayers();
window.addEventListener('resize', () => {
  build();
  prepareLayers();
  draw(performance.now());
});

draw(0);
if (!reduceMotion) requestAnimationFrame(loop);

canvas.classList.add('is-ready');
