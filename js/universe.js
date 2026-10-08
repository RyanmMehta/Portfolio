// The Work universe: the camera pulls back from Earth to reveal two spiral
// galaxies. Each one opens into a small system of planets you can visit.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GALAXIES } from './galaxies.js';
import { PROJECTS } from './projects.js';

const root = document.getElementById('universe');
const canvas = document.getElementById('universe-canvas');
const homeButton = document.getElementById('cosmos-home');
const upButton = document.getElementById('cosmos-up');
const labelLayer = root.querySelector('.cosmos-labels');
const hint = root.querySelector('.cosmos-hint');
const panel = root.querySelector('.cosmos-panel');
const panelKicker = panel.querySelector('.cosmos-panel-kicker');
const panelTitle = panel.querySelector('.cosmos-panel-title');
const panelBody = panel.querySelector('.cosmos-panel-body');
const panelClose = panel.querySelector('.cosmos-panel-close');

/* ---------- Look and feel ---------- */

// Professional is precise and cool; Personal is warmer and looser.
const LOOKS = {
  professional: {
    accent: '#9cc4ff',
    core: '#ffffff',
    inner: '#d4e4ff',
    outer: '#3c68ff',
    sparkle: '#9ff0ff',
    arms: 2,
    wind: 1.15,
    scatter: 0.15,
    thickness: 0.16,
    speed: 0.035,
    warp: 0,
    star: { hot: '#ffffff', cool: '#9cc0ff', corona: '#78a6ff', size: 1.5 },
    organic: false,
  },
  personal: {
    accent: '#ffb877',
    core: '#fff1d8',
    inner: '#ffc27a',
    outer: '#9255ff',
    sparkle: '#ff86d8',
    arms: 3,
    wind: 0.8,
    scatter: 0.34,
    thickness: 0.3,
    speed: 0.05,
    warp: 1.4,
    star: { hot: '#fff3d1', cool: '#ffa443', corona: '#ff9846', size: 1.7 },
    organic: true,
  },
};

const PLANET_LOOKS = {
  projects: { size: 1.35, orbit: 6.2, colors: ['#0d3550', '#2a8cb0', '#a5e6ff', '#1a5e7e'], style: 'bands', ring: '#a6dcff' },
  experience: { size: 1.0, orbit: 9.4, colors: ['#36455c', '#8ea2c2', '#dbe6f7', '#5b6e8e'], style: 'rock' },
  competitions: { size: 0.95, orbit: 12.8, colors: ['#6b5320', '#d9b45a', '#fff2c6', '#a07c2c'], style: 'bands', ring: '#ffe3a0' },
  music: { size: 1.2, orbit: 5.6, colors: ['#3a1f6b', '#9a6bff', '#ffbdf2', '#5d34a8'], style: 'bands', ring: '#e6b8ff' },
  climbing: { size: 0.9, orbit: 8.2, colors: ['#5a2618', '#b3502e', '#eaa47c', '#7d3622'], style: 'rock' },
  running: { size: 0.8, orbit: 10.6, colors: ['#123d33', '#2fa37f', '#c3f3de', '#1d6b55'], style: 'rock' },
  woodworking: { size: 1.05, orbit: 13.2, colors: ['#4a2c16', '#a8692f', '#f2c88e', '#6e4220'], style: 'bands' },
};

/* ---------- Helpers ---------- */

const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smoothstep = (a, b, v) => {
  const x = clamp01((v - a) / (b - a));
  return x * x * (3 - 2 * x);
};
const smootherstep = (v) => {
  const x = clamp01(v);
  return x * x * x * (x * (x * 6 - 15) + 10);
};

function hash2(x, y, s) {
  const h = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453;
  return h - Math.floor(h);
}
function vnoise(x, y, s) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, s);
  const b = hash2(xi + 1, yi, s);
  const c = hash2(xi, yi + 1, s);
  const d = hash2(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, s, octaves = 5) {
  let v = 0;
  let a = 0.5;
  let f = 1;
  for (let i = 0; i < octaves; i++) {
    v += a * vnoise(x * f, y * f, s);
    f *= 2.03;
    a *= 0.5;
  }
  return v;
}

function canvasTexture(c, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.18, 'rgba(255,255,255,0.55)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.12)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return canvasTexture(c);
}

function glowSprite(texture, color, size, opacity = 1) {
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  s.scale.setScalar(size);
  return s;
}

// Seamless planet surface: noise sampled around a circle so the left and
// right edges of the texture meet.
function planetTexture(look) {
  const W = 384;
  const H = 192;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const img = g.createImageData(W, H);
  const cols = look.colors.map((h) => new THREE.Color(h));
  const out = new THREE.Color();
  const seed = rand(0, 50);
  for (let y = 0; y < H; y++) {
    const v = y / H;
    for (let x = 0; x < W; x++) {
      const a = (x / W) * Math.PI * 2;
      const nx = Math.cos(a) * 1.6 + 10;
      const nz = Math.sin(a) * 1.6 + 10;
      const n = fbm(nx + v * 3.1, nz + v * 2.3, seed);
      let t;
      if (look.style === 'bands') t = 0.5 + 0.5 * Math.sin(v * 22 + n * 6 + Math.sin(v * 7) * 2);
      else t = clamp01((n - 0.25) * 1.9);
      const f = t * (cols.length - 1);
      const k = Math.min(Math.floor(f), cols.length - 2);
      out.copy(cols[k]).lerp(cols[k + 1], f - k);
      const pole = 1 - Math.pow(Math.abs(v - 0.5) * 2, 6) * 0.35;
      const i = (y * W + x) * 4;
      img.data[i] = Math.min(255, out.r * 255 * pole);
      img.data[i + 1] = Math.min(255, out.g * 255 * pole);
      img.data[i + 2] = Math.min(255, out.b * 255 * pole);
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = canvasTexture(c);
  t.anisotropy = 4;
  return t;
}

function ringTexture(color) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 8;
  const g = c.getContext('2d');
  const base = new THREE.Color(color);
  for (let x = 0; x < 256; x++) {
    const t = x / 255;
    const a = (0.25 + 0.75 * Math.abs(Math.sin(t * 40 + Math.sin(t * 13) * 2))) * Math.sin(t * Math.PI) * 0.75;
    g.fillStyle = `rgba(${base.r * 255}, ${base.g * 255}, ${base.b * 255}, ${a})`;
    g.fillRect(x, 0, 1, 8);
  }
  return canvasTexture(c);
}

function rockGeometry() {
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const pos = geo.attributes.position;
  const seed = rand(0, 10);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const n = 1 + 0.3 * Math.sin(x * 3.1 + seed) * Math.cos(y * 2.7 - seed) * Math.sin(z * 3.3);
    pos.setXYZ(i, x * n * 1.3, y * n * 0.8, z * n);
  }
  geo.computeVertexNormals();
  return geo;
}

/* ---------- Shaders ---------- */

const GALAXY_VERT = /* glsl */ `
  attribute vec3 aPolar; // radius, angle, height
  attribute vec3 aColor;
  attribute float aSize;
  uniform float uTime;
  uniform float uSpeed;
  uniform float uRadius;
  uniform float uScale;
  uniform float uBright;
  uniform float uOpacity;
  uniform float uWarp;
  uniform float uMaxSize;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float r = aPolar.x;
    float k = r / uRadius;
    // Inner stars orbit a little faster than outer ones.
    float theta = aPolar.y + uTime * uSpeed * (0.6 / (0.35 + k));
    float y = aPolar.z + sin(theta * 2.0 + r * 0.25) * uWarp * k;
    vec4 mv = modelViewMatrix * vec4(cos(theta) * r, y, sin(theta) * r, 1.0);
    float core = 1.0 - smoothstep(0.0, 0.3, k);
    gl_PointSize = min(aSize * uScale * (1.0 + core * uBright * 0.5) / max(-mv.z, 0.1), uMaxSize);
    vColor = aColor * (1.0 + core * uBright * 1.2);
    vAlpha = uOpacity;
    gl_Position = projectionMatrix * mv;
  }
`;

const POINT_FRAG = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    float a = pow(1.0 - d, 1.8) * vAlpha;
    gl_FragColor = vec4(vColor * a, a);
  }
`;

const STARS_VERT = /* glsl */ `
  attribute float aSize;
  attribute vec3 aColor;
  attribute float aPhase;
  uniform float uTime;
  uniform float uPixel;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vColor = aColor;
    vAlpha = 0.65 + 0.35 * sin(uTime * (0.6 + aPhase) + aPhase * 30.0);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uPixel;
    gl_Position = projectionMatrix * mv;
  }
`;

const STAR_SURFACE_VERT = /* glsl */ `
  varying vec3 vPos;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vPos = position;
    vN = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

const STAR_SURFACE_FRAG = /* glsl */ `
  uniform float uTime;
  uniform vec3 uHot;
  uniform vec3 uCool;
  varying vec3 vPos;
  varying vec3 vN;
  varying vec3 vV;
  float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
      f.z);
  }
  float fbm(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p *= 2.1;
      a *= 0.5;
    }
    return v;
  }
  void main() {
    vec3 p = normalize(vPos) * 2.4;
    float n = fbm(p + vec3(uTime * 0.08, uTime * 0.05, -uTime * 0.06));
    float cells = fbm(p * 2.3 - vec3(0.0, uTime * 0.12, 0.0));
    vec3 c = mix(uCool, uHot, smoothstep(0.35, 0.75, n * 0.7 + cells * 0.5));
    float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
    c += uHot * rim * 0.9;
    gl_FragColor = vec4(c * 1.35, 1.0);
    #include <colorspace_fragment>
  }
`;

// A shooting star drawn as a tapered streak facing the camera.
const STREAK_VERT = /* glsl */ `
  attribute float aT;
  attribute float aSide;
  uniform vec3 uHead;
  uniform vec3 uDir;
  uniform float uLength;
  uniform float uWidth;
  varying float vT;
  void main() {
    vT = aT;
    vec3 p = uHead - uDir * uLength * (1.0 - aT);
    vec3 perp = normalize(cross(uDir, vec3(0.0, 0.0, 1.0)));
    p += perp * aSide * uWidth * aT;
    gl_Position = projectionMatrix * vec4(p, 1.0);
  }
`;

const STREAK_FRAG = /* glsl */ `
  uniform float uAlpha;
  uniform vec3 uColor;
  varying float vT;
  void main() {
    float a = vT * vT * uAlpha;
    gl_FragColor = vec4(uColor * a, a);
  }
`;

/* ---------- Pieces of the universe ---------- */

function makeBackdrop(scene, count, pixel) {
  const pos = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const color = new Float32Array(count * 3);
  const phase = new Float32Array(count);
  const tints = ['#ffffff', '#cfe0ff', '#ffe9d1', '#d9d0ff'].map((h) => new THREE.Color(h));
  const v = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    v.randomDirection().multiplyScalar(rand(700, 1100));
    pos.set([v.x, v.y, v.z], i * 3);
    size[i] = Math.random() < 0.04 ? rand(2.2, 3.4) : rand(0.6, 1.6);
    const c = tints[Math.floor(Math.random() * tints.length)];
    const b = rand(0.4, 1);
    color.set([c.r * b, c.g * b, c.b * b], i * 3);
    phase[i] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aColor', new THREE.BufferAttribute(color, 3));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uPixel: { value: pixel } },
    vertexShader: STARS_VERT,
    fragmentShader: POINT_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);
  return mat;
}

function nebulaTexture(colors) {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  for (let i = 0; i < 70; i++) {
    const x = 256 + rand(-150, 150);
    const y = 256 + rand(-110, 110);
    const r = rand(50, 170);
    const col = new THREE.Color(colors[i % colors.length]);
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(${col.r * 255}, ${col.g * 255}, ${col.b * 255}, ${rand(0.03, 0.08)})`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 512, 512);
  }
  return canvasTexture(c);
}

function makeGalaxy(look, radius, count) {
  const polar = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const core = new THREE.Color(look.core);
  const inner = new THREE.Color(look.inner);
  const outer = new THREE.Color(look.outer);
  const sparkle = new THREE.Color(look.sparkle);
  const c = new THREE.Color();
  const bulge = Math.floor(count * 0.14);
  for (let i = 0; i < count; i++) {
    let x;
    let y;
    let z;
    if (i < bulge) {
      // A dense, bright central bulge.
      const r = radius * 0.17 * Math.pow(Math.random(), 1.6);
      const v = new THREE.Vector3().randomDirection().multiplyScalar(r);
      x = v.x;
      y = v.y * 0.6;
      z = v.z;
      c.copy(core).lerp(inner, r / (radius * 0.17));
      sizes[i] = rand(1.2, 2.6);
    } else {
      const r = radius * (0.06 + 0.94 * Math.pow(Math.random(), 1.25));
      const arm = i % look.arms;
      const angle = (arm / look.arms) * Math.PI * 2 + (r / radius) * look.wind * Math.PI * 2;
      const jitter = () => Math.pow(Math.random(), 3) * (Math.random() < 0.5 ? -1 : 1) * look.scatter * radius * 0.45;
      x = Math.cos(angle) * r + jitter();
      z = Math.sin(angle) * r + jitter();
      y = jitter() * look.thickness * (1 - (r / radius) * 0.6);
      const k = r / radius;
      c.copy(inner).lerp(outer, smoothstep(0.05, 0.9, k));
      if (Math.random() < 0.07) c.copy(sparkle);
      c.multiplyScalar(rand(0.55, 1.05));
      sizes[i] = Math.random() < 0.02 ? rand(2.2, 3.6) : rand(0.6, 1.7);
    }
    polar.set([Math.hypot(x, z), Math.atan2(z, x), y], i * 3);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  // Positions are computed in the shader; this attribute just sets the count.
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  geo.setAttribute('aPolar', new THREE.BufferAttribute(polar, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSpeed: { value: look.speed },
      uRadius: { value: radius },
      uScale: { value: 1 },
      uBright: { value: 0 },
      uOpacity: { value: 1 },
      uWarp: { value: look.warp },
      uMaxSize: { value: 8 },
    },
    vertexShader: GALAXY_VERT,
    fragmentShader: POINT_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, material);
  points.frustumCulled = false;
  return { points, material };
}

function makeStar(look, glowTex) {
  const group = new THREE.Group();
  const surface = new THREE.Mesh(
    new THREE.SphereGeometry(look.star.size, 64, 32),
    new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uHot: { value: new THREE.Color(look.star.hot) }, uCool: { value: new THREE.Color(look.star.cool) } },
      vertexShader: STAR_SURFACE_VERT,
      fragmentShader: STAR_SURFACE_FRAG,
    }),
  );
  const coronas = [
    glowSprite(glowTex, look.star.hot, look.star.size * 4.5, 0.9),
    glowSprite(glowTex, look.star.corona, look.star.size * 10, 0.55),
    glowSprite(glowTex, look.star.corona, look.star.size * 22, 0.18),
  ];
  group.add(surface, ...coronas);
  return { group, surface, coronas };
}

function makePlanet(def, glowTex, accent) {
  const look = PLANET_LOOKS[def.id];
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(look.size, 48, 32),
    new THREE.MeshStandardMaterial({ map: planetTexture(look), roughness: 0.85, metalness: 0.05 }),
  );
  body.rotation.z = rand(-0.4, 0.4);
  group.add(body);
  const atmosphere = glowSprite(glowTex, look.colors[2], look.size * 3.2, 0.25);
  group.add(atmosphere);
  if (look.ring) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(look.size * 1.45, look.size * 2.3, 96),
      new THREE.MeshBasicMaterial({ map: ringTexture(look.ring), transparent: true, side: THREE.DoubleSide, depthWrite: false }),
    );
    // RingGeometry's UVs run across the plane; remap so u runs inner → outer.
    const uv = ring.geometry.attributes.uv;
    const p = ring.geometry.attributes.position;
    for (let i = 0; i < uv.count; i++) {
      const r = Math.hypot(p.getX(i), p.getY(i));
      uv.setXY(i, (r - look.size * 1.45) / (look.size * 0.85), 0.5);
    }
    ring.rotation.x = -Math.PI / 2 + rand(0.25, 0.45);
    ring.rotation.y = rand(-0.3, 0.3);
    group.add(ring);
  }
  return { group, body, atmosphere, look, def, accent };
}

/* ---------- Opening the universe ---------- */

let current = null;

export async function openUniverse({ reduced = false, onLeave, onVisitProject }) {
  current?.dispose();
  root.classList.remove('is-revealed', 'is-leaving');
  const w = innerWidth;
  const h = innerHeight;
  const small = Math.min(w, h) < 700;
  const portrait = h > w;
  const dpr = Math.min(devicePixelRatio || 1, small ? 2 : 1.75);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(dpr);
  renderer.setSize(w, h, false);
  renderer.setClearColor('#010104');
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, w / h, 0.05, 4000);
  const glowTex = glowTexture();
  const time = { value: 0 };
  const hooks = [];

  /* Backdrop: stars, faint nebulae, and Earth where we came from. */
  const starsMat = makeBackdrop(scene, small ? 3500 : 7000, dpr);
  hooks.push((t) => (starsMat.uniforms.uTime.value = t));
  for (const [colors, pos, size] of [
    [['#3150c8', '#6a3ad0', '#1c6fb8'], [-420, 160, -900], 900],
    [['#c0418a', '#7d39c8', '#d06a2a'], [460, -200, -950], 1000],
  ]) {
    const neb = new THREE.Sprite(new THREE.SpriteMaterial({ map: nebulaTexture(colors), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.9 }));
    neb.position.set(...pos);
    neb.scale.setScalar(size);
    scene.add(neb);
  }
  const earth = new THREE.Group();
  earth.add(
    new THREE.Mesh(new THREE.SphereGeometry(0.5, 32, 16), new THREE.MeshBasicMaterial({ color: '#2f6fd1' })),
    glowSprite(glowTex, '#7fb2ff', 2.4, 0.8),
  );
  scene.add(earth);

  /* Light for planets and asteroids. */
  scene.add(new THREE.AmbientLight('#8090b0', 0.25));

  /* Galaxies */
  const radius = 24;
  const layout = portrait
    ? { pro: [-6, 30, -46], per: [8, -26, -56], cam: [0, 2, 118], target: [0, 1, -50] }
    : { pro: [-40, 10, -34], per: [40, -9, -48], cam: [0, 6, 80], target: [0, 0, -40] };
  const overview = { pos: new THREE.Vector3(...layout.cam), target: new THREE.Vector3(...layout.target) };
  const galaxies = GALAXIES.map((def) => {
    const look = LOOKS[def.id];
    const group = new THREE.Group();
    group.position.set(...(def.id === 'professional' ? layout.pro : layout.per));
    group.rotation.set(def.id === 'professional' ? 1.0 : 1.12, 0, def.id === 'professional' ? 0.32 : -0.38);
    scene.add(group);

    const disk = makeGalaxy(look, radius, small ? 22000 : 55000);
    disk.material.uniforms.uTime = time;
    disk.material.uniforms.uScale.value = dpr * 240;
    disk.material.uniforms.uMaxSize.value = dpr * 7;
    group.add(disk.points);
    const coreGlow = glowSprite(glowTex, look.core, radius * 0.55, 0.85);
    const haze = glowSprite(glowTex, look.inner, radius * 1.9, 0.18);
    group.add(coreGlow, haze);

    // The system inside: a star, planets, an asteroid belt.
    const system = new THREE.Group();
    system.visible = false;
    group.add(system);
    const star = makeStar(look, glowTex);
    system.add(star.group);
    const light = new THREE.PointLight(look.star.hot, 3.2, 0, 0);
    system.add(light);
    const planets = def.planets.map((p, i) => {
      const planet = makePlanet(p, glowTex, look.accent);
      const pl = planet.look;
      Object.assign(planet, {
        angle: rand(0, Math.PI * 2),
        speed: (look.organic ? rand(0.85, 1.25) : 1) * 0.9 / Math.pow(pl.orbit, 1.25),
        ecc: look.organic ? rand(0.06, 0.18) : 0,
        incline: look.organic ? rand(-0.16, 0.16) : 0,
        node: rand(0, Math.PI * 2),
        bob: look.organic ? rand(0.1, 0.25) : 0,
        index: i,
      });
      system.add(planet.group);
      // Orbit path.
      const pts = [];
      for (let k = 0; k <= 200; k++) pts.push(orbitPoint(planet, (k / 200) * Math.PI * 2, 0));
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: look.accent, transparent: true, opacity: look.organic ? 0.16 : 0.28, depthWrite: false }),
      );
      system.add(line);
      return planet;
    });
    // Decorative asteroid belt between the outer orbits.
    const beltCount = small ? 260 : 600;
    const belt = new THREE.InstancedMesh(rockGeometry(), new THREE.MeshStandardMaterial({ color: '#8a8478', roughness: 0.95 }), beltCount);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const inner = (planets.at(-2).look.orbit + planets.at(-1).look.orbit) / 2 - 0.7;
    for (let i = 0; i < beltCount; i++) {
      const a = rand(0, Math.PI * 2);
      const r = rand(inner, inner + 1.4);
      q.setFromEuler(new THREE.Euler(rand(0, 6), rand(0, 6), rand(0, 6)));
      m.compose(new THREE.Vector3(Math.cos(a) * r, rand(-0.25, 0.25), Math.sin(a) * r), q, new THREE.Vector3().setScalar(rand(0.04, 0.14)));
      belt.setMatrixAt(i, m);
    }
    system.add(belt);

    return { def, look, group, disk, coreGlow, haze, system, star, planets, belt, mix: 0, mixTarget: 0, bright: 0, label: null };
  });

  function orbitPoint(planet, a, t) {
    const R = planet.look.orbit;
    const r = R * (1 - planet.ecc * planet.ecc) / (1 + planet.ecc * Math.cos(a - planet.node));
    const p = new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
    if (planet.incline) p.applyAxisAngle(new THREE.Vector3(Math.cos(planet.node), 0, Math.sin(planet.node)), planet.incline);
    if (planet.bob) p.y += Math.sin(t * 0.9 + planet.index * 2) * planet.bob;
    return p;
  }

  /* Foreground asteroids drifting past for depth. */
  const driftCount = small ? 14 : 26;
  const drifters = new THREE.InstancedMesh(rockGeometry(), new THREE.MeshStandardMaterial({ color: '#6f6a62', roughness: 0.95 }), driftCount);
  const driftLight = new THREE.DirectionalLight('#cfd8ff', 1.2);
  driftLight.position.set(-1, 1, 1);
  scene.add(drifters, driftLight);
  const drift = Array.from({ length: driftCount }, () => ({
    p: new THREE.Vector3(rand(-60, 60), rand(-30, 30), rand(-20, 50)),
    v: new THREE.Vector3(rand(-0.6, 0.6), rand(-0.3, 0.3), rand(-0.2, 0.2)),
    axis: new THREE.Vector3().randomDirection(),
    spin: rand(0.1, 0.5),
    s: rand(0.2, 0.9),
  }));
  const dm = new THREE.Matrix4();
  const dq = new THREE.Quaternion();
  hooks.push((t, dt) => {
    drift.forEach((d, i) => {
      d.p.addScaledVector(d.v, dt);
      dq.setFromAxisAngle(d.axis, t * d.spin);
      drifters.setMatrixAt(i, dm.compose(d.p, dq, new THREE.Vector3().setScalar(d.s)));
    });
    drifters.instanceMatrix.needsUpdate = true;
  });

  /* Occasional shooting stars. */
  const streakGeo = new THREE.BufferGeometry();
  streakGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Array(12).fill(0), 3));
  streakGeo.setAttribute('aT', new THREE.Float32BufferAttribute([0, 0, 1, 1], 1));
  streakGeo.setAttribute('aSide', new THREE.Float32BufferAttribute([-1, 1, -1, 1], 1));
  streakGeo.setIndex([0, 2, 1, 1, 2, 3]);
  const streaks = Array.from({ length: 3 }, () => {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uHead: { value: new THREE.Vector3() },
        uDir: { value: new THREE.Vector3(1, 0, 0) },
        uLength: { value: 30 },
        uWidth: { value: 0.35 },
        uAlpha: { value: 0 },
        uColor: { value: new THREE.Color('#dfe9ff') },
      },
      vertexShader: STREAK_VERT,
      fragmentShader: STREAK_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(streakGeo, mat);
    mesh.frustumCulled = false;
    scene.add(mesh);
    return { mat, life: 0, age: 1, head: new THREE.Vector3(), dir: new THREE.Vector3(), speed: 0 };
  });
  let nextStreak = rand(1.5, 3);
  const fwd = new THREE.Vector3();
  const rightV = new THREE.Vector3();
  const upV = new THREE.Vector3();
  hooks.push((t, dt) => {
    if (!reduced && t > nextStreak) {
      nextStreak = t + rand(2.5, 6);
      const s = streaks.find((x) => x.age >= x.life);
      if (s) {
        camera.getWorldDirection(fwd);
        rightV.setFromMatrixColumn(camera.matrixWorld, 0);
        upV.setFromMatrixColumn(camera.matrixWorld, 1);
        const dist = rand(120, 220);
        s.head.copy(camera.position).addScaledVector(fwd, dist).addScaledVector(rightV, rand(-0.7, 0.7) * dist).addScaledVector(upV, rand(0, 0.5) * dist);
        s.dir.copy(rightV).multiplyScalar(Math.random() < 0.5 ? -1 : 1).addScaledVector(upV, -rand(0.3, 0.8)).normalize();
        s.speed = rand(160, 240);
        s.life = rand(0.7, 1.1);
        s.age = 0;
        s.mat.uniforms.uLength.value = rand(22, 40);
      }
    }
    for (const s of streaks) {
      if (s.age >= s.life) {
        s.mat.uniforms.uAlpha.value = 0;
        continue;
      }
      s.age += dt;
      s.head.addScaledVector(s.dir, s.speed * dt);
      const k = s.age / s.life;
      s.mat.uniforms.uAlpha.value = Math.sin(Math.PI * clamp01(k)) * 0.9;
      s.mat.uniforms.uHead.value.copy(s.head).applyMatrix4(camera.matrixWorldInverse);
      s.mat.uniforms.uDir.value.copy(s.dir).transformDirection(camera.matrixWorldInverse);
    }
  });

  /* Labels */
  for (const g of galaxies) {
    const label = document.createElement('button');
    label.type = 'button';
    label.className = 'galaxy-label';
    label.style.setProperty('--accent', g.look.accent);
    label.setAttribute('aria-label', `${g.def.name} galaxy: ${g.def.blurb}`);
    const name = document.createElement('span');
    name.className = 'galaxy-name';
    name.textContent = g.def.name;
    const blurb = document.createElement('span');
    blurb.className = 'galaxy-blurb';
    blurb.textContent = g.def.blurb;
    label.append(name, blurb);
    label.addEventListener('click', () => enterGalaxy(g));
    label.addEventListener('pointerenter', () => (hovered = g));
    label.addEventListener('pointerleave', () => hovered === g && (hovered = null));
    label.addEventListener('focus', () => (hovered = g));
    label.addEventListener('blur', () => hovered === g && (hovered = null));
    labelLayer.append(label);
    g.label = label;
    for (const planet of g.planets) {
      const pl = document.createElement('button');
      pl.type = 'button';
      pl.className = 'planet-label is-hidden';
      pl.style.setProperty('--accent', g.look.accent);
      pl.textContent = planet.def.name;
      pl.tabIndex = -1;
      pl.addEventListener('click', () => selectPlanet(planet));
      pl.addEventListener('pointerenter', () => (hoveredPlanet = planet));
      pl.addEventListener('pointerleave', () => hoveredPlanet === planet && (hoveredPlanet = null));
      labelLayer.append(pl);
      planet.label = pl;
    }
  }

  /* Camera choreography */
  let mode = 'intro'; // intro → overview ⇄ entering → system ⇄ exiting; leaving
  let focus = null; // the galaxy we're inside
  let selected = null; // the planet whose panel is open
  let hovered = null;
  let hoveredPlanet = null;
  let anim = null;
  const camPos = new THREE.Vector3(0, 0.35, 2.4);
  const camTarget = new THREE.Vector3();
  camera.position.copy(camPos);
  camera.lookAt(camTarget);

  function animateTo(pos, target, duration, { arc = 0, onDone } = {}) {
    anim = {
      fromPos: camera.position.clone(),
      fromTarget: camTarget.clone(),
      toPos: pos.clone(),
      toTarget: target.clone(),
      start: clock,
      duration: reduced ? 0 : duration,
      arc,
      onDone,
    };
  }

  const controls = new OrbitControls(camera, canvas);
  controls.enabled = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.enablePan = false;
  controls.rotateSpeed = 0.55;
  controls.minDistance = 7;
  controls.maxDistance = 46;
  controls.autoRotate = !reduced;
  controls.autoRotateSpeed = 0.35;

  function systemView(g) {
    const local = portrait ? new THREE.Vector3(0, 10, 30) : new THREE.Vector3(0, 7, 21);
    return g.group.localToWorld(local);
  }

  function setHint(text) {
    hint.textContent = text;
  }

  function enterGalaxy(g) {
    if (mode !== 'overview') return;
    mode = 'entering';
    focus = g;
    hovered = null;
    g.mixTarget = 1;
    g.system.visible = true;
    for (const other of galaxies) other.label.classList.add('is-hidden');
    setHint('');
    animateTo(systemView(g), g.group.position, 2.4, {
      arc: 6,
      onDone: () => {
        mode = 'system';
        controls.target.copy(g.group.position);
        controls.enabled = true;
        upButton.hidden = false;
        setHint('Choose a planet');
        g.planets.forEach((p) => (p.label.tabIndex = 0));
        upButton.focus({ preventScroll: true });
      },
    });
  }

  function exitGalaxy() {
    if (mode !== 'system' || !focus) return;
    closePanel();
    const g = focus;
    mode = 'exiting';
    controls.enabled = false;
    upButton.hidden = true;
    g.planets.forEach((p) => {
      p.label.classList.add('is-hidden');
      p.label.tabIndex = -1;
    });
    camTarget.copy(controls.target);
    g.mixTarget = 0;
    setHint('');
    animateTo(overview.pos, overview.target, 1.9, {
      arc: 4,
      onDone: () => {
        mode = 'overview';
        focus = null;
        g.system.visible = false;
        for (const other of galaxies) other.label.classList.remove('is-hidden');
        setHint('Choose a galaxy');
      },
    });
  }

  function selectPlanet(planet) {
    if (mode !== 'system') return;
    selected = planet;
    for (const g of galaxies) for (const p of g.planets) p.label.classList.toggle('is-selected', p === planet);
    showPanel(planet);
  }

  function showPanel(planet) {
    const g = focus;
    panel.style.setProperty('--accent', g.look.accent);
    panelKicker.textContent = planet.def.kicker;
    panelTitle.textContent = planet.def.name;
    panelBody.replaceChildren();
    if (planet.def.type === 'projects') {
      for (const project of PROJECTS) {
        const item = document.createElement('article');
        item.className = 'cosmos-item';
        const h = document.createElement('h3');
        h.textContent = project.name;
        const meta = document.createElement('p');
        meta.className = 'meta';
        meta.textContent = `${project.status} · ${project.place}`;
        const text = document.createElement('p');
        text.className = 'text';
        text.textContent = project.blurb;
        const go = document.createElement('button');
        go.type = 'button';
        go.textContent = 'Visit on Earth ↗';
        go.addEventListener('click', () => leave(project.id));
        item.append(h, meta, text, go);
        panelBody.append(item);
      }
    } else {
      for (const entry of planet.def.items ?? []) {
        const item = document.createElement('article');
        item.className = 'cosmos-item';
        const h = document.createElement('h3');
        h.textContent = entry.title;
        item.append(h);
        if (entry.meta) {
          const meta = document.createElement('p');
          meta.className = 'meta';
          meta.textContent = entry.meta;
          item.append(meta);
        }
        if (entry.text) {
          const text = document.createElement('p');
          text.className = 'text';
          text.textContent = entry.text;
          item.append(text);
        }
        panelBody.append(item);
      }
    }
    panel.hidden = false;
    panel.scrollTop = 0;
    requestAnimationFrame(() => panel.classList.add('is-open'));
  }

  function closePanel() {
    selected = null;
    for (const g of galaxies) for (const p of g.planets) p.label.classList.remove('is-selected');
    panel.classList.remove('is-open');
    setTimeout(() => !panel.classList.contains('is-open') && (panel.hidden = true), 450);
  }

  function leave(projectId = null) {
    if (mode === 'leaving' || disposed) return;
    closePanel();
    if (mode === 'system') camTarget.copy(controls.target);
    mode = 'leaving';
    controls.enabled = false;
    upButton.hidden = true;
    for (const g of galaxies) {
      g.label.classList.add('is-hidden');
      g.planets.forEach((p) => p.label.classList.add('is-hidden'));
    }
    setHint('');
    animateTo(new THREE.Vector3(0, 0.35, 2.4), new THREE.Vector3(), 1.3);
    root.classList.add('is-leaving');
    if (projectId) onVisitProject?.(projectId);
    else onLeave?.();
    setTimeout(dispose, reduced ? 0 : 1300);
  }

  /* Pointer: hover and click on galaxies and planets */
  const pointer = { x: 0, y: 0, nx: 0, ny: 0, px: 0, py: 0, down: null };
  const tmp = new THREE.Vector3();
  function toScreen(v) {
    tmp.copy(v).project(camera);
    return { x: ((tmp.x + 1) / 2) * innerWidth, y: ((1 - tmp.y) / 2) * innerHeight, behind: tmp.z > 1 };
  }
  function galaxyAt(x, y) {
    for (const g of galaxies) {
      const s = toScreen(g.group.position);
      const dist = camera.position.distanceTo(g.group.position);
      const rpx = (radius / dist) * (innerHeight / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * 0.7;
      if (!s.behind && Math.hypot(s.x - x, s.y - y) < rpx) return g;
    }
    return null;
  }
  function planetAt(x, y) {
    if (!focus) return null;
    let hit = null;
    let best = Infinity;
    for (const p of focus.planets) {
      const s = toScreen(p.group.getWorldPosition(new THREE.Vector3()));
      const d = Math.hypot(s.x - x, s.y - y);
      if (d < 44 && d < best) {
        hit = p;
        best = d;
      }
    }
    return hit;
  }
  const onMove = (e) => {
    pointer.nx = (e.clientX / innerWidth) * 2 - 1;
    pointer.ny = (e.clientY / innerHeight) * 2 - 1;
    if (e.target !== canvas) return;
    if (mode === 'overview') hovered = galaxyAt(e.clientX, e.clientY);
    if (mode === 'system') hoveredPlanet = planetAt(e.clientX, e.clientY);
    canvas.style.cursor = (mode === 'overview' && hovered) || (mode === 'system' && hoveredPlanet) ? 'pointer' : mode === 'system' ? 'grab' : 'default';
  };
  const onDown = (e) => (pointer.down = { x: e.clientX, y: e.clientY, t: e.timeStamp });
  const onUp = (e) => {
    const d = pointer.down;
    pointer.down = null;
    if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 8 || e.timeStamp - d.t > 500) return;
    if (mode === 'overview') {
      const g = galaxyAt(e.clientX, e.clientY);
      if (g) enterGalaxy(g);
    } else if (mode === 'system') {
      const p = planetAt(e.clientX, e.clientY);
      if (p) selectPlanet(p);
      else if (selected) closePanel();
    }
  };
  window.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointerup', onUp);
  controls.addEventListener('start', () => (controls.autoRotate = false));

  const onKey = (e) => {
    if (e.key !== 'Escape') return;
    if (selected) closePanel();
    else if (mode === 'system') exitGalaxy();
    else if (mode === 'overview') leave();
  };
  window.addEventListener('keydown', onKey);
  homeButton.onclick = () => leave();
  upButton.onclick = () => exitGalaxy();
  panelClose.onclick = () => closePanel();

  function onResize() {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', onResize);

  /* Loop */
  let clock = 0;
  let last = performance.now();
  let raf = 0;
  let disposed = false;
  const lean = new THREE.Vector3();
  const tmpPos = new THREE.Vector3();

  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    clock += dt;
    time.value = clock;
    for (const fn of hooks) fn(clock, dt);

    // Galaxies: spin, brighten on hover, give way to their system when entered.
    for (const g of galaxies) {
      const wantBright = (hovered === g && mode === 'overview') || (focus === g && mode !== 'overview') ? 1 : 0;
      g.bright += (wantBright - g.bright) * (1 - Math.exp(-dt / 0.25));
      g.mix += (g.mixTarget - g.mix) * (1 - Math.exp(-dt / 0.6));
      const u = g.disk.material.uniforms;
      u.uBright.value = g.bright * (1 - g.mix);
      u.uOpacity.value = 1 - 0.82 * g.mix;
      g.coreGlow.material.opacity = (0.85 + 0.35 * g.bright) * (1 - 0.9 * g.mix);
      g.coreGlow.scale.setScalar(radius * (0.55 + 0.12 * g.bright));
      g.haze.material.opacity = 0.18 * (1 - 0.7 * g.mix);
      g.label.classList.toggle('is-hover', hovered === g);
      if (g.system.visible) {
        const s = smootherstep((g.mix - 0.25) / 0.75);
        g.system.scale.setScalar(Math.max(s, 0.001));
        g.star.surface.material.uniforms.uTime.value = clock;
        const pulse = 1 + 0.04 * Math.sin(clock * 2.1);
        g.star.coronas.forEach((c, i) => c.scale.setScalar(g.look.star.size * [4.5, 10, 22][i] * pulse));
        for (const p of g.planets) {
          p.angle += p.speed * dt * (reduced ? 0.3 : 1);
          p.group.position.copy(orbitPoint(p, p.angle, clock));
          p.body.rotation.y += dt * 0.25;
        }
        g.belt.rotation.y += dt * 0.02;
      }
    }

    // Camera.
    if (anim) {
      const k = anim.duration ? clamp01((clock - anim.start) / anim.duration) : 1;
      const e = smootherstep(k);
      camera.position.lerpVectors(anim.fromPos, anim.toPos, e);
      camera.position.y += Math.sin(e * Math.PI) * anim.arc;
      camTarget.lerpVectors(anim.fromTarget, anim.toTarget, e);
      camera.lookAt(camTarget);
      if (k >= 1) {
        const done = anim.onDone;
        anim = null;
        done?.();
      }
    } else if (mode === 'overview') {
      // Lean toward the hovered galaxy and drift with the pointer.
      lean.copy(overview.target);
      if (hovered) lean.lerp(hovered.group.position, 0.14);
      camTarget.lerp(lean, 1 - Math.exp(-dt / 0.4));
      pointer.px += (pointer.nx - pointer.px) * (1 - Math.exp(-dt / 0.5));
      pointer.py += (pointer.ny - pointer.py) * (1 - Math.exp(-dt / 0.5));
      tmpPos.copy(overview.pos).add(new THREE.Vector3(pointer.px * 4, -pointer.py * 2.5, 0));
      if (hovered) tmpPos.lerp(hovered.group.position, 0.06);
      camera.position.lerp(tmpPos, 1 - Math.exp(-dt / 0.5));
      camera.lookAt(camTarget);
    } else if (mode === 'system' && controls.enabled) {
      // Follow the chosen planet; otherwise orbit the star.
      const want = selected ? selected.group.getWorldPosition(tmpPos) : focus.group.position;
      const before = controls.target.clone();
      controls.target.lerp(want, 1 - Math.exp(-dt / 0.45));
      camera.position.add(controls.target.clone().sub(before));
      const offset = camera.position.clone().sub(controls.target);
      const desired = selected ? selected.look.size * 7 + 3 : offset.length();
      offset.setLength(offset.length() + (desired - offset.length()) * (1 - Math.exp(-dt / 0.6)));
      camera.position.copy(controls.target).add(offset);
      controls.update();
    }
    camera.updateMatrixWorld();

    // Keep labels pinned under their galaxy or planet.
    for (const g of galaxies) {
      const s = toScreen(g.group.position);
      const dist = camera.position.distanceTo(g.group.position);
      const rpx = (radius / dist) * (innerHeight / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
      g.label.style.transform = `translate(${s.x.toFixed(1)}px, ${(s.y + rpx * 0.5).toFixed(1)}px) translate(-50%, 0)`;
      for (const p of g.planets) {
        const show = focus === g && mode === 'system';
        p.label.classList.toggle('is-hidden', !show);
        p.label.classList.toggle('is-hover', hoveredPlanet === p);
        if (!show) continue;
        const ps = toScreen(p.group.getWorldPosition(tmpPos));
        const prad = (p.look.size / camera.position.distanceTo(tmpPos)) * (innerHeight / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
        p.label.style.transform = `translate(${ps.x.toFixed(1)}px, ${(ps.y + prad + 10).toFixed(1)}px) translate(-50%, 0)`;
      }
    }

    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }

  await renderer.compileAsync(scene, camera);
  raf = requestAnimationFrame(frame);

  function dispose() {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(raf);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', onResize);
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointerup', onUp);
    controls.dispose();
    scene.traverse((obj) => {
      obj.geometry?.dispose();
      const mats = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : [];
      for (const m of mats) {
        for (const value of Object.values(m)) if (value?.isTexture) value.dispose();
        m.dispose();
      }
    });
    glowTex.dispose();
    renderer.dispose();
    labelLayer.replaceChildren();
    panel.hidden = true;
    panel.classList.remove('is-open');
    upButton.hidden = true;
    root.hidden = true;
    root.classList.remove('is-revealed', 'is-leaving');
    document.body.classList.remove('universe-open');
    if (current === api) current = null;
  }

  root.hidden = false;
  upButton.hidden = true;
  panel.hidden = true;
  setHint('');
  for (const g of galaxies) g.label.classList.add('is-hidden');
  document.body.classList.add('universe-open');

  const api = {
    // Fade in and pull back from Earth to reveal the galaxies.
    reveal() {
      requestAnimationFrame(() => !disposed && root.classList.add('is-revealed'));
      animateTo(overview.pos, overview.target, 2.2, {
        onDone: () => {
          mode = 'overview';
          for (const g of galaxies) g.label.classList.remove('is-hidden');
          setHint('Choose a galaxy');
          homeButton.focus({ preventScroll: true });
        },
      });
    },
    dispose,
  };
  current = api;
  return api;
}
