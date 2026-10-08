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

function draw(time) {
  const t = time / 1000;
  ctx.clearRect(0, 0, width, height);
  for (const s of stars) {
    const flicker = s.speed && !reduceMotion ? 0.6 + 0.4 * Math.sin(t * s.speed + s.phase) : 1;
    const alpha = s.a * flicker;
    if (s.bright) {
      ctx.fillStyle = `rgba(${s.tint}, ${alpha * 0.08})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r * 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = `rgba(${s.tint}, ${alpha})`;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function loop(time) {
  draw(time);
  requestAnimationFrame(loop);
}

build();
window.addEventListener('resize', () => {
  build();
  if (reduceMotion) draw(0);
});

if (reduceMotion) draw(0);
else requestAnimationFrame(loop);

canvas.classList.add('is-ready');
