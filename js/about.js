// About: the homepage turns out to be the view through a telescope. Pulling
// back out of it, Earth shrinks to a star and the night sky comes into
// focus: a field of galaxies, one for each thing Ryan loves doing.

import * as THREE from 'three';

// Each galaxy is a cloud of stars in the shape of one activity, and opens a
// photo wheel. Add photos like { src: 'assets/about/guitar/1.jpg', alt: '…' };
// until then the wheel shows placeholder frames.
const GALAXIES = [
  { id: 'guitar', name: 'Guitar', colors: ['#fff1d6', '#ffb35c', '#ff7a3d'], photos: [] },
  { id: 'karaoke', name: 'Karaoke', colors: ['#fff0fb', '#ff8bd8', '#a45cff'], photos: [] },
  { id: 'soccer', name: 'Soccer', colors: ['#ffffff', '#cfe0ff', '#6f9bff'], photos: [] },
  { id: 'racquets', name: 'Pickleball & tennis', colors: ['#f7ffd9', '#d6f55a', '#4fc3a1'], photos: [] },
  { id: 'climbing', name: 'Climbing', colors: ['#fff0e0', '#ff9b6a', '#d4553a'], photos: [] },
  { id: 'running', name: 'Running', colors: ['#effcff', '#7fe3ff', '#3b8cff'], photos: [] },
  { id: 'family', name: 'Family', colors: ['#fff6e6', '#ffd38a', '#ff9fb2'], photos: [] },
];

const SVG_NS = 'http://www.w3.org/2000/svg';
const root = document.getElementById('sky');
const canvas = root.querySelector('.sky-canvas');
const svg = root.querySelector('.sky-art');
const labelLayer = root.querySelector('.sky-labels');
const homeButton = root.querySelector('.sky-home');
const reel = root.querySelector('.sky-reel');
const reelRing = reel.querySelector('.sky-reel-ring');
const scope = document.getElementById('scope');

/* ---------- Helpers ---------- */

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smooth = (a, b, v) => {
  const x = clamp01((v - a) / (b - a));
  return x * x * (3 - 2 * x);
};
const easeInOut = (v) => {
  const x = clamp01(v);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};
const lerp = (a, b, t) => a + (b - a) * t;

function seeded(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function node(tag, attrs = {}) {
  const n = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
}


// Roughly normal noise, centred on zero.
function gauss(rand) {
  return (rand() + rand() + rand() + rand() - 2) / 2;
}

/* ---------- Background stars ---------- */

const TUNNEL = 900;

const STAR_VERT = /* glsl */ `
  attribute vec3 aStart;
  attribute float aSize;
  attribute vec3 aColor;
  attribute float aPhase;
  uniform float uTime;
  uniform float uTravel;
  uniform float uScale;
  uniform float uDepth;
  uniform float uMaxSize;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec3 p = aStart;
    // Stars drift slowly toward you and wrap around to the far end.
    p.z = mod(aStart.z + uTravel + uDepth, uDepth) - uDepth;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float dist = -mv.z;
    float near = smoothstep(3.0, 40.0, dist);
    float far = 1.0 - smoothstep(uDepth * 0.6, uDepth * 0.97, dist);
    float twinkle = 0.72 + 0.28 * sin(uTime * (0.5 + aPhase * 1.8) + aPhase * 40.0);
    vAlpha = near * far * twinkle;
    vColor = aColor;
    gl_PointSize = clamp(aSize * uScale / dist, 1.0, uMaxSize);
    gl_Position = projectionMatrix * mv;
  }
`;

const POINT_FRAG = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    float core = smoothstep(0.35, 0.0, d);
    float halo = pow(1.0 - d, 2.4) * 0.45;
    float a = (core + halo) * vAlpha;
    gl_FragColor = vec4(vColor * a, a);
  }
`;

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.2, 'rgba(255,255,255,0.45)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function glowSprite(texture, color, size, opacity) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }));
  s.scale.setScalar(size);
  return s;
}

function buildTunnel(scene, rand, count, scale, maxSize) {
  const start = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const color = new Float32Array(count * 3);
  const phase = new Float32Array(count);
  const tints = [[0.9, 0.93, 1], [1, 0.92, 0.84], [0.8, 0.86, 1], [0.86, 0.8, 1]];
  for (let i = 0; i < count; i++) {
    // Most stars line the walls of the tunnel; the rest fill it loosely.
    const wall = rand() < 0.62;
    const r = wall ? 30 + rand() * 22 : 5 + rand() * 80;
    const a = rand() * Math.PI * 2;
    start.set([Math.cos(a) * r, Math.sin(a) * r, -rand() * TUNNEL], i * 3);
    size[i] = rand() < 0.04 ? 0.5 + rand() * 0.4 : 0.12 + rand() * 0.22;
    const t = tints[Math.floor(rand() * tints.length)];
    const b = 0.55 + rand() * 0.45;
    color.set([t[0] * b, t[1] * b, t[2] * b], i * 3);
    phase[i] = rand();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  geo.setAttribute('aStart', new THREE.BufferAttribute(start, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aColor', new THREE.BufferAttribute(color, 3));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uTravel: { value: 0 },
      uScale: { value: scale },
      uDepth: { value: TUNNEL },
      uMaxSize: { value: maxSize },
    },
    vertexShader: STAR_VERT,
    fragmentShader: POINT_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, material);
  points.frustumCulled = false;
  scene.add(points);
  return material;
}

/* ---------- Galaxies shaped like activities ---------- */

const FOV = 50;
const EARTH_Z = -320;
const SHAPE_R = 10; // every shape is built at this radius, then scaled

// Each shape is drawn in white on a 256 × 256 canvas. Brightness sets how
// densely it fills with stars, so patterns (a ball's patches, a racquet's
// strings) show up as denser and sparser areas.
const DRAW = {
  guitar(g) {
    g.translate(128, 132);
    g.rotate(-0.55);
    g.scale(0.82, 0.82);
    g.beginPath();
    g.ellipse(0, 42, 54, 52, 0, 0, Math.PI * 2);
    g.ellipse(0, -22, 42, 40, 0, 0, Math.PI * 2);
    g.fill();
    g.fillRect(-10, -150, 20, 100);
    g.beginPath();
    g.roundRect(-16, -178, 32, 32, 6);
    g.fill();
    // Sound hole, bridge and strings.
    g.globalCompositeOperation = 'destination-out';
    g.beginPath();
    g.arc(0, 6, 17, 0, Math.PI * 2);
    g.fill();
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = 'rgba(255,255,255,0.5)';
    g.fillRect(-20, 58, 40, 8);
  },
  karaoke(g) {
    g.translate(128, 128);
    g.rotate(0.45);
    g.beginPath();
    g.arc(0, -66, 40, 0, Math.PI * 2);
    g.fill();
    // A cross-hatched grille.
    g.save();
    g.beginPath();
    g.arc(0, -66, 36, 0, Math.PI * 2);
    g.clip();
    g.globalCompositeOperation = 'destination-out';
    g.lineWidth = 3;
    for (let k = -50; k <= 50; k += 11) {
      g.beginPath();
      g.moveTo(k - 60, -126);
      g.lineTo(k + 60, -6);
      g.moveTo(k + 60, -126);
      g.lineTo(k - 60, -6);
      g.stroke();
    }
    g.restore();
    g.fillRect(-27, -28, 54, 14);
    g.beginPath();
    g.moveTo(-22, -14);
    g.lineTo(22, -14);
    g.lineTo(12, 96);
    g.lineTo(-12, 96);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.55)';
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(0, 96);
    g.quadraticCurveTo(10, 124, 46, 118);
    g.stroke();
  },
  soccer(g) {
    g.translate(128, 128);
    g.save();
    g.beginPath();
    g.arc(0, 0, 104, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = 'rgba(255,255,255,0.32)';
    g.fillRect(-128, -128, 256, 256);
    // Dark patches become the densest parts.
    g.fillStyle = '#fff';
    const pent = (cx, cy, r, rot) => {
      g.beginPath();
      for (let k = 0; k < 5; k++) {
        const a = rot + (k / 5) * Math.PI * 2 - Math.PI / 2;
        g[k ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      }
      g.closePath();
      g.fill();
    };
    pent(0, 0, 30, 0);
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 - Math.PI / 2 + Math.PI / 5;
      pent(Math.cos(a) * 86, Math.sin(a) * 86, 28, a + Math.PI / 2);
    }
    g.strokeStyle = 'rgba(255,255,255,0.75)';
    g.lineWidth = 3;
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 - Math.PI / 2;
      const b = a + Math.PI / 5;
      g.beginPath();
      g.moveTo(Math.cos(a) * 30, Math.sin(a) * 30);
      g.lineTo(Math.cos(a) * 62, Math.sin(a) * 62);
      g.lineTo(Math.cos(b) * 58, Math.sin(b) * 58);
      g.stroke();
    }
    g.restore();
    g.strokeStyle = '#fff';
    g.lineWidth = 7;
    g.beginPath();
    g.arc(0, 0, 101, 0, Math.PI * 2);
    g.stroke();
  },
  racquets(g) {
    const racquet = (cx, angle) => {
      g.save();
      g.translate(cx, 150);
      g.rotate(angle);
      g.strokeStyle = '#fff';
      g.lineWidth = 9;
      g.beginPath();
      g.ellipse(0, -62, 36, 46, 0, 0, Math.PI * 2);
      g.stroke();
      g.save();
      g.beginPath();
      g.ellipse(0, -62, 33, 43, 0, 0, Math.PI * 2);
      g.clip();
      g.strokeStyle = 'rgba(255,255,255,0.4)';
      g.lineWidth = 2;
      for (let k = -40; k <= 40; k += 10) {
        g.beginPath();
        g.moveTo(k, -110);
        g.lineTo(k, -14);
        g.moveTo(-40, -62 + k);
        g.lineTo(40, -62 + k);
        g.stroke();
      }
      g.restore();
      g.lineWidth = 7;
      g.beginPath();
      g.moveTo(-14, -20);
      g.lineTo(0, 4);
      g.lineTo(14, -20);
      g.stroke();
      g.lineCap = 'round';
      g.lineWidth = 15;
      g.beginPath();
      g.moveTo(0, 4);
      g.lineTo(0, 74);
      g.stroke();
      g.restore();
    };
    racquet(96, -0.55);
    racquet(160, 0.55);
  },
  climbing(g) {
    figure(g, {
      head: [100, 48, 19],
      lines: [
        [[108, 70], [120, 140]],
        [[108, 72], [88, 52], [78, 24]],
        [[108, 72], [142, 80], [172, 60]],
        [[120, 140], [98, 172], [96, 210]],
        [[120, 140], [152, 168], [174, 196]],
      ],
      width: 16,
    });
  },
  running(g) {
    figure(g, {
      head: [150, 40, 19],
      lines: [
        [[142, 64], [118, 132]],
        [[140, 70], [168, 96], [196, 80]],
        [[140, 70], [112, 94], [86, 118]],
        [[118, 132], [160, 158], [196, 186]],
        [[118, 132], [96, 178], [54, 202]],
      ],
      width: 17,
    });
  },
  family(g) {
    const ground = 236;
    const person = (x, top, h, wdt) => ({
      head: [x, top + h * 0.1, h * 0.1],
      lines: [
        [[x, top + h * 0.22], [x, top + h * 0.62]],
        [[x, top + h * 0.62], [x - h * 0.14, ground]],
        [[x, top + h * 0.62], [x + h * 0.14, ground]],
        [[x - h * 0.24, top + h * 0.44], [x, top + h * 0.28], [x + h * 0.24, top + h * 0.44]],
      ],
      width: wdt,
    });
    const people = [person(46, 60, 176, 12), person(104, 128, 108, 10), person(152, 128, 108, 10), person(210, 60, 176, 12)];
    people.forEach((p) => figure(g, p));
    // Holding hands.
    g.strokeStyle = '#fff';
    g.lineWidth = 9;
    g.lineCap = 'round';
    for (const [a, b] of [[[88, 137], [78, 175]], [[130, 175], [126, 175]], [[178, 175], [168, 137]]]) {
      g.beginPath();
      g.moveTo(...a);
      g.lineTo(...b);
      g.stroke();
    }
  },
};

// Stick figure with a solid round head and thick limbs.
function figure(g, { head, lines, width }) {
  g.save();
  g.fillStyle = '#fff';
  g.strokeStyle = '#fff';
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.lineWidth = width;
  g.beginPath();
  g.arc(head[0], head[1], head[2], 0, Math.PI * 2);
  g.fill();
  for (const path of lines) {
    g.beginPath();
    path.forEach(([x, y], k) => g[k ? 'lineTo' : 'moveTo'](x, y));
    g.stroke();
  }
  g.restore();
}

// Extra pieces drawn separately so they can move on their own.
// Part 1 moves (a bouncing ball, streaming speed lines); part 2 stays still.
const PART_MASKS = {
  racquets: {
    1(g) {
      g.beginPath();
      g.arc(128, 30, 15, 0, Math.PI * 2);
      g.fill();
      g.globalCompositeOperation = 'destination-out';
      g.lineWidth = 2.5;
      g.beginPath();
      g.arc(116, 30, 13, -1, 1);
      g.stroke();
      g.beginPath();
      g.arc(140, 30, 13, Math.PI - 1, Math.PI + 1);
      g.stroke();
    },
  },
  running: {
    1(g) {
      g.lineWidth = 5;
      g.lineCap = 'round';
      for (const [y, len] of [[82, 50], [110, 64], [138, 44]]) {
        g.beginPath();
        g.moveTo(64 - len, y);
        g.lineTo(64, y);
        g.stroke();
      }
    },
  },
  climbing: {
    2(g) {
      g.strokeStyle = 'rgba(255,255,255,0.55)';
      g.lineWidth = 16;
      g.lineJoin = 'round';
      g.beginPath();
      g.moveTo(200, 0);
      g.lineTo(188, 60);
      g.lineTo(206, 120);
      g.lineTo(190, 190);
      g.lineTo(204, 256);
      g.stroke();
      for (const [x, y] of [[78, 22], [174, 58], [96, 212], [176, 196], [150, 128]]) {
        g.beginPath();
        g.arc(x, y, 8, 0, Math.PI * 2);
        g.fill();
      }
    },
  },
};

// Sound rippling out of the guitar's sound hole and the microphone.
const WAVES = {
  guitar: { matrix: () => new DOMMatrix().translate(128, 132).rotate(-31.5).scale(0.82), at: [0, 6], r0: 15, axis: 0, spread: Math.PI },
  karaoke: { matrix: () => new DOMMatrix().translate(128, 128).rotate(25.8), at: [0, -66], r0: 44, axis: -Math.PI / 2, spread: 0.95 },
};

const KIND = { guitar: 1, karaoke: 2, soccer: 3, racquets: 4, climbing: 5, running: 6, family: 7 };

function sampleMask(draw) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.strokeStyle = '#fff';
  draw(g);
  const data = g.getImageData(0, 0, 256, 256).data;
  const alpha = (x, y) => (x < 0 || y < 0 || x > 255 || y > 255 ? 0 : data[(y * 256 + x) * 4 + 3]);
  const inside = [];
  const edge = [];
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      const a = alpha(x, y);
      if (a < 10) continue;
      inside.push(x, y, a);
      if (a > 120 && (alpha(x + 2, y) < 40 || alpha(x - 2, y) < 40 || alpha(x, y + 2) < 40 || alpha(x, y - 2) < 40)) edge.push(x, y);
    }
  }
  return { inside, edge };
}

// Turns a drawn shape into star positions: dense inside, brightest along the
// outline so the shape reads clearly, plus a faint halo around it.
function shapeStars(id, colors, n, rand) {
  const main = sampleMask(DRAW[id]);
  const count = main.inside.length / 3;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < main.inside.length; i += 3) {
    cx += main.inside[i];
    cy += main.inside[i + 1];
  }
  cx /= count;
  cy /= count;

  const [core, mid, outer] = colors.map((h) => new THREE.Color(h));
  const out = { pos: [], col: [], size: [], phase: [], dir: [], part: [] };
  const col3 = new THREE.Color();
  const toLocal = (px, py) => [((px - cx) / 128) * SHAPE_R, ((cy - py) / 128) * SHAPE_R];
  const push = (x, y, z, color, s, part = 0, dx = 0, dy = 0) => {
    out.pos.push(x, y, z);
    out.col.push(color.r, color.g, color.b);
    out.size.push(s);
    out.phase.push(rand());
    out.dir.push(dx, dy);
    out.part.push(part);
  };
  const tint = (x, y, boost) => {
    const d = Math.min(Math.hypot(x, y) / SHAPE_R, 1);
    col3.copy(core).lerp(mid, Math.min(d * 1.6, 1)).lerp(outer, Math.max(d * 1.6 - 1, 0) * 0.8);
    return col3.multiplyScalar(boost);
  };
  const fill = (mask, amount, part) => {
    const total = mask.inside.length / 3;
    if (!total) return;
    for (let k = 0; k < amount * 0.72; ) {
      const i = Math.floor(rand() * total) * 3;
      if (rand() * 255 > mask.inside[i + 2]) continue; // density follows brightness
      const [x, y] = toLocal(mask.inside[i] + rand(), mask.inside[i + 1] + rand());
      push(x, y, gauss(rand) * 0.35, tint(x, y, 0.95 + rand() * 0.55), 0.07 + rand() * 0.07, part);
      k++;
    }
    for (let k = 0; k < amount * 0.28 && mask.edge.length; k++) {
      const i = Math.floor(rand() * (mask.edge.length / 2)) * 2;
      const [x, y] = toLocal(mask.edge[i] + rand(), mask.edge[i + 1] + rand());
      push(x, y, gauss(rand) * 0.2, tint(x, y, 1.5 + rand() * 0.5), 0.09 + rand() * 0.07, part);
    }
  };

  fill(main, n * 0.86, 0);
  for (const [part, draw] of Object.entries(PART_MASKS[id] ?? {})) fill(sampleMask(draw), n * 0.12, Number(part));

  const wave = WAVES[id];
  if (wave) {
    const m = wave.matrix();
    const c0 = m.transformPoint(new DOMPoint(...wave.at));
    for (let k = 0; k < n * 0.12; k++) {
      const a = wave.axis + (rand() * 2 - 1) * wave.spread;
      const p = m.transformPoint(new DOMPoint(wave.at[0] + Math.cos(a) * wave.r0, wave.at[1] + Math.sin(a) * wave.r0));
      const [x, y] = toLocal(p.x, p.y);
      const len = Math.hypot(p.x - c0.x, p.y - c0.y) || 1;
      push(x, y, gauss(rand) * 0.15, col3.copy(mid).multiplyScalar(1.3), 0.07 + rand() * 0.05, 1, (p.x - c0.x) / len, -(p.y - c0.y) / len);
    }
  }

  for (let k = 0; k < n * 0.08; k++) {
    const a = rand() * Math.PI * 2;
    const r = SHAPE_R * (0.3 + rand() * 0.95);
    push(Math.cos(a) * r, Math.sin(a) * r, gauss(rand) * 1.2, tint(r, 0, 0.45 + rand() * 0.35), 0.05 + rand() * 0.04, 2);
  }
  return out;
}

const SHAPE_VERT = /* glsl */ `
  attribute vec3 aColor;
  attribute float aSize;
  attribute float aPhase;
  attribute vec2 aDir;
  attribute float aPart;
  uniform float uTime;
  uniform float uMotion;
  uniform float uKind;
  uniform float uScale;
  uniform float uMax;
  uniform float uBright;
  uniform float uOpacity;
  varying vec3 vColor;
  varying float vAlpha;

  vec2 turn(vec2 v, float a) {
    float c = cos(a);
    float s = sin(a);
    return vec2(c * v.x - s * v.y, s * v.x + c * v.y);
  }

  void main() {
    vec3 p = position;
    float t = uTime * uMotion;
    float fade = 1.0;
    bool moving = aPart > 0.5 && aPart < 1.5;

    if (uKind < 2.5) {
      // Guitar and microphone: rings of sound ripple outward.
      if (moving) {
        float age = fract(t * 0.42 + aPhase);
        p.xy += aDir * age * 5.5;
        fade = smoothstep(0.0, 0.12, age) * (1.0 - age);
      } else {
        p.xy = turn(p.xy, sin(t * 1.0) * 0.045);
      }
    } else if (uKind < 3.5) {
      // Soccer ball spins and bounces.
      p.xy = turn(p.xy, -t * 0.9);
      p.y += abs(sin(t * 2.2)) * 0.9 - 0.45;
    } else if (uKind < 4.5) {
      // The ball bounces above the racquets, which sway a little.
      if (moving) p.y += abs(sin(t * 2.4)) * 2.4 - 0.6;
      else p.xy = turn(p.xy, sin(t * 1.2) * 0.05);
    } else if (uKind < 5.5) {
      // The climber reaches up and settles; the wall stays put.
      if (aPart < 0.5) {
        p.y += sin(t * 1.3) * 0.35;
        p.xy = turn(p.xy, sin(t * 1.3) * 0.03);
      }
    } else if (uKind < 6.5) {
      // The runner bobs mid-stride while speed lines stream behind.
      if (moving) {
        float f = fract(t * 1.1 + aPhase * 0.35);
        p.x -= f * 3.0;
        fade = 1.0 - f;
      } else if (aPart < 0.5) {
        p.y += abs(sin(t * 5.0)) * 0.35;
      }
    } else {
      // The family sways together from the ground.
      vec2 pivot = vec2(0.0, -8.0);
      p.xy = pivot + turn(p.xy - pivot, sin(t * 1.0) * 0.035);
    }

    // Each star also wanders a little, so the shape shimmers.
    p += vec3(sin(uTime * 0.7 + aPhase * 40.0), cos(uTime * 0.6 + aPhase * 30.0), 0.0) * 0.05;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = clamp(aSize * uScale / -mv.z, 1.6, uMax);
    float twinkle = 0.85 + 0.15 * sin(uTime * (0.8 + aPhase * 2.0) + aPhase * 60.0);
    vColor = aColor * (1.0 + uBright * 0.5) * twinkle;
    vAlpha = uOpacity * fade;
    gl_Position = projectionMatrix * mv;
  }
`;

// Where each shape sits on screen (fractions) and how far away it is.
const LAYOUT = {
  wide: [
    [0.14, 0.27], [0.38, 0.25], [0.62, 0.27], [0.86, 0.25],
    [0.26, 0.65], [0.5, 0.67], [0.79, 0.66],
  ],
  tall: [
    [0.27, 0.13], [0.73, 0.13], [0.27, 0.37], [0.73, 0.38],
    [0.27, 0.61], [0.73, 0.61], [0.5, 0.81],
  ],
};
const DEPTHS = [-70, -95, -80, -105, -88, -75, -100];

function buildGalaxy(g, index, ctx) {
  const { w, h, tall, rand, pxScale, maxSize, glowTex, small } = ctx;
  const [fx, fy] = (tall ? LAYOUT.tall : LAYOUT.wide)[index];
  const z = DEPTHS[index];
  const halfH = -z * Math.tan(THREE.MathUtils.degToRad(FOV / 2));
  const halfW = halfH * (w / h);
  // Sized to its own slot on screen so neighbours never overlap.
  const slotPx = tall ? Math.min(w * 0.22, h * 0.105) : Math.min(w * 0.1, h * 0.165);
  const radius = (slotPx / (h / 2)) * halfH;
  const s = radius / SHAPE_R;

  const outer = new THREE.Group();
  outer.position.set((fx * 2 - 1) * halfW, (1 - fy * 2) * halfH, z);
  outer.lookAt(0, 0, 0);
  const turn = new THREE.Group();
  turn.scale.setScalar(s);
  outer.add(turn);

  const stars = shapeStars(g.id, g.colors, small ? 9000 : 20000, rand);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(stars.pos, 3));
  geo.setAttribute('aColor', new THREE.Float32BufferAttribute(stars.col, 3));
  geo.setAttribute('aSize', new THREE.Float32BufferAttribute(stars.size, 1));
  geo.setAttribute('aPhase', new THREE.Float32BufferAttribute(stars.phase, 1));
  geo.setAttribute('aDir', new THREE.Float32BufferAttribute(stars.dir, 2));
  geo.setAttribute('aPart', new THREE.Float32BufferAttribute(stars.part, 1));
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uMotion: { value: ctx.reduced ? 0 : 1 },
      uKind: { value: KIND[g.id] },
      uScale: { value: pxScale * s },
      uMax: { value: maxSize },
      uBright: { value: 0 },
      uOpacity: { value: 0 },
    },
    vertexShader: SHAPE_VERT,
    fragmentShader: POINT_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, material);
  points.frustumCulled = false;
  turn.add(points);

  // A soft glow behind the shape, like the light of a galaxy's core.
  const core = glowSprite(glowTex, g.colors[1], radius * 1.6, 0.3);
  core.position.z = -radius * 0.2;
  outer.add(core);

  const label = document.createElement('button');
  label.type = 'button';
  label.className = 'sky-label';
  label.textContent = g.name;
  labelLayer.append(label);

  return { g, index, outer, turn, parts: [material], core, label, radius, coreBase: 0.3, hover: 0 };
}

/* ---------- The eyepiece ---------- */

// The view through the telescope: black all round, a soft-edged circle with
// a little vignetting, a thin lens rim and a faint colour fringe.
function drawEyepiece(g, W, H, { x, y, R, vignette, fringe }) {
  g.clearRect(0, 0, W, H);
  g.globalCompositeOperation = 'source-over';
  g.fillStyle = '#000';
  g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'destination-out';
  const soft = Math.max(R * 0.03, 1.5);
  const hole = g.createRadialGradient(x, y, Math.max(R - soft, 0), x, y, R);
  hole.addColorStop(0, 'rgba(0,0,0,1)');
  hole.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = hole;
  g.beginPath();
  g.arc(x, y, R, 0, Math.PI * 2);
  g.fill();
  g.globalCompositeOperation = 'source-over';
  if (vignette > 0) {
    const v = g.createRadialGradient(x, y, R * 0.5, x, y, R);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, `rgba(0,0,0,${vignette})`);
    g.fillStyle = v;
    g.beginPath();
    g.arc(x, y, R, 0, Math.PI * 2);
    g.fill();
  }
  if (R > 3) {
    g.lineWidth = 1;
    g.strokeStyle = 'rgba(190, 210, 255, 0.3)';
    g.beginPath();
    g.arc(x, y, R, 0, Math.PI * 2);
    g.stroke();
    if (fringe > 0) {
      g.globalCompositeOperation = 'lighter';
      g.strokeStyle = `rgba(255, 90, 70, ${0.18 * fringe})`;
      g.beginPath();
      g.arc(x + 0.8, y, R - 1, 0, Math.PI * 2);
      g.stroke();
      g.strokeStyle = `rgba(70, 130, 255, ${0.18 * fringe})`;
      g.beginPath();
      g.arc(x - 0.8, y, R - 1, 0, Math.PI * 2);
      g.stroke();
      g.globalCompositeOperation = 'source-over';
    }
  }
}

/* ---------- Opening ---------- */

let reducedMotion = false;
let state = null;

export function openSky({ reduced = false, origin, zoom, onHidden, onDone }) {
  reducedMotion = reduced;
  const w = innerWidth;
  const h = innerHeight;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const small = Math.min(w, h) < 700;
  const tall = h > w;
  const rand = seeded(2718);

  /* The 3D sky */
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(dpr);
  renderer.setSize(w, h, false);
  renderer.setClearColor('#02030a');
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, w / h, 0.1, 3000);
  const pxScale = (h * dpr) / 2 / Math.tan(THREE.MathUtils.degToRad(FOV / 2));
  const glowTex = glowTexture();

  // Background stars (they only drift while we're arriving).
  const field = buildTunnel(scene, rand, small ? 3500 : 7000, pxScale, 5 * dpr);

  // Earth floats in the sky exactly where the globe was on screen.
  const earthHalfH = -EARTH_Z * Math.tan(THREE.MathUtils.degToRad(FOV / 2));
  const earth = new THREE.Group();
  earth.position.set(((origin.x / w) * 2 - 1) * earthHalfH * (w / h), (1 - (origin.y / h) * 2) * earthHalfH, EARTH_Z);
  earth.add(glowSprite(glowTex, '#7fb2ff', 26, 0.95), glowSprite(glowTex, '#ffffff', 6, 1));
  scene.add(earth);

  labelLayer.replaceChildren();
  const ctx = { w, h, tall, rand, pxScale, maxSize: 7 * dpr, glowTex, small, reduced };
  const galaxies = GALAXIES.map((g, i) => {
    const item = buildGalaxy(g, i, ctx);
    scene.add(item.outer);
    item.label.addEventListener('click', (e) => {
      e.stopPropagation();
      select(item);
    });
    item.label.addEventListener('focus', () => (focused = item));
    item.label.addEventListener('blur', () => focused === item && (focused = null));
    return item;
  });

  /* Foreground: a hill and the telescope, aimed at Earth */
  svg.replaceChildren();
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  const foreground = node('g', { class: 'sky-foreground' });
  foreground.append(
    node('path', {
      class: 'sky-ground',
      d: `M0 ${h} L0 ${h * 0.93} C ${w * 0.18} ${h * 0.9}, ${w * 0.32} ${h * 0.95}, ${w * 0.5} ${h * 0.94} S ${w * 0.82} ${h * 0.92}, ${w} ${h * 0.95} L ${w} ${h} Z`,
    }),
  );
  const sc = Math.min(w, h) / 1100;
  const tx = tall ? w * 0.12 : w * 0.06;
  const ty = h * 0.915;
  const pivot = [tx, ty - 110 * sc];
  const aimAngle = Math.atan2(origin.y - pivot[1], origin.x - pivot[0]);
  const scopeArt = node('g', { class: 'sky-telescope' });
  for (const dx of [-42, 0, 42]) scopeArt.append(node('line', { x1: pivot[0], y1: pivot[1], x2: tx + dx * sc, y2: ty + (dx === 0 ? 6 : 0) * sc }));
  const tube = node('g', { transform: `translate(${pivot[0]} ${pivot[1]}) rotate(${(aimAngle * 180) / Math.PI})` });
  tube.append(
    node('rect', { x: -66 * sc, y: -12 * sc, width: 178 * sc, height: 24 * sc, rx: 5 * sc }),
    node('rect', { x: 105 * sc, y: -16 * sc, width: 20 * sc, height: 32 * sc, rx: 4 * sc }),
    node('rect', { x: -90 * sc, y: -6 * sc, width: 26 * sc, height: 12 * sc, rx: 3 * sc }),
  );
  scopeArt.append(tube);
  foreground.append(scopeArt);
  svg.append(foreground);

  /* Looking around */
  const look = { x: 0, y: 0, tx: 0, ty: 0 };
  const onLook = (e) => {
    look.tx = (e.clientX / innerWidth) * 2 - 1;
    look.ty = (e.clientY / innerHeight) * 2 - 1;
  };
  root.addEventListener('pointermove', onLook);

  /* Hover, focus and selection */
  let hovered = null;
  let focused = null;
  let active = null;
  const tmp = new THREE.Vector3();
  function screenOf(item) {
    item.outer.getWorldPosition(tmp);
    const dist = camera.position.distanceTo(tmp);
    tmp.project(camera);
    return {
      cx: ((tmp.x + 1) / 2) * w,
      cy: ((1 - tmp.y) / 2) * h,
      r: (item.radius / dist) * (pxScale / dpr),
    };
  }
  function itemAt(px, py) {
    let best = null;
    let bestD = Infinity;
    for (const item of galaxies) {
      const { cx, cy, r } = screenOf(item);
      const d = Math.hypot(px - cx, py - cy);
      if (d < r * 1.1 && d < bestD) {
        best = item;
        bestD = d;
      }
    }
    return best;
  }
  const onMove = (e) => {
    if (mode !== 'open') return;
    hovered = itemAt(e.clientX, e.clientY);
    root.style.cursor = hovered ? 'pointer' : '';
  };
  const onClick = (e) => {
    if (mode !== 'open' || e.target.closest('button, .sky-reel')) return;
    const item = itemAt(e.clientX, e.clientY);
    if (item) select(item);
    else {
      active = null;
      wheel.close();
    }
  };
  root.addEventListener('pointermove', onMove);
  root.addEventListener('click', onClick);
  function select(item) {
    active = item;
    wheel.open(item.g, () => active === item && (active = null));
  }

  /* Timeline */
  const diag = Math.hypot(w, h);
  const R0 = origin.r * 1.12;
  const D = reduced ? { close: 0, pull: 0, focus: 0 } : { close: 0.6, pull: 1.3, focus: 1.1 };
  const scopeCtx = scope.getContext('2d');
  scope.width = Math.round(w * dpr);
  scope.height = Math.round(h * dpr);
  scopeCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

  let mode = 'opening';
  let start = performance.now();
  let last = start;
  let travel = 0;
  let appearStart = Infinity;
  let raf = 0;

  function opening(t) {
    // 1. The eyepiece closes in around the globe.
    const e1 = D.close ? easeInOut(t / D.close) : 1;
    // 2. Pulling back: the view shrinks to a point and drifts out of focus.
    const e2 = D.pull ? easeInOut((t - D.close) / D.pull) : 1;
    const R = e2 > 0 ? lerp(R0, 2, e2) : lerp(diag, R0, e1);
    drawEyepiece(scopeCtx, w, h, { x: origin.x, y: origin.y, R, vignette: 0.4 * e1, fringe: e1 });
    scope.style.opacity = 1 - smooth(0.75, 1, e2);
    zoom(e2 > 0 ? Math.max(R / R0, 0.02) : 1, e2 * 7);
    // 3. The sky refocuses around Earth, now a star where the globe was.
    const f = D.focus ? clamp01((t - D.close - D.pull * 0.6) / D.focus) : 1;
    root.style.opacity = smooth(0, 0.5, f);
    canvas.style.filter = f < 1 ? `blur(${((1 - easeInOut(f)) * 10).toFixed(2)}px)` : '';
    svg.style.opacity = smooth(0.3, 1, f);
    if (f >= 0.5) onHidden?.(true);
    if (f >= 0.6 && appearStart === Infinity) appearStart = t;
    if (f >= 1 && e2 >= 1) {
      mode = 'open';
      scope.hidden = true;
      homeButton.focus({ preventScroll: true });
    }
    return 40 * (1 - f); // stars rush past as the sky comes into focus
  }

  function closing(t) {
    const f = D.focus ? clamp01(t / (D.focus * 0.7)) : 1;
    root.style.opacity = 1 - smooth(0.3, 1, f);
    canvas.style.filter = `blur(${(easeInOut(f) * 10).toFixed(2)}px)`;
    svg.style.opacity = 1 - smooth(0, 0.6, f);
    const push = D.pull ? easeInOut((t - D.focus * 0.35) / D.pull) : 1;
    const open = D.close ? easeInOut((t - D.focus * 0.35 - D.pull) / D.close) : 1;
    const R = open > 0 ? lerp(R0, diag, open) : lerp(2, R0, push);
    if (push > 0) onHidden?.(false);
    drawEyepiece(scopeCtx, w, h, { x: origin.x, y: origin.y, R, vignette: 0.4 * (1 - open), fringe: 1 - open });
    scope.style.opacity = smooth(0, 0.2, push) * (1 - smooth(0.6, 1, open));
    zoom(open > 0 ? 1 : Math.max(R / R0, 0.02), (1 - push) * 7);
    if (open >= 1) {
      finish();
      return null;
    }
    return 40 * f;
  }

  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    const t = (now - start) / 1000;
    let rush = 0;
    if (mode === 'opening') rush = opening(t);
    else if (mode === 'closing') {
      rush = closing(t);
      if (rush === null) return;
    }
    const secs = now / 1000;
    travel += dt * rush;
    field.uniforms.uTravel.value = travel;
    field.uniforms.uTime.value = secs;

    // A gentle camera sway with the pointer, for real parallax.
    const ease = 1 - Math.exp(-dt * 2);
    look.x += (look.tx - look.x) * ease;
    look.y += (look.ty - look.y) * ease;
    const drift = reduced ? 0 : 1;
    const lx = look.x + drift * 0.25 * Math.sin(secs * 0.08);
    const ly = look.y + drift * 0.18 * Math.sin(secs * 0.06 + 1);
    camera.position.set(lx * 3, -ly * 2, 0);
    camera.lookAt(lx * 1, -ly * 0.7, -300);
    svg.style.transform = `translate(${(-lx * 8).toFixed(2)}px, ${(-ly * 5).toFixed(2)}px)`;

    // Galaxies fade in one after another, turn slowly, and brighten when lit.
    for (const item of galaxies) {
      const shown = mode === 'closing' ? 1 - clamp01(t / 0.5) : smooth(0, 1, (t - appearStart - item.index * 0.12) / 1.2);
      const lit = item === hovered || item === focused || item === active ? 1 : 0;
      item.hover += (lit - item.hover) * (1 - Math.exp(-dt * 6));
      for (const m of item.parts) {
        m.uniforms.uTime.value = secs;
        m.uniforms.uOpacity.value = shown;
        m.uniforms.uBright.value = item.hover;
      }
      item.core.material.opacity = (item.coreBase + 0.2 * item.hover) * shown;
      if (!reduced) {
        item.turn.rotation.y = Math.sin(secs * 0.25 + item.index * 1.3) * 0.32;
        item.turn.rotation.x = Math.sin(secs * 0.19 + item.index * 2.1) * 0.1;
      }
      if (item.hover > 0.02) {
        const { cx, cy, r } = screenOf(item);
        item.label.style.transform = `translate(${cx.toFixed(1)}px, ${(cy + r * 0.95).toFixed(1)}px) translate(-50%, 0)`;
      }
      item.label.style.opacity = item.hover.toFixed(3);
      item.label.tabIndex = mode === 'open' ? 0 : -1;
    }

    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }

  function close() {
    if (mode === 'closing') return;
    wheel.close();
    active = hovered = focused = null;
    mode = 'closing';
    start = performance.now();
    scope.hidden = false;
  }

  function finish() {
    cancelAnimationFrame(raf);
    root.hidden = true;
    scope.hidden = true;
    canvas.style.filter = '';
    root.style.cursor = '';
    document.body.classList.remove('sky-open');
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', onResize);
    root.removeEventListener('pointermove', onLook);
    root.removeEventListener('pointermove', onMove);
    root.removeEventListener('click', onClick);
    labelLayer.replaceChildren();
    scene.traverse((obj) => {
      obj.geometry?.dispose();
      obj.material?.dispose();
    });
    glowTex.dispose();
    renderer.dispose();
    state = null;
    zoom(1, 0);
    onDone?.();
  }

  const onKey = (e) => {
    if (e.key !== 'Escape') return;
    if (!reel.hidden) wheel.close();
    else close();
  };
  const onResize = () => {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('keydown', onKey);
  window.addEventListener('resize', onResize);
  homeButton.onclick = close;

  root.style.opacity = 0;
  svg.style.opacity = 0;
  root.hidden = false;
  scope.hidden = false;
  document.body.classList.add('sky-open');
  raf = requestAnimationFrame(frame);
  state = { close };
  return state;
}

/* ---------- Photo wheel ---------- */

// Photos sit around a slowly turning ring; drag, scroll or use the arrows
// to bring one to the front.
const wheel = (() => {
  const prev = reel.querySelector('.sky-reel-prev');
  const next = reel.querySelector('.sky-reel-next');
  const closeButton = reel.querySelector('.sky-reel-close');
  const title = reel.querySelector('.sky-reel-title');
  let tiles = [];
  let step = 60;
  let angle = 0;
  let radius = 0;
  let drag = null;
  let wheelDelta = 0;
  const AUTO_SPEED = 9; // degrees per second
  const RESUME_AFTER = 1400; // ms after the last manual input
  let manualUntil = 0;
  let spinning = 0;
  let lastTick = 0;

  function takeControl() {
    manualUntil = Infinity;
  }

  function releaseControl() {
    manualUntil = performance.now() + RESUME_AFTER;
  }

  function tick(now) {
    const dt = Math.min((now - lastTick) / 1000, 0.1);
    lastTick = now;
    if (!drag && now > manualUntil && !reducedMotion) {
      reelRing.classList.add('is-dragging'); // no easing while it drifts
      angle -= AUTO_SPEED * dt;
      render();
    }
    spinning = requestAnimationFrame(tick);
  }

  function tileSize() {
    return innerWidth < 600 ? [128, 96] : [168, 124];
  }

  function placeholder(name, i) {
    const tile = document.createElement('div');
    tile.className = 'sky-reel-photo is-empty';
    tile.style.setProperty('--hue', 210 + ((i * 37) % 80));
    const label = document.createElement('span');
    label.textContent = i === 0 ? `${name} photos coming soon` : '';
    tile.append(label);
    return tile;
  }

  function layout() {
    const [w] = tileSize();
    const n = tiles.length;
    step = 360 / n;
    radius = Math.round(w / 2 / Math.tan(Math.PI / n) + 18);
    tiles.forEach((tile, i) => {
      tile.style.transform = `rotateY(${i * step}deg) translateZ(${radius}px)`;
    });
    render();
  }

  function render() {
    reelRing.style.transform = `translateZ(${-radius}px) rotateY(${angle}deg)`;
    const front = ((Math.round(-angle / step) % tiles.length) + tiles.length) % tiles.length;
    tiles.forEach((tile, i) => tile.classList.toggle('is-front', i === front));
  }

  function snap() {
    reelRing.classList.remove('is-dragging');
    angle = Math.round(angle / step) * step;
    render();
    releaseControl();
  }

  function turn(dir) {
    takeControl();
    reelRing.classList.remove('is-dragging');
    angle = Math.round(angle / step) * step - dir * step;
    render();
    releaseControl();
  }

  reel.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    takeControl();
    drag = { x: e.clientX, angle };
    reelRing.classList.add('is-dragging');
    reel.setPointerCapture(e.pointerId);
  });
  reel.addEventListener('pointermove', (e) => {
    if (!drag) return;
    angle = drag.angle + (e.clientX - drag.x) * 0.45;
    render();
  });
  const endDrag = () => {
    if (!drag) return;
    drag = null;
    snap();
  };
  reel.addEventListener('pointerup', endDrag);
  reel.addEventListener('pointercancel', endDrag);
  reel.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      takeControl();
      releaseControl();
      wheelDelta += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (Math.abs(wheelDelta) > 60) {
        turn(Math.sign(wheelDelta));
        wheelDelta = 0;
      }
    },
    { passive: false },
  );
  reel.addEventListener('click', (e) => e.stopPropagation());
  reel.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') turn(1);
    if (e.key === 'ArrowLeft') turn(-1);
  });
  prev.onclick = () => turn(-1);
  next.onclick = () => turn(1);
  closeButton.onclick = () => close();

  let onClosed = null;

  function open(c, closed) {
    onClosed = closed;
    reelRing.replaceChildren();
    const photos = c.photos?.length ? c.photos : null;
    tiles = photos
      ? photos.map((p) => {
          const tile = document.createElement('div');
          tile.className = 'sky-reel-photo';
          const img = document.createElement('img');
          img.src = p.src;
          img.alt = p.alt ?? '';
          img.draggable = false;
          img.loading = 'lazy';
          tile.append(img);
          return tile;
        })
      : Array.from({ length: 6 }, (_, i) => placeholder(c.name, i));
    // A wheel needs a few faces to look round.
    while (tiles.length < 5) tiles = tiles.concat(tiles.map((t) => t.cloneNode(true)));
    reelRing.append(...tiles);
    title.textContent = c.name;
    angle = 0;
    reel.hidden = false;
    layout();
    requestAnimationFrame(() => reel.classList.add('is-open'));
    // Start drifting a moment after it opens.
    manualUntil = performance.now() + 700;
    cancelAnimationFrame(spinning);
    lastTick = performance.now();
    spinning = requestAnimationFrame(tick);
  }

  function close() {
    cancelAnimationFrame(spinning);
    onClosed?.();
    onClosed = null;
    reel.classList.remove('is-open');
    setTimeout(() => {
      if (!reel.classList.contains('is-open')) reel.hidden = true;
    }, 350);
  }

  window.addEventListener('resize', () => !reel.hidden && layout());
  return { open, close };
})();
