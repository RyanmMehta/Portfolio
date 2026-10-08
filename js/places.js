// Project places: every pin on the globe opens a small 3D world built around
// a picture of the project. Scenes are procedural, one builder per theme.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const root = document.getElementById('place');
const canvas = document.getElementById('place-canvas');
const backButton = document.getElementById('place-back');
const card = root.querySelector('.place-card');

const UP = new THREE.Vector3(0, 1, 0);
const FRAME_Y = 2.3; // height of the picture's centre above the clearing

/* ---------- Helpers ---------- */

const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smoothstep = (a, b, v) => {
  const x = clamp01((v - a) / (b - a));
  return x * x * (3 - 2 * x);
};
const smootherstep = (v) => {
  const x = clamp01(v);
  return x * x * x * (x * (x * 6 - 15) + 10);
};

// Cheap smooth noise for colouring and shaping geometry.
function noise3(x, y, z) {
  return (
    Math.sin(x * 1.7 + Math.sin(z * 1.3)) * Math.cos(y * 1.9 - z * 0.7) * 0.5 +
    Math.sin(x * 4.1 - y * 3.3 + z * 2.9) * 0.3 +
    Math.sin(x * 9.7 + z * 8.3 - y * 6.1) * 0.2
  );
}

// Colour each vertex from a palette using smooth noise, darker toward the
// bottom of the shape so canopies read as solid volumes.
function paintVertices(geo, palette, { shadeY = null, scale = 3, dark = 0.62 } = {}) {
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const cols = palette.map((c) => new THREE.Color(c));
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const n = clamp01(0.5 + 0.5 * noise3(x * scale, y * scale, z * scale));
    const f = n * (cols.length - 1);
    const k = Math.floor(f);
    c.copy(cols[k]).lerp(cols[Math.min(k + 1, cols.length - 1)], f - k);
    if (shadeY) c.multiplyScalar(dark + (1 - dark) * clamp01((y - shadeY[0]) / (shadeY[1] - shadeY[0])));
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

// Indexed geometry with only a position attribute, ready for displacement
// and smooth normals.
function solid(geo) {
  for (const name of Object.keys(geo.attributes)) if (name !== 'position') geo.deleteAttribute(name);
  return mergeVertices(geo);
}

// A soft lumpy foliage clump with smooth shading.
function clump(center, radius, palette, { squash = 1, detail = 1, bump = 0.22, shadeY } = {}) {
  const geo = solid(new THREE.IcosahedronGeometry(radius, detail));
  const pos = geo.attributes.position;
  const seed = rand(0, 10);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const n = 1 + bump * noise3(x * 3 + seed, y * 3, z * 3 - seed);
    pos.setXYZ(i, x * n + center.x, y * n * squash + center.y, z * n + center.z);
  }
  geo.computeVertexNormals();
  return paintVertices(geo, palette, { shadeY: shadeY ?? [center.y - radius, center.y + radius] });
}

function limb(start, end, r0, r1, sides = 8) {
  const dir = end.clone().sub(start);
  const len = dir.length();
  const geo = solid(new THREE.CylinderGeometry(r1, r0, len, sides, 2));
  geo.translate(0, len / 2, 0);
  geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize()));
  geo.translate(start.x, start.y, start.z);
  geo.computeVertexNormals();
  return geo;
}

function barkColors(geo, palette) {
  return paintVertices(geo, palette, { scale: 6, dark: 0.75 });
}

/* ---------- Tree and plant templates ---------- */

const BARK = {
  cherry: ['#3a2422', '#4d302c', '#2e1c1b', '#5a3a33'],
  pine: ['#3b2c22', '#4a3829', '#2f241c'],
  olive: ['#5e5345', '#4c4337', '#6e6252'],
};

function cherryTree() {
  const wood = [];
  const bloom = [];
  const palette = ['#f19bb6', '#f7b5c8', '#fcd2de', '#ffe6ee', '#f6a9c0'];
  const sites = [];
  const grow = (start, dir, len, radius, depth) => {
    const end = start.clone().addScaledVector(dir, len);
    wood.push(limb(start, end, radius, radius * 0.7));
    if (depth === 0) {
      sites.push(end);
      return;
    }
    const kids = depth >= 3 ? 2 : 3;
    const twist = rand(0, Math.PI * 2);
    for (let k = 0; k < kids; k++) {
      const a = twist + (k / kids) * Math.PI * 2 + rand(-0.3, 0.3);
      const d = dir
        .clone()
        .multiplyScalar(0.45)
        .add(new THREE.Vector3(Math.cos(a), rand(0.22, 0.45), Math.sin(a)).multiplyScalar(rand(0.75, 1)))
        .normalize();
      grow(end, d, len * rand(0.64, 0.78), radius * 0.66, depth - 1);
    }
    if (depth === 1) sites.push(end);
  };
  grow(new THREE.Vector3(), new THREE.Vector3(rand(-0.15, 0.15), 1, rand(-0.15, 0.15)).normalize(), rand(1.3, 1.7), 0.22, 4);
  // Each branch tip carries a cluster of small blossom clumps.
  const top = Math.max(...sites.map((s) => s.y)) + 0.6;
  for (const s of sites) {
    for (let i = 0; i < 4; i++) {
      const offset = new THREE.Vector3(rand(-0.45, 0.45), rand(-0.2, 0.3), rand(-0.45, 0.45));
      bloom.push(clump(s.clone().add(offset), rand(0.28, 0.46), palette, { squash: 0.85, shadeY: [0.8, top] }));
    }
  }
  return { wood: barkColors(mergeGeometries(wood), BARK.cherry), leaves: mergeGeometries(bloom) };
}

function conifer() {
  const height = rand(0.9, 1.25);
  const wood = [limb(new THREE.Vector3(), new THREE.Vector3(0, 1.6 * height, 0), 0.18, 0.1)];
  const leaves = [];
  const palette = ['#1f3520', '#2a4428', '#355431', '#24402a', '#3f5f37'];
  const tiers = 6 + Math.floor(rand(0, 3));
  let y = 0.9 * height;
  let r = rand(1.4, 1.8);
  const top = y + tiers * 1.0 * height;
  for (let i = 0; i < tiers; i++) {
    const tierH = rand(1.4, 1.8) * height;
    const cone = solid(new THREE.ConeGeometry(r, tierH, 14, 3));
    const pos = cone.attributes.position;
    for (let v = 0; v < pos.count; v++) {
      const px = pos.getX(v);
      const py = pos.getY(v);
      const pz = pos.getZ(v);
      const rim = clamp01((-py / tierH + 0.5) * 1.2); // 1 at the bottom edge
      const a = Math.atan2(pz, px);
      // Ragged, drooping branch tips around the lower edge of each tier.
      const jag = 1 + rim * (0.16 * Math.sin(a * 7 + i) + 0.08 * Math.sin(a * 13));
      pos.setXYZ(v, px * jag, py - rim * rim * 0.22 * tierH, pz * jag);
    }
    cone.translate(0, y + tierH / 2, 0);
    cone.computeVertexNormals();
    leaves.push(paintVertices(cone, palette, { shadeY: [0, top], scale: 4, dark: 0.5 }));
    y += tierH * 0.5;
    r *= 0.8;
  }
  return { wood: barkColors(mergeGeometries(wood), BARK.pine), leaves: mergeGeometries(leaves) };
}

function cypress() {
  const wood = [limb(new THREE.Vector3(), new THREE.Vector3(0, 1, 0), 0.14, 0.1)];
  const shape = solid(new THREE.SphereGeometry(0.62, 14, 18));
  const stretch = rand(4.4, 5.6);
  const pos = shape.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const n = 1 + 0.12 * noise3(x * 6, y * 6, z * 6);
    // Taper to a point at the top like a flame.
    const taper = 1 - Math.max(0, y / 0.62) * 0.35;
    pos.setXYZ(i, x * n * taper, y * stretch, z * n * taper);
  }
  shape.computeBoundingBox();
  shape.translate(0, 0.7 - shape.boundingBox.min.y, 0);
  shape.computeVertexNormals();
  const palette = ['#1c2f19', '#263d21', '#30482a', '#1f3a1f'];
  return { wood: barkColors(mergeGeometries(wood), BARK.pine), leaves: paintVertices(shape, palette, { shadeY: [0.7, 7], scale: 5, dark: 0.55 }) };
}

function oliveTree() {
  const wood = [];
  const leaves = [];
  const palette = ['#7d8a5c', '#93a070', '#a9b387', '#6f7c50', '#b8bf98'];
  const base = new THREE.Vector3();
  for (let i = 0; i < 3; i++) {
    const a = rand(0, Math.PI * 2);
    const mid = new THREE.Vector3(Math.cos(a) * rand(0.15, 0.35), rand(0.7, 1), Math.sin(a) * rand(0.15, 0.35));
    const top = new THREE.Vector3(Math.cos(a) * rand(0.5, 1), rand(1.6, 2.1), Math.sin(a) * rand(0.5, 1));
    wood.push(limb(base, mid, 0.18, 0.12, 7), limb(mid, top, 0.12, 0.07, 7));
    for (let k = 0; k < 3; k++) {
      leaves.push(clump(top.clone().add(new THREE.Vector3(rand(-0.4, 0.4), rand(0.1, 0.5), rand(-0.4, 0.4))), rand(0.5, 0.75), palette, { squash: 0.7, shadeY: [1.2, 3] }));
    }
  }
  return { wood: barkColors(mergeGeometries(wood), BARK.olive), leaves: mergeGeometries(leaves) };
}

function bush(palette) {
  const parts = [];
  for (let i = 0; i < 5; i++) {
    parts.push(clump(new THREE.Vector3(rand(-0.5, 0.5), rand(0.25, 0.5), rand(-0.5, 0.5)), rand(0.35, 0.6), palette, { squash: 0.8, shadeY: [0, 1.1] }));
  }
  return mergeGeometries(parts);
}

function rock() {
  const geo = solid(new THREE.IcosahedronGeometry(1, 2));
  const pos = geo.attributes.position;
  const seed = rand(0, 10);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const n = 1 + 0.28 * noise3(x * 1.3 + seed, y * 1.3, z * 1.3) + 0.08 * noise3(x * 5, y * 5 + seed, z * 5);
    pos.setXYZ(i, x * n * 1.2, Math.max(y * n * 0.62, -0.2), z * n);
  }
  geo.computeVertexNormals();
  return paintVertices(geo, ['#5d5a55', '#6e6a63', '#4a4844', '#7d786f'], { shadeY: [-0.2, 0.8], scale: 2.5, dark: 0.7 });
}

/* ---------- Placing things ---------- */

const MATERIALS = {
  wood: () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 }),
  leaves: () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78 }),
};

function instance(ctx, geo, material, placements, { yOffset = -0.05 } = {}) {
  const mesh = new THREE.InstancedMesh(geo, material, placements.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  placements.forEach((pl, i) => {
    q.setFromAxisAngle(UP, pl.rot ?? rand(0, Math.PI * 2));
    s.setScalar(pl.scale ?? 1);
    p.set(pl.x, ctx.heightAt(pl.x, pl.z) + yOffset, pl.z);
    mesh.setMatrixAt(i, m.compose(p, q, s));
  });
  mesh.castShadow = ctx.shadows;
  mesh.receiveShadow = ctx.shadows;
  ctx.scene.add(mesh);
  return mesh;
}

// Instance a handful of tree templates over a list of placements.
function plant(ctx, templates, placements) {
  const woodMat = MATERIALS.wood();
  const leafMat = MATERIALS.leaves();
  templates.forEach((tpl, t) => {
    const mine = placements.filter((_, i) => i % templates.length === t);
    if (!mine.length) return;
    instance(ctx, tpl.wood, woodMat, mine);
    instance(ctx, tpl.leaves, leafMat, mine);
  });
}

// Random spots on a ring, keeping the corridor the camera looks down clear.
function scatter(count, { minR, maxR, frontMinR = minR, frontHalfAngle = 1.35 }) {
  const out = [];
  for (let guard = 0; out.length < count && guard < count * 30; guard++) {
    const a = rand(0, Math.PI * 2);
    const r = Math.sqrt(rand(minR * minR, maxR * maxR));
    const x = Math.sin(a) * r;
    const z = Math.cos(a) * r;
    if (r < frontMinR && Math.abs(Math.atan2(x, z)) < frontHalfAngle) continue;
    out.push({ x, z, r });
  }
  return out;
}

function addRocksAndBushes(ctx, { rocks = 0, bushes = 0, bushPalette, minR = 5, maxR = 30 }) {
  if (rocks) {
    const shapes = [rock(), rock(), rock()];
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
    const spots = scatter(Math.round(rocks * ctx.density), { minR, maxR, frontMinR: 4.5, frontHalfAngle: 0.5 });
    shapes.forEach((geo, i) => {
      const mine = spots.filter((_, k) => k % shapes.length === i).map((s) => ({ ...s, scale: rand(0.15, 0.6) * (Math.random() < 0.1 ? 2.5 : 1) }));
      if (mine.length) instance(ctx, geo, mat, mine, { yOffset: 0 });
    });
  }
  if (bushes) {
    const shapes = [bush(bushPalette), bush(bushPalette)];
    const mat = MATERIALS.leaves();
    const spots = scatter(Math.round(bushes * ctx.density), { minR: minR + 1, maxR, frontMinR: 9 });
    shapes.forEach((geo, i) => {
      const mine = spots.filter((_, k) => k % shapes.length === i).map((s) => ({ ...s, scale: rand(0.7, 1.4) }));
      if (mine.length) instance(ctx, geo, mat, mine, { yOffset: -0.1 });
    });
  }
}

/* ---------- Shaders ---------- */

const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAG = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uHorizon;
  uniform vec3 uBottom;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform vec3 uCloudLit;
  uniform vec3 uCloudShade;
  uniform float uClouds;
  uniform float uTime;
  varying vec3 vDir;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p = p * 2.03 + vec2(1.7, 9.2);
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec3 d = normalize(vDir);
    vec3 c = d.y > 0.0
      ? mix(uHorizon, uTop, pow(clamp(d.y, 0.0, 1.0), 0.55))
      : mix(uHorizon, uBottom, smoothstep(0.0, -0.25, d.y));
    float s = max(dot(d, normalize(uSunDir)), 0.0);
    c += uSunColor * (pow(s, 900.0) * 3.0 + pow(s, 40.0) * 0.35 + pow(s, 6.0) * 0.12);

    // Soft clouds on a plane overhead, lit from the sun's side.
    if (uClouds > 0.0 && d.y > 0.0) {
      vec2 uv = d.xz / (d.y + 0.12) * 1.3 + vec2(uTime * 0.006, uTime * 0.002);
      float n = fbm(uv);
      float cover = smoothstep(1.0 - uClouds, 1.0 - uClouds + 0.32, n) * smoothstep(0.0, 0.15, d.y);
      vec3 cloud = mix(uCloudShade, uCloudLit, smoothstep(0.35, 0.85, n)) + uSunColor * pow(s, 10.0) * 0.4;
      c = mix(c, cloud, cover * 0.88);
    }
    gl_FragColor = vec4(c, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

// Wind-blown grass blades, one instance per blade.
const GRASS_VERT = /* glsl */ `
  attribute vec4 aBlade; // x, ground y, z, rotation
  attribute vec2 aShape; // height, lean
  uniform float uTime;
  uniform float uWind;
  uniform float uFogDensity;
  varying float vH;
  varying float vFog;
  varying float vTint;
  void main() {
    float h = position.y;
    vH = h;
    float c = cos(aBlade.w);
    float s = sin(aBlade.w);
    float w = position.x * (1.0 - h * 0.9);
    vec3 p = vec3(w * c, h * aShape.x, w * s);
    float gust = sin(uTime * 1.3 + aBlade.x * 0.31 + aBlade.z * 0.23) * 0.6 + sin(uTime * 2.9 + aBlade.x * 1.7) * 0.25;
    float bend = (aShape.y + gust * uWind) * h * h * aShape.x;
    p.x += bend * 0.7;
    p.z += bend * 0.3;
    vec4 mv = modelViewMatrix * vec4(p + aBlade.xyz, 1.0);
    vFog = 1.0 - exp(-uFogDensity * uFogDensity * mv.z * mv.z);
    vTint = fract(aBlade.x * 0.37 + aBlade.z * 0.91);
    gl_Position = projectionMatrix * mv;
  }
`;

const GRASS_FRAG = /* glsl */ `
  uniform vec3 uBase;
  uniform vec3 uTip;
  uniform vec3 uTipAlt;
  uniform vec3 uFogColor;
  uniform vec3 uLight;
  varying float vH;
  varying float vFog;
  varying float vTint;
  void main() {
    vec3 color = mix(uBase, mix(uTip, uTipAlt, vTint), smoothstep(0.0, 1.0, vH));
    color *= uLight * (0.55 + 0.6 * vH);
    color = mix(color, uFogColor, vFog);
    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

// Particles animated entirely on the GPU. Mode 0: tumbling lit petals.
// Mode 1: soft glowing motes. Mode 2: rain streaks.
const PARTICLE_VERT = /* glsl */ `
  attribute vec4 aSeed;
  uniform float uTime;
  uniform float uHeight;
  uniform float uFloor;
  uniform float uRadius;
  uniform float uFall;
  uniform float uSway;
  uniform float uSpin;
  uniform float uSize;
  uniform float uStretch;
  uniform float uMode;
  uniform float uFogDensity;
  varying vec2 vUv;
  varying float vFade;
  varying float vShade;
  varying float vTint;
  varying float vFog;

  mat3 rotation(vec3 axis, float a) {
    float s = sin(a);
    float c = cos(a);
    float oc = 1.0 - c;
    return mat3(
      oc * axis.x * axis.x + c, oc * axis.x * axis.y + axis.z * s, oc * axis.z * axis.x - axis.y * s,
      oc * axis.x * axis.y - axis.z * s, oc * axis.y * axis.y + c, oc * axis.y * axis.z + axis.x * s,
      oc * axis.z * axis.x + axis.y * s, oc * axis.y * axis.z - axis.x * s, oc * axis.z * axis.z + c
    );
  }

  void main() {
    vUv = uv;
    float speed = 0.7 + 0.6 * aSeed.w;
    float y = mod(aSeed.z * uHeight - uTime * uFall * speed, uHeight);
    float ph = aSeed.w * 40.0;
    vec3 base = vec3((aSeed.x * 2.0 - 1.0) * uRadius, uFloor + y, (aSeed.y * 2.0 - 1.0) * uRadius);
    base.x += sin(uTime * 0.8 + ph) * uSway + uTime * uSway * 0.15;
    base.z += cos(uTime * 0.6 + ph * 1.3) * uSway * 0.7;
    base.x = mod(base.x + uRadius, uRadius * 2.0) - uRadius;
    vFade = smoothstep(0.0, uHeight * 0.1, y) * (1.0 - smoothstep(uHeight * 0.82, uHeight, y));
    vTint = fract(aSeed.x * 17.0 + aSeed.y * 31.0);
    float size = uSize * (0.6 + 0.8 * aSeed.w);

    vec4 mvPosition;
    if (uMode < 0.5) {
      vec3 axis = normalize(vec3(sin(ph), cos(ph * 0.7), sin(ph * 1.7) + 0.3));
      mat3 R = rotation(axis, uTime * uSpin * speed + ph);
      vec3 n = R * vec3(0.0, 0.0, 1.0);
      vShade = 0.6 + 0.4 * abs(dot(n, normalize(vec3(0.3, 1.0, 0.4))));
      mvPosition = modelViewMatrix * vec4(base + R * (position * size), 1.0);
    } else {
      vShade = 1.0;
      mvPosition = modelViewMatrix * vec4(base, 1.0);
      mvPosition.xy += position.xy * vec2(size, size * uStretch);
    }
    float depth = -mvPosition.z;
    vFog = 1.0 - exp(-uFogDensity * uFogDensity * depth * depth);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const PARTICLE_FRAG = /* glsl */ `
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec3 uFogColor;
  uniform float uOpacity;
  uniform float uMode;
  varying vec2 vUv;
  varying float vFade;
  varying float vShade;
  varying float vTint;
  varying float vFog;
  void main() {
    vec3 color = mix(uColorA, uColorB, vTint) * vShade;
    float alpha = uOpacity * vFade;
    if (uMode > 0.5) {
      vec2 p = vUv * 2.0 - 1.0;
      float d = uMode > 1.5 ? abs(p.x) : length(p);
      alpha *= pow(max(1.0 - d, 0.0), uMode > 1.5 ? 1.2 : 2.4);
      alpha *= 1.0 - vFog;
    } else {
      color = mix(color, uFogColor, vFog);
    }
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(color, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const GLOW_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const GLOW_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity;
  uniform float uPower;
  varying vec2 vUv;
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    float g = pow(max(1.0 - d, 0.0), uPower) * uIntensity;
    gl_FragColor = vec4(uColor * g, g);
    #include <colorspace_fragment>
  }
`;

// A light shaft or spotlight cone: bright at the source, fading along its length.
const BEAM_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity;
  uniform float uAcross;
  varying vec2 vUv;
  void main() {
    float along = pow(vUv.y, 1.6);
    float across = mix(1.0, 1.0 - abs(vUv.x * 2.0 - 1.0), uAcross);
    float g = along * pow(across, 1.5) * uIntensity;
    gl_FragColor = vec4(uColor * g, g);
    #include <colorspace_fragment>
  }
`;

function glowMaterial(color, intensity = 1, power = 2) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uIntensity: { value: intensity }, uPower: { value: power } },
    vertexShader: GLOW_VERT,
    fragmentShader: GLOW_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

// `flat` beams fade toward their side edges; cones wrap all the way round.
function beamMaterial(color, intensity, flat = true) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uIntensity: { value: intensity }, uAcross: { value: flat ? 1 : 0 } },
    vertexShader: GLOW_VERT,
    fragmentShader: BEAM_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
}

/* ---------- Shared scene pieces ---------- */

function petalGeometry() {
  const s = new THREE.Shape();
  s.moveTo(0, -0.5);
  s.quadraticCurveTo(0.55, -0.15, 0.32, 0.32);
  s.quadraticCurveTo(0.16, 0.5, 0, 0.36);
  s.quadraticCurveTo(-0.16, 0.5, -0.32, 0.32);
  s.quadraticCurveTo(-0.55, -0.15, 0, -0.5);
  return new THREE.ShapeGeometry(s, 4);
}

function addParticles(ctx, spec) {
  const count = Math.round(spec.count * ctx.density);
  const base = spec.mode === 'petal' ? petalGeometry() : new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index;
  geo.setAttribute('position', base.attributes.position);
  geo.setAttribute('uv', base.attributes.uv);
  const seeds = new Float32Array(count * 4);
  for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random();
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
  geo.instanceCount = count;
  const mode = { petal: 0, glow: 1, rain: 2 }[spec.mode];
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: ctx.time,
      uHeight: { value: spec.height },
      uFloor: { value: spec.floor ?? 0 },
      uRadius: { value: spec.radius },
      uFall: { value: spec.fall * (ctx.reduced ? 0.4 : 1) },
      uSway: { value: spec.sway ?? 0 },
      uSpin: { value: spec.spin ?? 0 },
      uSize: { value: spec.size },
      uStretch: { value: spec.stretch ?? 1 },
      uMode: { value: mode },
      uColorA: { value: new THREE.Color(spec.colors[0]) },
      uColorB: { value: new THREE.Color(spec.colors[1]) },
      uOpacity: { value: spec.opacity ?? 1 },
      uFogColor: { value: new THREE.Color(ctx.theme.fog.color) },
      uFogDensity: { value: ctx.theme.fog.density },
    },
    vertexShader: PARTICLE_VERT,
    fragmentShader: PARTICLE_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: mode === 0 ? THREE.NormalBlending : THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  ctx.scene.add(mesh);
}

function addGrass(ctx, spec) {
  const count = Math.round(spec.count * ctx.density);
  const blade = new THREE.PlaneGeometry(spec.width ?? 0.07, 1, 1, 4).translate(0, 0.5, 0);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = blade.index;
  geo.setAttribute('position', blade.attributes.position);
  const blades = new Float32Array(count * 4);
  const shapes = new Float32Array(count * 2);
  let n = 0;
  for (let i = 0; i < count; i++) {
    const a = rand(0, Math.PI * 2);
    const r = Math.sqrt(rand(0.3, 1)) * spec.radius;
    const x = Math.sin(a) * r;
    const z = Math.cos(a) * r;
    if (ctx.theme.carve && ctx.theme.carve(x, z) < -0.15) continue;
    blades.set([x, ctx.heightAt(x, z) - 0.02, z, rand(0, Math.PI * 2)], n * 4);
    shapes.set([spec.height * rand(0.55, 1.25), rand(-0.25, 0.35)], n * 2);
    n++;
  }
  geo.setAttribute('aBlade', new THREE.InstancedBufferAttribute(blades, 4));
  geo.setAttribute('aShape', new THREE.InstancedBufferAttribute(shapes, 2));
  geo.instanceCount = n;
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: ctx.time,
      uWind: { value: ctx.reduced ? 0.1 : spec.wind ?? 0.35 },
      uBase: { value: new THREE.Color(spec.colors[0]) },
      uTip: { value: new THREE.Color(spec.colors[1]) },
      uTipAlt: { value: new THREE.Color(spec.colors[2] ?? spec.colors[1]) },
      uLight: { value: new THREE.Color(spec.light ?? '#ffffff') },
      uFogColor: { value: new THREE.Color(ctx.theme.fog.color) },
      uFogDensity: { value: ctx.theme.fog.density },
    },
    vertexShader: GRASS_VERT,
    fragmentShader: GRASS_FRAG,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  ctx.scene.add(mesh);
}

function makeGround(ctx) {
  const { theme } = ctx;
  const size = 280;
  const seg = ctx.density < 0.8 ? 140 : 200;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const [c0, c1, c2] = theme.ground.colors.map((c) => new THREE.Color(c));
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setY(i, ctx.heightAt(x, z) + 0.04 * noise3(x * 0.9, 0, z * 0.9));
    const n = clamp01(0.5 + 0.5 * noise3(x * 0.12, 0.3, z * 0.12));
    c.copy(c0).lerp(c1, n);
    if (theme.ground.style === 'fields') {
      const band = Math.sin(x * 0.07 + z * 0.035 + Math.sin(z * 0.05) * 1.5);
      if (c2 && band > 0.45) c.lerp(c2, 0.7);
    } else if (c2) {
      // Patches of fallen petals, moss or puddles.
      const patch = noise3(x * 0.18 + 3, 1, z * 0.18);
      c.lerp(c2, smoothstep(0.15, 0.6, patch) * 0.7);
    }
    c.multiplyScalar(0.9 + 0.2 * clamp01(0.5 + 0.5 * noise3(x * 1.7, 2, z * 1.7)));
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: theme.ground.roughness ?? 1,
      metalness: theme.ground.metalness ?? 0,
    }),
  );
  mesh.receiveShadow = ctx.shadows;
  ctx.scene.add(mesh);
}

function makeSky(ctx) {
  const { theme } = ctx;
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTop: { value: new THREE.Color(theme.sky.top) },
      uHorizon: { value: new THREE.Color(theme.sky.horizon) },
      uBottom: { value: new THREE.Color(theme.sky.bottom) },
      uSunDir: { value: new THREE.Vector3(...theme.sun.dir).normalize() },
      uSunColor: { value: new THREE.Color(theme.sky.sun ?? '#000000') },
      uCloudLit: { value: new THREE.Color(theme.sky.cloudLit ?? '#ffffff') },
      uCloudShade: { value: new THREE.Color(theme.sky.cloudShade ?? '#9aa4b5') },
      uClouds: { value: theme.sky.clouds ?? 0 },
      uTime: ctx.time,
    },
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(500, 48, 24), material);
  sky.renderOrder = -1;
  ctx.scene.add(sky);

  if (theme.stars) {
    const n = 1100;
    const p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3().randomDirection();
      v.y = Math.abs(v.y) * 0.9 + 0.08;
      v.normalize().multiplyScalar(480);
      p.set([v.x, v.y, v.z], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    ctx.scene.add(
      new THREE.Points(g, new THREE.PointsMaterial({ color: '#cfdcff', size: 1.3, sizeAttenuation: false, transparent: true, opacity: 0.75, fog: false })),
    );
  }
  return sky;
}

// Light the scene with its own sky, so shading and reflections pick up the
// sky's colours the way they would outdoors.
function makeEnvironment(ctx, renderer, sky) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(sky.geometry, sky.material));
  const target = pmrem.fromScene(envScene, 0.03, 0.1, 1000); // far enough to include the sky dome
  ctx.scene.environment = target.texture;
  ctx.scene.environmentIntensity = ctx.theme.envIntensity ?? 0.7;
  pmrem.dispose();
  return target;
}

function makeLights(ctx) {
  const { theme, scene } = ctx;
  scene.add(new THREE.HemisphereLight(theme.hemi.sky, theme.hemi.ground, theme.hemi.intensity * 0.6));
  const sun = new THREE.DirectionalLight(theme.sun.color, theme.sun.intensity);
  sun.position.set(...theme.sun.dir).normalize().multiplyScalar(60);
  if (ctx.shadows) {
    sun.castShadow = true;
    const size = ctx.density < 0.8 ? 1024 : 2048;
    sun.shadow.mapSize.set(size, size);
    const cam = sun.shadow.camera;
    cam.left = cam.bottom = -28;
    cam.right = cam.top = 28;
    cam.near = 1;
    cam.far = 140;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.05;
    sun.shadow.radius = 3;
  }
  scene.add(sun);
}

function textureFromCanvas(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function glowSpriteTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return textureFromCanvas(c);
}

// One tile of a building facade: COLS × ROWS windows, some lit.
function windowTexture({ lit = 0.45, warm = 0.6, cols = 8, rows = 8 }) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, c.width, c.height);
  const cw = c.width / cols;
  const rh = c.height / rows;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const on = Math.random() < lit;
      const b = on ? rand(0.45, 1) : rand(0.02, 0.06);
      g.fillStyle = Math.random() < warm ? `rgba(255, ${185 + rand(0, 45)}, ${110 + rand(0, 50)}, ${b})` : `rgba(175, 205, 255, ${b})`;
      g.fillRect(x * cw + cw * 0.18, y * rh + rh * 0.22, cw * 0.64, rh * 0.56);
    }
  }
  const t = textureFromCanvas(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Buildings merged into one mesh, with facade UVs scaled to each building's
// size so windows keep a real-world spacing. Roofs get no windows.
function buildings(ctx, list, { color, windows, emissive = 1, tile = 3.2 }) {
  const parts = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  for (const b of list) {
    const geo = new THREE.BoxGeometry(b.w, b.h, b.d);
    const uv = geo.attributes.uv;
    // Faces: +x, -x, +y, -y, +z, -z; four vertices each.
    const faceSize = [[b.d, b.h], [b.d, b.h], [0, 0], [0, 0], [b.w, b.h], [b.w, b.h]];
    const jitter = [Math.floor(rand(0, 8)), Math.floor(rand(0, 8))];
    for (let f = 0; f < 6; f++) {
      const [fw, fh] = faceSize[f];
      for (let v = 0; v < 4; v++) {
        const i = f * 4 + v;
        if (!fw) uv.setXY(i, 0.01, 0.01);
        else uv.setXY(i, uv.getX(i) * (fw / tile) + jitter[0], uv.getY(i) * (fh / tile) + jitter[1]);
      }
    }
    geo.translate(0, b.h / 2, 0);
    q.setFromAxisAngle(UP, b.rot ?? 0);
    const place = m.compose(new THREE.Vector3(b.x, ctx.heightAt(b.x, b.z) - 0.1 + (b.y ?? 0), b.z), q, one);
    geo.applyMatrix4(place);
    parts.push(geo);
    // Rooftop clutter on some buildings.
    if (b.h > 6 && Math.random() < 0.5) {
      const box = new THREE.BoxGeometry(b.w * rand(0.2, 0.4), rand(0.6, 1.6), b.d * rand(0.2, 0.4));
      box.attributes.uv.array.fill(0.01);
      box.translate(rand(-b.w, b.w) * 0.2, b.h + 0.4, rand(-b.d, b.d) * 0.2);
      box.applyMatrix4(place);
      parts.push(box);
    }
  }
  const mesh = new THREE.Mesh(
    mergeGeometries(parts),
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.55,
      metalness: 0.35,
      emissive: '#ffffff',
      emissiveMap: windows,
      emissiveIntensity: emissive,
    }),
  );
  mesh.castShadow = ctx.shadows;
  mesh.receiveShadow = ctx.shadows;
  ctx.scene.add(mesh);
  return mesh;
}

/* ---------- Landmarks and set pieces ---------- */

// Merge simple primitives that share a look into one mesh per material.
// Each part: { geo, color, rough, metal, glow }.
function assemble(ctx, parts, { shadows = true } = {}) {
  const groups = new Map();
  for (const p of parts) {
    for (const name of Object.keys(p.geo.attributes)) if (name !== 'position' && name !== 'normal') p.geo.deleteAttribute(name);
    const key = `${p.color}|${p.rough ?? 0.7}|${p.metal ?? 0}|${p.glow ?? ''}`;
    if (!groups.has(key)) groups.set(key, { ...p, geos: [] });
    groups.get(key).geos.push(p.geo.index ? p.geo : mergeVertices(p.geo));
  }
  const group = new THREE.Group();
  for (const g of groups.values()) {
    const mesh = new THREE.Mesh(
      mergeGeometries(g.geos),
      new THREE.MeshStandardMaterial({
        color: g.color,
        roughness: g.rough ?? 0.7,
        metalness: g.metal ?? 0,
        emissive: g.glow ?? '#000000',
        emissiveIntensity: g.glow ? 1.6 : 0,
      }),
    );
    mesh.castShadow = ctx.shadows && shadows && !g.glow;
    mesh.receiveShadow = ctx.shadows;
    group.add(mesh);
  }
  ctx.scene.add(group);
  return group;
}

// Position a primitive: rotations are applied X, Z, then Y.
function at(geo, x, y, z, ry = 0, rx = 0, rz = 0) {
  if (rx) geo.rotateX(rx);
  if (rz) geo.rotateZ(rz);
  if (ry) geo.rotateY(ry);
  return geo.translate(x, y, z);
}
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, seg = 16) => new THREE.CylinderGeometry(rt, rb, h, seg);

// A square hip roof: a four-sided pyramid squared up to a w × d footprint.
function hipRoof(w, d, h) {
  const g = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1).rotateY(Math.PI / 4);
  return g.scale(w, h, d).translate(0, h / 2, 0);
}

function halo(ctx, color, position, size, opacity = 0.8) {
  ctx.glowTex ??= glowSpriteTexture();
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: ctx.glowTex, color, blending: THREE.AdditiveBlending, depthWrite: false, opacity }));
  s.position.copy(position);
  s.scale.setScalar(size);
  ctx.scene.add(s);
  return s;
}

// Far-off peaks, hazed toward the horizon colour by hand so they stay
// visible through the scene's fog.
function mountains(ctx, peaks, { rock, snow = null, snowLine = 0.62, haze = 0.45 }) {
  const horizon = new THREE.Color(ctx.theme.sky.horizon);
  const geos = peaks.map(({ x, z, r, h, y = 0, sx = 1, sz = 1 }) => {
    const g = solid(new THREE.ConeGeometry(r, h, 40, 14));
    const pos = g.attributes.position;
    const seed = rand(0, 10);
    for (let i = 0; i < pos.count; i++) {
      const px = pos.getX(i);
      const py = pos.getY(i);
      const pz = pos.getZ(i);
      const n = 1 + 0.18 * noise3(px * 0.06 + seed, py * 0.05, pz * 0.06) + 0.07 * noise3(px * 0.2, py * 0.2 + seed, pz * 0.2);
      pos.setXYZ(i, px * n * sx, py + h * 0.06 * noise3(px * 0.1, seed, pz * 0.1), pz * n * sz);
    }
    g.translate(x, y + h / 2, z);
    g.computeVertexNormals();
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const k = (pos.getY(i) - y) / h;
      c.set(rock).multiplyScalar(0.8 + 0.3 * clamp01(0.5 + 0.5 * noise3(pos.getX(i) * 0.1, pos.getY(i) * 0.1, pos.getZ(i) * 0.1)));
      if (snow) c.lerp(new THREE.Color(snow), smoothstep(snowLine - 0.04, snowLine + 0.08, k + 0.08 * noise3(pos.getX(i) * 0.15, 0, pos.getZ(i) * 0.15)));
      c.lerp(horizon, haze);
      colors.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return g;
  });
  const mesh = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, fog: false }));
  ctx.scene.add(mesh);
  return mesh;
}

const WATER_VERT = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

// Rippling water that reflects the sky colours and glints where the sun
// (or moon) catches it.
const WATER_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uRipple;
  uniform vec3 uDeep;
  uniform vec3 uHorizon;
  uniform vec3 uTop;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform vec3 uFogColor;
  uniform float uFogDensity;
  varying vec3 vWorld;
  void main() {
    vec2 p = vWorld.xz * uRipple;
    float t = uTime;
    vec3 n = normalize(vec3(
      0.10 * sin(p.x * 1.3 + t * 1.1) + 0.07 * sin(p.y * 2.1 - t * 1.7) + 0.05 * sin((p.x + p.y) * 3.7 + t * 2.3) + 0.03 * sin(p.x * 7.9 - t * 3.1),
      1.0,
      0.10 * cos(p.y * 1.2 + t * 0.9) + 0.07 * cos(p.x * 2.4 + t * 1.3) + 0.05 * cos((p.x - p.y) * 4.1 - t * 2.0) + 0.03 * cos(p.y * 8.3 + t * 2.7)
    ));
    vec3 V = normalize(cameraPosition - vWorld);
    float fres = pow(1.0 - max(dot(n, V), 0.0), 4.0);
    vec3 R = reflect(-V, n);
    vec3 sky = mix(uHorizon, uTop, pow(clamp(R.y, 0.0, 1.0), 0.6));
    vec3 c = mix(uDeep, sky, 0.15 + 0.85 * fres);
    c += uSunColor * pow(max(dot(R, normalize(uSunDir)), 0.0), 160.0) * 2.5;
    float d = length(cameraPosition - vWorld);
    c = mix(c, uFogColor, 1.0 - exp(-uFogDensity * uFogDensity * d * d));
    gl_FragColor = vec4(c, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function waterMaterial(ctx, { deep, ripple = 0.6, sunColor, fogScale = 1 }) {
  const { theme } = ctx;
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: ctx.time,
      uRipple: { value: ripple },
      uDeep: { value: new THREE.Color(deep) },
      uHorizon: { value: new THREE.Color(theme.sky.horizon) },
      uTop: { value: new THREE.Color(theme.sky.top) },
      uSunDir: { value: new THREE.Vector3(...theme.sun.dir).normalize() },
      uSunColor: { value: new THREE.Color(sunColor ?? theme.sun.color) },
      uFogColor: { value: new THREE.Color(theme.fog.color) },
      uFogDensity: { value: theme.fog.density * fogScale },
    },
    vertexShader: WATER_VERT,
    fragmentShader: WATER_FRAG,
  });
}

/* Jinhae: stream, arched bridge, pavilion, stone lanterns, stepping stones */

const streamZ = (x) => -8 + Math.sin(x * 0.07) * 3;

function stream(ctx) {
  const positions = [];
  const index = [];
  const steps = 160;
  for (let i = 0; i <= steps; i++) {
    const x = -90 + (i / steps) * 180;
    const z = streamZ(x);
    positions.push(x, -0.32, z - 1.9, x, -0.32, z + 1.9);
    if (i < steps) {
      const a = i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(index);
  ctx.scene.add(new THREE.Mesh(geo, waterMaterial(ctx, { deep: '#3d5a63', ripple: 0.9 })));
}

function archedBridge(ctx, x0) {
  const zc = streamZ(x0);
  const parts = [];
  const N = 16;
  const span = 7.5;
  const rise = 1.2;
  const pts = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    pts.push([zc - span / 2 + t * span, Math.sin(t * Math.PI) * rise + 0.08]);
  }
  for (let i = 0; i < N; i++) {
    const [z0, y0] = pts[i];
    const [z1, y1] = pts[i + 1];
    const len = Math.hypot(z1 - z0, y1 - y0);
    const ang = Math.atan2(y1 - y0, z1 - z0);
    const zm = (z0 + z1) / 2;
    const ym = (y0 + y1) / 2;
    parts.push({ geo: at(box(2.1, 0.16, len + 0.03), x0, ym, zm, 0, -ang), color: '#5b2f24', rough: 0.6 });
    for (const side of [-1, 1]) {
      parts.push({ geo: at(box(0.09, 0.08, len + 0.02), x0 + side * 1.0, ym + 0.78, zm, 0, -ang), color: '#b3352c', rough: 0.45 });
      parts.push({ geo: at(box(0.11, 0.8, 0.11), x0 + side * 1.0, y0 + 0.4, z0), color: '#b3352c', rough: 0.45 });
    }
  }
  for (const side of [-1, 1]) {
    parts.push({ geo: at(box(0.11, 0.8, 0.11), x0 + side * 1.0, 0.48, pts[N][0]), color: '#b3352c', rough: 0.45 });
  }
  // Stone abutments where it meets each bank.
  for (const z of [pts[0][0], pts[N][0]]) parts.push({ geo: at(box(2.6, 0.7, 0.9), x0, -0.15, z), color: '#7d7a73', rough: 0.95 });
  assemble(ctx, parts);
}

function pavilion(ctx, x, z, rot = 0) {
  const y = ctx.heightAt(x, z);
  const parts = [];
  const place = (geo) => {
    geo.rotateY(rot);
    return geo.translate(x, y, z);
  };
  parts.push({ geo: place(box(5.4, 0.6, 5.4).translate(0, 0.3, 0)), color: '#8a857c', rough: 0.95 });
  parts.push({ geo: place(box(1.8, 0.3, 0.9).translate(0, 0.15, 3.1)), color: '#8a857c', rough: 0.95 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    parts.push({ geo: place(cyl(0.13, 0.16, 2.6).translate(Math.cos(a) * 2.05, 1.9, Math.sin(a) * 2.05)), color: '#8e2a22', rough: 0.5 });
    const b = a + Math.PI / 6;
    parts.push({ geo: place(box(2.15, 0.26, 0.22).rotateY(-b + Math.PI / 2).translate(Math.cos(b) * 1.78, 3.15, Math.sin(b) * 1.78)), color: '#2f6b5e', rough: 0.6 });
  }
  // Roof with upturned eaves.
  const roof = new THREE.ConeGeometry(3.8, 1.8, 6, 2);
  const rp = roof.attributes.position;
  for (let i = 0; i < rp.count; i++) {
    if (rp.getY(i) < -0.85) {
      rp.setXYZ(i, rp.getX(i) * 1.05, rp.getY(i) + 0.38, rp.getZ(i) * 1.05);
    }
  }
  roof.computeVertexNormals();
  parts.push({ geo: place(roof.translate(0, 4.15, 0)), color: '#3a4442', rough: 0.7 });
  parts.push({ geo: place(new THREE.SphereGeometry(0.2, 12, 8).translate(0, 5.15, 0)), color: '#3a4442', rough: 0.7 });
  assemble(ctx, parts);
}

function stoneLantern(ctx, x, z) {
  const y = ctx.heightAt(x, z);
  const stone = '#8c8981';
  const parts = [
    { geo: at(cyl(0.34, 0.4, 0.24, 8), x, y + 0.12, z), color: stone, rough: 0.95 },
    { geo: at(cyl(0.11, 0.14, 0.8, 8), x, y + 0.64, z), color: stone, rough: 0.95 },
    { geo: at(box(0.56, 0.12, 0.56), x, y + 1.1, z), color: stone, rough: 0.95 },
    { geo: at(box(0.36, 0.34, 0.36), x, y + 1.33, z), color: '#ffd9a0', glow: '#ffb45a' },
    { geo: at(new THREE.ConeGeometry(0.5, 0.34, 4).rotateY(Math.PI / 4), x, y + 1.67, z), color: stone, rough: 0.95 },
    { geo: at(new THREE.SphereGeometry(0.09, 8, 6), x, y + 1.88, z), color: stone, rough: 0.95 },
  ];
  assemble(ctx, parts);
  halo(ctx, '#ffb45a', new THREE.Vector3(x, y + 1.33, z), 1.6, 0.7);
}

function steppingStones(ctx) {
  const geo = solid(new THREE.CylinderGeometry(1, 1, 0.14, 12));
  geo.computeVertexNormals();
  paintVertices(geo, ['#8b877f', '#9c978d', '#77746d'], { scale: 3 });
  const stones = [];
  for (let i = 0; i < 9; i++) {
    const z = 8.5 - i * 0.85;
    stones.push({ x: Math.sin(i * 1.7) * 0.35, z, scale: 1 });
  }
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), stones.length);
  const m = new THREE.Matrix4();
  stones.forEach((s, i) => {
    const r = rand(0.32, 0.44);
    m.compose(new THREE.Vector3(s.x, ctx.heightAt(s.x, s.z) + 0.04, s.z), new THREE.Quaternion().setFromAxisAngle(UP, rand(0, 6)), new THREE.Vector3(r, 1, r * rand(0.75, 0.95)));
    mesh.setMatrixAt(i, m);
  });
  mesh.receiveShadow = ctx.shadows;
  ctx.scene.add(mesh);
}

/* Olympic forest: ferns, mossy logs, mushrooms */

function fern() {
  const fronds = [];
  const n = 9;
  for (let k = 0; k < n; k++) {
    const g = solid(new THREE.PlaneGeometry(0.24, 1.25, 1, 6));
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) + 0.625;
      const taper = 1 - (y / 1.25) * 0.85;
      pos.setXYZ(i, pos.getX(i) * taper, y, y * y * 0.32);
    }
    g.rotateX(-rand(0.5, 0.9));
    g.rotateY((k / n) * Math.PI * 2 + rand(-0.2, 0.2));
    g.computeVertexNormals();
    fronds.push(paintVertices(g, ['#2f5a25', '#3f7330', '#4f8838'], { shadeY: [0, 1], scale: 6, dark: 0.5 }));
  }
  return mergeGeometries(fronds);
}

function mossyLog(ctx, x, z, ry) {
  const len = rand(4, 6);
  const g = solid(new THREE.CylinderGeometry(0.36, 0.42, len, 14, 6));
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const n = 1 + 0.06 * noise3(pos.getX(i) * 4, pos.getY(i) * 2, pos.getZ(i) * 4);
    pos.setXYZ(i, pos.getX(i) * n, pos.getY(i), pos.getZ(i) * n);
  }
  g.computeVertexNormals();
  // Moss on top, bark underneath.
  const colors = new Float32Array(pos.count * 3);
  const bark = new THREE.Color('#4a3a2a');
  const moss = new THREE.Color('#5b7d32');
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    c.copy(bark).lerp(moss, smoothstep(-0.1, 0.25, pos.getX(i)) * (0.8 + 0.2 * noise3(pos.getY(i), pos.getZ(i) * 3, 0)));
    colors.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.rotateZ(Math.PI / 2);
  g.rotateY(ry);
  g.translate(x, ctx.heightAt(x, z) + 0.28, z);
  const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
  mesh.castShadow = mesh.receiveShadow = ctx.shadows;
  ctx.scene.add(mesh);
}

function mushrooms(ctx, near) {
  const stem = cyl(0.03, 0.04, 0.16, 8).translate(0, 0.08, 0);
  const cap = new THREE.SphereGeometry(0.09, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.7, 1).translate(0, 0.15, 0);
  const n = near.length;
  for (const [geo, color] of [[stem, '#efe6d4'], [cap, '#c0392b']]) {
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.6 }), n);
    const m = new THREE.Matrix4();
    near.forEach((p, i) => {
      m.compose(new THREE.Vector3(p.x, ctx.heightAt(p.x, p.z), p.z), new THREE.Quaternion(), new THREE.Vector3().setScalar(p.s));
      mesh.setMatrixAt(i, m);
    });
    ctx.scene.add(mesh);
  }
}

/* New York: landmark towers, a street with traffic */

function landmarkTowers(ctx, windows) {
  // Stepped Art Deco tower with a lit crown and spire.
  const ex = -20;
  const ez = -46;
  buildings(
    ctx,
    [
      { x: ex, z: ez, w: 10, d: 8, h: 16 },
      { x: ex, z: ez, w: 7, d: 6, h: 26, y: 16 },
      { x: ex, z: ez, w: 4.6, d: 4, h: 14, y: 42 },
      { x: ex, z: ez, w: 2.6, d: 2.4, h: 7, y: 56 },
    ],
    { color: '#1a1f2c', windows, emissive: 1.4 },
  );
  assemble(ctx, [
    { geo: at(box(2.7, 1.2, 2.5), ex, 63.6, ez), color: '#cfe0ff', glow: '#9fc2ff' },
    { geo: at(cyl(0.12, 0.5, 11, 8), ex, 69.5, ez), color: '#9aa3b5', metal: 0.8, rough: 0.3 },
  ]);
  halo(ctx, '#ffffff', new THREE.Vector3(ex, 75, ez), 3, 0.9);
  // Spired tower with stacked glowing arches.
  const cx = 24;
  const cz = -54;
  buildings(
    ctx,
    [
      { x: cx, z: cz, w: 8, d: 8, h: 22 },
      { x: cx, z: cz, w: 6, d: 6, h: 24, y: 22 },
    ],
    { color: '#1b202d', windows, emissive: 1.3 },
  );
  const crown = [];
  for (let i = 0; i < 6; i++) {
    const r = 3 - i * 0.48;
    crown.push({ geo: at(new THREE.ConeGeometry(r, 2.2, 4, 1, true).rotateY(Math.PI / 4), cx, 47 + i * 1.7, cz), color: '#d8e2f5', glow: '#a9c4ff' });
  }
  crown.push({ geo: at(cyl(0.05, 0.25, 9, 8), cx, 61, cz), color: '#c5ccd8', metal: 0.8, rough: 0.3 });
  assemble(ctx, crown);
}

function streetTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#16181d';
  g.fillRect(0, 0, 512, 128);
  for (let i = 0; i < 2500; i++) {
    g.fillStyle = `rgba(255,255,255,${rand(0, 0.04)})`;
    g.fillRect(rand(0, 512), rand(0, 128), 2, 2);
  }
  g.fillStyle = '#d9b44a';
  for (let x = 0; x < 512; x += 64) g.fillRect(x + 8, 61, 36, 6);
  g.fillStyle = 'rgba(235,235,235,0.7)';
  g.fillRect(0, 8, 512, 4);
  g.fillRect(0, 116, 512, 4);
  const t = textureFromCanvas(c);
  t.wrapS = THREE.RepeatWrapping;
  t.repeat.set(16, 1);
  return t;
}

function street(ctx) {
  const z = -14;
  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(160, 8).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ map: streetTexture(), roughness: 0.3, metalness: 0.4 }),
  );
  road.position.set(0, 0.02, z);
  road.receiveShadow = ctx.shadows;
  ctx.scene.add(road);
  // Zebra crossing.
  const stripes = [];
  for (let i = 0; i < 8; i++) stripes.push({ geo: at(box(0.5, 0.01, 7), -3.5 + i, 0.04, z), color: '#d8d8d8', rough: 0.5 });
  assemble(ctx, stripes, { shadows: false });

  // Taxis and cars gliding along both lanes, headlights on.
  const cars = [];
  for (let i = 0; i < 10; i++) {
    const dir = i % 2 ? 1 : -1;
    const color = Math.random() < 0.6 ? '#f1c232' : pick(['#1d2433', '#5a1f24', '#d9dde4']);
    const group = new THREE.Group();
    const body = new THREE.Mesh(box(4, 0.75, 1.8).translate(0, 0.62, 0), new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.5 }));
    const cabin = new THREE.Mesh(box(2.2, 0.62, 1.6).translate(-0.2, 1.3, 0), new THREE.MeshStandardMaterial({ color: '#0d1118', roughness: 0.1, metalness: 0.8 }));
    group.add(body, cabin);
    for (const side of [-0.6, 0.6]) {
      const head = new THREE.Sprite(new THREE.SpriteMaterial({ map: (ctx.glowTex ??= glowSpriteTexture()), color: '#fff4d6', blending: THREE.AdditiveBlending, depthWrite: false }));
      head.position.set(2.05, 0.7, side);
      head.scale.setScalar(1.3);
      const tail = new THREE.Sprite(new THREE.SpriteMaterial({ map: ctx.glowTex, color: '#ff3030', blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.8 }));
      tail.position.set(-2.05, 0.75, side);
      tail.scale.setScalar(0.7);
      group.add(head, tail);
    }
    group.rotation.y = dir > 0 ? 0 : Math.PI;
    group.position.set(0, 0, z + (dir > 0 ? 1.9 : -1.9));
    ctx.scene.add(group);
    cars.push({ group, dir, offset: rand(0, 160), speed: rand(7, 11) });
  }
  ctx.onFrame((t) => {
    for (const car of cars) {
      const run = ((car.offset + t * car.speed) % 160) - 80;
      car.group.position.x = car.dir * run;
    }
  });
}

/* Rio: stage platform, ocean, Sugarloaf, Corcovado, palms, moon */

function palmTree() {
  const wood = [];
  const leaves = [];
  const lean = rand(0.15, 0.35);
  const pts = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    pts.push(new THREE.Vector3(Math.sin(t * 1.2) * lean * 3, t * rand(5.5, 6.5), 0));
  }
  for (let i = 0; i < 6; i++) wood.push(limb(pts[i], pts[i + 1], 0.22 - i * 0.02, 0.2 - i * 0.02, 8));
  const top = pts[6];
  for (let k = 0; k < 10; k++) {
    const g = solid(new THREE.PlaneGeometry(0.5, 2.8, 1, 8));
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) + 1.4;
      pos.setXYZ(i, pos.getX(i) * (1 - (y / 2.8) * 0.8), y * 0.9, -y * y * 0.18);
    }
    g.rotateX(-Math.PI / 2 + rand(0.2, 0.5));
    g.rotateY((k / 10) * Math.PI * 2);
    g.translate(top.x, top.y, top.z);
    g.computeVertexNormals();
    leaves.push(paintVertices(g, ['#1f3a22', '#2c4d2b', '#3a5f33'], { scale: 4 }));
  }
  return { wood: barkColors(mergeGeometries(wood), ['#4a3a2e', '#5b4836', '#3b2e24']), leaves: mergeGeometries(leaves) };
}

function rioSkyline(ctx) {
  // Sugarloaf and its smaller neighbour: tall rounded domes over the water.
  const domes = [
    { x: -70, z: -150, sx: 16, sy: 36, sz: 14 },
    { x: -98, z: -140, sx: 12, sy: 20, sz: 10 },
    { x: 95, z: -180, sx: 30, sy: 30, sz: 20 },
  ];
  const horizon = new THREE.Color(ctx.theme.sky.horizon);
  const geos = domes.map((d) => {
    const g = solid(new THREE.SphereGeometry(1, 40, 24, 0, Math.PI * 2, 0, Math.PI / 2));
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const n = 1 + 0.05 * noise3(pos.getX(i) * 3, pos.getY(i) * 3, pos.getZ(i) * 3);
      pos.setXYZ(i, pos.getX(i) * d.sx * n, pos.getY(i) * d.sy, pos.getZ(i) * d.sz * n);
    }
    g.translate(d.x, -1.5, d.z);
    g.computeVertexNormals();
    return paintVertices(g, ['#1e2a2a', '#26342f', '#18211f'], { scale: 0.1 });
  });
  // Corcovado's peak.
  const peak = solid(new THREE.ConeGeometry(34, 64, 36, 10));
  const pp = peak.attributes.position;
  for (let i = 0; i < pp.count; i++) {
    const n = 1 + 0.12 * noise3(pp.getX(i) * 0.1, pp.getY(i) * 0.08, pp.getZ(i) * 0.1);
    pp.setXYZ(i, pp.getX(i) * n, pp.getY(i), pp.getZ(i) * n);
  }
  peak.translate(70, 30.5, -185);
  peak.computeVertexNormals();
  geos.push(paintVertices(peak, ['#1c2826', '#243230', '#151e1c'], { scale: 0.1 }));
  for (const g of geos) {
    const col = g.attributes.color;
    const c = new THREE.Color();
    for (let i = 0; i < col.count; i++) {
      c.setRGB(col.getX(i), col.getY(i), col.getZ(i)).lerp(horizon, 0.25);
      col.setXYZ(i, c.r, c.g, c.b);
    }
  }
  ctx.scene.add(new THREE.Mesh(mergeGeometries(geos), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, fog: false })));

  // The statue on top, softly floodlit.
  const sx = 70;
  const sy = 62.5;
  const sz = -185;
  const statue = assemble(ctx, [
    { geo: at(box(1.2, 1.6, 1.2), sx, sy + 0.8, sz), color: '#dfe5f2', glow: '#5d6a90' },
    { geo: at(cyl(0.45, 0.75, 6.5, 10), sx, sy + 4.8, sz), color: '#dfe5f2', glow: '#5d6a90' },
    { geo: at(box(7.5, 0.7, 0.8), sx, sy + 7.3, sz), color: '#dfe5f2', glow: '#5d6a90' },
    { geo: at(new THREE.SphereGeometry(0.42, 12, 10), sx, sy + 8.4, sz), color: '#dfe5f2', glow: '#5d6a90' },
  ]);
  statue.traverse((o) => o.material && (o.material.fog = false));
  halo(ctx, '#c9d6ff', new THREE.Vector3(sx, sy + 5, sz), 16, 0.35).material.fog = false;
}

function rioBeach(ctx) {
  // Raised stage platform.
  const deck = new THREE.Mesh(cyl(7.6, 7.9, 0.4, 64).translate(0, -0.2, 0), new THREE.MeshStandardMaterial({ color: '#0d0b12', roughness: 0.14, metalness: 0.7 }));
  deck.receiveShadow = ctx.shadows;
  ctx.scene.add(deck);
  const edge = new THREE.Mesh(new THREE.TorusGeometry(7.6, 0.03, 8, 160).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#7fd8ff' }));
  edge.position.y = 0.01;
  ctx.scene.add(edge);
  // The ocean, from the shoreline to the horizon.
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(900, 500).rotateX(-Math.PI / 2), waterMaterial(ctx, { deep: '#04060f', ripple: 0.35, sunColor: '#dfe6ff', fogScale: 0.5 }));
  sea.position.set(0, -1.1, -270);
  ctx.scene.add(sea);
  // A low moon over the water.
  const moonDir = new THREE.Vector3(...ctx.theme.sun.dir).normalize();
  const moon = new THREE.Mesh(new THREE.CircleGeometry(9, 48), new THREE.MeshBasicMaterial({ color: '#f4f1e6', fog: false }));
  moon.position.copy(moonDir).multiplyScalar(420);
  moon.lookAt(0, 0, 0);
  ctx.scene.add(moon);
  halo(ctx, '#c9d4ff', moon.position, 90, 0.35).material.fog = false;
  // Palms along the sand.
  const spots = [];
  for (let i = 0; i < 16; i++) {
    const x = (i / 15 - 0.5) * 90 + rand(-2, 2);
    const z = rand(-16, -11);
    if (Math.abs(x) < 9) continue;
    spots.push({ x, z, scale: rand(0.9, 1.25) });
  }
  plant(ctx, [palmTree(), palmTree(), palmTree()], spots);
}

/* Tuscany: villa, vineyard, hay bales */

function villa(ctx, x, z) {
  const y = ctx.heightAt(x, z) - 0.2;
  const wall = '#dcc7a0';
  const tile = '#b5583a';
  const parts = [
    { geo: at(box(8, 4.2, 5.5), x, y + 2.1, z), color: wall, rough: 0.9 },
    { geo: at(hipRoof(8.6, 6.1, 1.8), x, y + 4.2, z), color: tile, rough: 0.8 },
    { geo: at(box(4.5, 3.2, 4.5), x - 6, y + 1.6, z + 0.6), color: wall, rough: 0.9 },
    { geo: at(hipRoof(5.0, 5.0, 1.4), x - 6, y + 3.2, z + 0.6), color: tile, rough: 0.8 },
    { geo: at(box(2.2, 8.5, 2.2), x + 4.4, y + 4.25, z - 1.2), color: wall, rough: 0.9 },
    { geo: at(hipRoof(2.7, 2.7, 1.3), x + 4.4, y + 8.5, z - 1.2), color: tile, rough: 0.8 },
    { geo: at(box(0.5, 1.4, 0.5), x - 2, y + 5.2, z - 1), color: wall, rough: 0.9 },
  ];
  // Shuttered windows on the front.
  for (let i = 0; i < 4; i++) {
    for (const wy of [1.3, 3.0]) parts.push({ geo: at(box(0.7, 1.0, 0.1), x - 3 + i * 2, y + wy, z + 2.78), color: '#4d5a3a', rough: 0.7 });
  }
  parts.push({ geo: at(box(0.6, 1.2, 0.1), x + 4.4, y + 7, z - 0.07), color: '#2a2622', rough: 0.7 });
  assemble(ctx, parts);
}

function vineyard(ctx) {
  const geo = bush(['#4f6b2c', '#5f7d35', '#6d8a3c', '#3f5a25']);
  const spots = [];
  for (let row = 0; row < 14; row++) {
    for (let k = 0; k < 22; k++) {
      const x = -48 + k * 1.3;
      const z = -18 - row * 2.1;
      spots.push({ x, z, scale: rand(0.38, 0.5), rot: rand(0, 6) });
    }
  }
  const kept = spots.filter((_, i) => i % Math.round(1 / Math.max(ctx.density, 0.5)) === 0);
  instance(ctx, geo, MATERIALS.leaves(), kept, { yOffset: -0.05 });
}

function hayBales(ctx) {
  const geo = cyl(0.8, 0.8, 1.3, 24).rotateZ(Math.PI / 2);
  const spots = scatter(10, { minR: 12, maxR: 34, frontMinR: 16 }).filter((s) => s.x > 6);
  instance(ctx, geo, new THREE.MeshStandardMaterial({ color: '#d4ad57', roughness: 1 }), spots.map((s) => ({ ...s, scale: rand(0.85, 1.1) })), { yOffset: 0.72 });
}

/* Mumbai: gateway arch, marigold garlands, rickshaw, signboards */

function gateway(ctx) {
  const z = -32;
  const stone = '#c9a37a';
  const parts = [];
  for (const side of [-1, 1]) {
    parts.push({ geo: at(box(2.6, 10, 2.6), side * 4, 5, z), color: stone, rough: 0.85 });
    parts.push({ geo: at(new THREE.SphereGeometry(1.2, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), side * 6.8, 15.8, z), color: stone, rough: 0.85 });
    parts.push({ geo: at(cyl(0.12, 0.2, 1.4, 8), side * 6.8, 17.6, z), color: stone, rough: 0.85 });
  }
  parts.push({ geo: at(new THREE.TorusGeometry(4, 1.0, 12, 40, Math.PI), 0, 10, z), color: stone, rough: 0.85 });
  parts.push({ geo: at(box(15, 2.8, 3.2), 0, 14.4, z), color: stone, rough: 0.85 });
  parts.push({ geo: at(new THREE.SphereGeometry(2, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2), 0, 15.8, z), color: stone, rough: 0.85 });
  assemble(ctx, parts);
  // Uplit from below, like at night.
  for (const side of [-1, 1]) {
    const light = new THREE.SpotLight('#ffb070', 120, 30, 0.6, 0.6, 1.4);
    light.position.set(side * 3, 0.5, z + 5);
    light.target.position.set(side * 3, 10, z);
    ctx.scene.add(light, light.target);
  }
}

function garlands(ctx) {
  const pts = [];
  for (let z = -6; z > -29; z -= 7) {
    for (const drop of [0.0, 0.35]) {
      for (let k = 0; k <= 60; k++) {
        const t = k / 60;
        pts.push({ x: -3.75 + t * 7.5, y: 4.75 - Math.sin(t * Math.PI) * (0.9 + drop) - drop * 0.2, z: z + drop * 0.6 });
      }
    }
  }
  const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.065, 8, 6), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.7, emissive: '#7a3000', emissiveIntensity: 0.35 }), pts.length);
  const m = new THREE.Matrix4();
  const c = new THREE.Color();
  pts.forEach((p, i) => {
    m.makeTranslation(p.x, p.y, p.z);
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, c.set(i % 3 === 0 ? '#ffc400' : '#ff7a00'));
  });
  ctx.scene.add(mesh);
}

function rickshaw(ctx, x, z, ry) {
  const parts = [
    { geo: at(box(1.3, 0.75, 2.0), 0, 0.65, 0), color: '#1f6b3a', rough: 0.5, metal: 0.3 },
    { geo: at(box(1.35, 0.12, 2.1), 0, 1.85, -0.1), color: '#f0c419', rough: 0.6 },
    { geo: at(box(1.3, 0.8, 0.08), 0, 1.4, 0.95), color: '#1a2228', rough: 0.1, metal: 0.6 },
    { geo: at(box(0.9, 0.55, 0.8), 0, 0.55, 1.35), color: '#1f6b3a', rough: 0.5, metal: 0.3 },
  ];
  for (const px of [-0.62, 0.62]) {
    for (const pz of [-0.95, 0.9]) parts.push({ geo: at(cyl(0.035, 0.035, 1.1, 6), px, 1.3, pz), color: '#1c1c1c', rough: 0.4, metal: 0.7 });
  }
  for (const [wx, wz] of [[-0.62, -0.7], [0.62, -0.7], [0, 1.45]]) {
    parts.push({ geo: at(new THREE.TorusGeometry(0.24, 0.09, 8, 18), wx, 0.3, wz, Math.PI / 2), color: '#121212', rough: 0.8 });
  }
  const group = assemble(ctx, parts);
  group.rotation.y = ry;
  group.position.set(x, 0, z);
  const head = halo(ctx, '#fff1c8', new THREE.Vector3(x + Math.sin(ry) * 1.8, 0.75, z + Math.cos(ry) * 1.8), 1.1, 0.9);
  return head;
}

function signboards(ctx) {
  const colors = ['#ff4d6a', '#4dd2ff', '#ffd24d', '#b77bff', '#59ff9c'];
  for (let i = 0; i < 8; i++) {
    const side = i % 2 ? 1 : -1;
    const z = -2 - i * 4.5 + rand(-0.8, 0.8);
    const color = pick(colors);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(rand(1.3, 2), rand(0.45, 0.7)), new THREE.MeshBasicMaterial({ color }));
    sign.position.set(side * 4.17, rand(2.4, 3.1), z);
    sign.rotation.y = -side * Math.PI / 2;
    ctx.scene.add(sign);
    halo(ctx, color, sign.position, 2.4, 0.35);
  }
}

/* ---------- Themes ---------- */

const THEMES = {
  blossom: {
    exposure: 1.0,
    envIntensity: 0.75,
    sky: { top: '#7f8bcf', horizon: '#ffcab6', bottom: '#f4d4cc', sun: '#ffd9b4', clouds: 0.42, cloudLit: '#fff1ea', cloudShade: '#c99fb2' },
    sun: { dir: [-0.62, 0.24, -0.76], color: '#ffd3a8', intensity: 2.6 },
    hemi: { sky: '#ffe2ec', ground: '#5d7d4c', intensity: 1.1 },
    fog: { color: '#f1c7c4', density: 0.02 },
    ground: { colors: ['#5f8a45', '#7ea558', '#e9b6c6'], hills: 2.4 },
    carve: (x, z) => -0.9 * smoothstep(2.9, 1.3, Math.abs(z - streamZ(x))),
    azimuth: 0.75,
    grass: { count: 42000, radius: 20, height: 0.42, colors: ['#3d5f2c', '#8ab45c', '#a7c46c'], light: '#ffe9e0' },
    placeholder: { from: '#3b2242', to: '#8a4466', ink: '#fff0f4' },
    particles: [
      { mode: 'petal', count: 1600, radius: 22, height: 14, fall: 0.55, sway: 0.75, spin: 1.6, size: 0.11, colors: ['#ffbfd1', '#ffe6ee'], opacity: 0.95 },
    ],
    build: buildBlossom,
  },
  forest: {
    exposure: 1.0,
    envIntensity: 0.8,
    sky: { top: '#9cb8c9', horizon: '#e7ede7', bottom: '#dfe6e0', sun: '#fff1d6', clouds: 0.5, cloudLit: '#ffffff', cloudShade: '#aab8bd' },
    sun: { dir: [0.55, 0.5, -0.65], color: '#fff0d2', intensity: 2.4 },
    hemi: { sky: '#d6e6ee', ground: '#2f3f2c', intensity: 1.05 },
    fog: { color: '#d2dcd6', density: 0.032 },
    ground: { colors: ['#34492b', '#4b6337', '#6a7a3f'], hills: 3.2 },
    grass: { count: 36000, radius: 18, height: 0.32, colors: ['#22361d', '#5d7d3c', '#7d9248'], light: '#eaf2e2' },
    placeholder: { from: '#0f2a1f', to: '#3a6a45', ink: '#eefae9' },
    particles: [
      { mode: 'glow', count: 420, radius: 16, floor: 0.3, height: 9, fall: -0.12, sway: 0.5, size: 0.08, colors: ['#fff6d8', '#ffe2a0'], opacity: 0.85 },
    ],
    build: buildForest,
  },
  city: {
    exposure: 1.1,
    envIntensity: 1.2,
    sky: { top: '#04060d', horizon: '#1e2a4a', bottom: '#0b0f1a', sun: '#3a4c80' },
    sun: { dir: [-0.3, 0.6, -0.5], color: '#9fb4ff', intensity: 0.55 },
    hemi: { sky: '#3a4f86', ground: '#07080c', intensity: 0.65 },
    fog: { color: '#141c33', density: 0.016 },
    ground: { colors: ['#0e1119', '#151a26', '#0a0d14'], hills: 0, roughness: 0.18, metalness: 0.55 },
    stars: true,
    placeholder: { from: '#0b1226', to: '#253d78', ink: '#e6eeff' },
    particles: [
      { mode: 'rain', count: 2000, radius: 20, height: 16, fall: 11, sway: 0.05, size: 0.016, stretch: 28, colors: ['#9fb8ff', '#d4e0ff'], opacity: 0.3 },
    ],
    build: buildCity,
  },
  stage: {
    exposure: 1.05,
    envIntensity: 1.0,
    sky: { top: '#03030a', horizon: '#1b1530', bottom: '#07040c', sun: '#5a6390' },
    sun: { dir: [0.28, 0.16, -1], color: '#b9c6ff', intensity: 0.6 },
    hemi: { sky: '#3d2a66', ground: '#050308', intensity: 0.55 },
    fog: { color: '#120d1e', density: 0.018 },
    ground: { colors: ['#231d27', '#2c2530', '#1b1620'], hills: 0, roughness: 0.95 },
    // The sand drops away from the stage platform and slopes down to the sea.
    carve: (x, z) => -0.4 * smoothstep(7.6, 8.4, Math.hypot(x, z)) - 1.4 * smoothstep(-11, -22, z),
    stars: true,
    placeholder: { from: '#14081f', to: '#46196a', ink: '#f6ecff' },
    particles: [
      { mode: 'glow', count: 520, radius: 12, height: 10, fall: -0.25, sway: 0.4, size: 0.07, colors: ['#e08bff', '#7fd8ff'], opacity: 0.8 },
    ],
    build: buildStage,
  },
  tuscany: {
    exposure: 1.0,
    envIntensity: 0.75,
    sky: { top: '#76a2d8', horizon: '#ffd39a', bottom: '#f0cf98', sun: '#ffcf8a', clouds: 0.38, cloudLit: '#fff4e2', cloudShade: '#c9a98a' },
    sun: { dir: [-0.75, 0.22, -0.62], color: '#ffc27c', intensity: 2.7 },
    hemi: { sky: '#ffe6bd', ground: '#6a5a33', intensity: 1.0 },
    fog: { color: '#f0d2a2', density: 0.015 },
    ground: { colors: ['#8f914a', '#b0a45a', '#c9b169'], hills: 6.5, style: 'fields' },
    grass: { count: 38000, radius: 20, height: 0.5, colors: ['#6c6a32', '#d8c070', '#b9b05c'], light: '#fff0d8', wind: 0.45 },
    placeholder: { from: '#3b2a17', to: '#9a652f', ink: '#fff3e0' },
    particles: [
      { mode: 'glow', count: 380, radius: 18, floor: 0.2, height: 8, fall: 0.05, sway: 0.9, size: 0.055, colors: ['#fff1c4', '#ffd27a'], opacity: 0.75 },
    ],
    build: buildTuscany,
  },
  lanterns: {
    exposure: 1.15,
    envIntensity: 1.0,
    sky: { top: '#05060b', horizon: '#2c1922', bottom: '#0b0709' },
    sun: { dir: [0.3, 0.7, 0.3], color: '#ffb08a', intensity: 0.25 },
    hemi: { sky: '#4a2a3a', ground: '#06050a', intensity: 0.5 },
    fog: { color: '#24161d', density: 0.026 },
    ground: { colors: ['#121016', '#19141b', '#0c0a0f'], hills: 0, roughness: 0.16, metalness: 0.5 },
    azimuth: 0.42,
    placeholder: { from: '#140c10', to: '#43201f', ink: '#ffe9df' },
    particles: [
      { mode: 'rain', count: 1000, radius: 9, height: 12, fall: 6, size: 0.014, stretch: 20, colors: ['#ffcbb0', '#c9d4ff'], opacity: 0.22 },
      { mode: 'glow', count: 160, radius: 6, floor: 0.5, height: 6, fall: -0.1, sway: 0.6, size: 0.05, colors: ['#ffb27a', '#ff7a59'], opacity: 0.7 },
    ],
    build: buildLanterns,
  },
};

/* ---------- Theme builders ---------- */

function buildBlossom(ctx) {
  const templates = Array.from({ length: 4 }, cherryTree);
  const dry = (s) => Math.abs(s.z - streamZ(s.x)) > 3.2;
  const spots = scatter(Math.round(64 * ctx.density), { minR: 6.5, maxR: 44, frontMinR: 13 }).filter(dry);
  // Trees lining both banks of the stream.
  for (let x = -40; x <= 40; x += rand(4.5, 6.5)) {
    if (Math.abs(x + 6) < 3) continue; // leave the bridge clear
    for (const side of [-1, 1]) spots.push({ x: x + rand(-1, 1), z: streamZ(x) + side * rand(3.4, 4.4), r: 10 });
  }
  plant(ctx, templates, spots.map((s) => ({ ...s, scale: rand(0.9, 1.35) })));
  addRocksAndBushes(ctx, { rocks: 26, bushes: 22, bushPalette: ['#e48aa8', '#f2aac0', '#5d7f45', '#f7c1d2'], maxR: 26 });

  stream(ctx);
  archedBridge(ctx, -6);
  pavilion(ctx, 15, -24, 0.4);
  for (const [x, z] of [[-3.4, -2.6], [3.4, -2.6], [-2.6, 3.8], [2.6, 3.8]]) stoneLantern(ctx, x, z);
  steppingStones(ctx);
  // Stones along the banks.
  const bankRocks = rock();
  const banks = [];
  for (let x = -36; x <= 36; x += rand(1.2, 2.4)) {
    for (const side of [-1, 1]) if (Math.random() < 0.7) banks.push({ x, z: streamZ(x) + side * rand(1.7, 2.3), scale: rand(0.2, 0.5) });
  }
  instance(ctx, bankRocks, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), banks, { yOffset: -0.25 });

  // A carpet of fallen petals in the clearing.
  const count = Math.round(1100 * ctx.density);
  const petals = new THREE.InstancedMesh(
    petalGeometry(),
    new THREE.MeshStandardMaterial({ color: '#f7c1d0', roughness: 0.85, side: THREE.DoubleSide }),
    count,
  );
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  for (let i = 0; i < count; i++) {
    const a = rand(0, Math.PI * 2);
    const r = Math.sqrt(rand(1, 22 * 22));
    const x = Math.sin(a) * r;
    let z = Math.cos(a) * r;
    if (ctx.theme.carve(x, z) < -0.15) z = -z * 0.3; // keep them on dry land
    q.setFromEuler(e.set(-Math.PI / 2 + rand(-0.2, 0.2), rand(0, Math.PI * 2), 0, 'YXZ'));
    m.compose(new THREE.Vector3(x, ctx.heightAt(x, z) + 0.06, z), q, new THREE.Vector3().setScalar(rand(0.08, 0.13)));
    petals.setMatrixAt(i, m);
  }
  petals.receiveShadow = ctx.shadows;
  ctx.scene.add(petals);
}

function buildForest(ctx) {
  const templates = Array.from({ length: 5 }, conifer);
  const spots = scatter(Math.round(130 * ctx.density), { minR: 7, maxR: 62, frontMinR: 13 });
  plant(ctx, templates, spots.map((s) => ({ ...s, scale: rand(0.9, 1.4) + s.r / 70 })));
  addRocksAndBushes(ctx, { rocks: 34, bushes: 40, bushPalette: ['#2c4a26', '#3d5f31', '#4f7239', '#24391f'], maxR: 28 });

  // The Olympic Mountains, snow-capped, beyond the trees.
  const peaks = [];
  for (let i = 0; i < 9; i++) peaks.push({ x: -170 + i * 42 + rand(-10, 10), z: rand(-200, -160), r: rand(40, 60), h: rand(55, 85) });
  mountains(ctx, peaks, { rock: '#56626a', snow: '#f4f7fa', snowLine: 0.6, haze: 0.5 });

  // Forest floor: ferns, mossy fallen logs, mushrooms.
  const ferns = scatter(Math.round(110 * ctx.density), { minR: 3.5, maxR: 22, frontMinR: 5, frontHalfAngle: 0.35 });
  instance(ctx, fern(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide }), ferns.map((s) => ({ ...s, scale: rand(0.7, 1.3) })), { yOffset: 0 });
  mossyLog(ctx, -4.8, -3.2, 0.5);
  mossyLog(ctx, 5.4, -5.5, -0.8);
  mossyLog(ctx, -3.2, 4.6, 1.35);
  const shrooms = [];
  for (const [lx, lz] of [[-4.8, -3.2], [-3.2, 4.6], [5.4, -5.5]]) {
    for (let i = 0; i < 6; i++) shrooms.push({ x: lx + rand(-1.6, 1.6), z: lz + rand(0.5, 0.9) * (Math.random() < 0.5 ? -1 : 1), s: rand(0.7, 1.4) });
  }
  mushrooms(ctx, shrooms);

  // Saplings that grow up around the picture as you arrive.
  const sapling = conifer();
  const n = 14;
  const wood = new THREE.InstancedMesh(sapling.wood, MATERIALS.wood(), n);
  const leaves = new THREE.InstancedMesh(sapling.leaves, MATERIALS.leaves(), n);
  const sprouts = Array.from({ length: n }, (_, i) => {
    const a = Math.PI + (i / (n - 1) - 0.5) * Math.PI * 1.4 + rand(-0.08, 0.08);
    const r = rand(3.4, 5.4);
    return { x: Math.sin(a) * r, z: Math.cos(a) * r, size: rand(0.28, 0.5), delay: i * 0.12 + rand(0, 0.3), rot: rand(0, 6.28) };
  });
  wood.castShadow = leaves.castShadow = ctx.shadows;
  ctx.scene.add(wood, leaves);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  ctx.onFrame((t) => {
    sprouts.forEach((s, i) => {
      const g = ctx.reduced ? 1 : smootherstep((t - 0.8 - s.delay) / 1.8);
      q.setFromAxisAngle(UP, s.rot + (1 - g) * 1.5);
      m.compose(new THREE.Vector3(s.x, ctx.heightAt(s.x, s.z), s.z), q, new THREE.Vector3().setScalar(Math.max(g, 0.001) * s.size));
      wood.setMatrixAt(i, m);
      leaves.setMatrixAt(i, m);
    });
    wood.instanceMatrix.needsUpdate = leaves.instanceMatrix.needsUpdate = true;
  });

  // Morning light falling between the trees.
  const sun = new THREE.Vector3(...ctx.theme.sun.dir).normalize();
  for (let i = 0; i < 7; i++) {
    const ray = new THREE.Mesh(new THREE.PlaneGeometry(rand(1.2, 2.8), 34), beamMaterial('#fff1cf', rand(0.07, 0.13)));
    ray.position.set(rand(-14, 14), 0, rand(-18, -4));
    ray.position.addScaledVector(sun, 17);
    ray.quaternion.setFromUnitVectors(UP, sun);
    ctx.scene.add(ray);
  }
}

function buildCity(ctx) {
  const spots = scatter(Math.round(170 * ctx.density), { minR: 11, maxR: 75, frontMinR: 20, frontHalfAngle: 1.2 });
  const towers = spots.map((s) => ({
    ...s,
    w: rand(2.6, 5.2),
    d: rand(2.6, 5.2),
    h: rand(5, 14) + (Math.random() < 0.3 ? rand(10, 28) : 0) + s.r * 0.22,
    rot: Math.round(rand(0, 3)) * (Math.PI / 2) + rand(-0.05, 0.05),
  }));
  const windows = windowTexture({ lit: 0.4, warm: 0.55 });
  buildings(ctx, towers.filter((t) => Math.hypot(t.x + 20, t.z + 46) > 9 && Math.hypot(t.x - 24, t.z + 54) > 9 && Math.abs(t.z + 14) > 6), { color: '#151924', windows, emissive: 1.4 });
  landmarkTowers(ctx, windows);
  street(ctx);

  // Street lamps around the plaza, with light pooling on the wet ground.
  const lampMat = new THREE.MeshBasicMaterial({ color: '#ffe3b0' });
  const poleMat = new THREE.MeshStandardMaterial({ color: '#1b1f29', roughness: 0.4, metalness: 0.7 });
  const glowTex = glowSpriteTexture();
  const lampSpots = [];
  for (let i = 0; i < 8; i++) {
    const a = Math.PI + (i / 7 - 0.5) * Math.PI * 1.5;
    const x = Math.sin(a) * 8;
    const z = Math.cos(a) * 8;
    lampSpots.push([x, z]);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 4, 8).translate(0, 2, 0), poleMat);
    pole.position.set(x, 0, z);
    pole.castShadow = ctx.shadows;
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8), lampMat);
    bulb.position.set(x, 4.05, z);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#ffd59a', blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.8 }));
    halo.position.copy(bulb.position);
    halo.scale.setScalar(2.4);
    const pool = new THREE.Mesh(new THREE.CircleGeometry(2.6, 32).rotateX(-Math.PI / 2), glowMaterial('#ffcf8f', 0.25, 2));
    pool.position.set(x, 0.03, z);
    ctx.scene.add(pole, bulb, halo, pool);
  }
  for (const k of [1, 3, 6]) {
    const light = new THREE.PointLight('#ffd59a', 8, 12, 1.8);
    light.position.set(lampSpots[k][0], 4, lampSpots[k][1]);
    ctx.scene.add(light);
  }
}

function buildStage(ctx) {
  rioBeach(ctx);
  rioSkyline(ctx);

  // Equalizer arc behind the picture.
  const n = 64;
  const bars = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 1, 0.16).translate(0, 0.5, 0), new THREE.MeshBasicMaterial({ color: '#ffffff' }), n);
  const a0 = Math.PI * 0.6;
  const a1 = Math.PI * 1.4;
  const c = new THREE.Color();
  const spots = [];
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / (n - 1)) * (a1 - a0);
    spots.push({ x: Math.sin(a) * 5.4, z: Math.cos(a) * 5.4, a });
    bars.setColorAt(i, c.set('#d36bff').lerp(new THREE.Color('#5fd4ff'), i / (n - 1)).multiplyScalar(1.6));
  }
  ctx.scene.add(bars);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  ctx.onFrame((t) => {
    spots.forEach((s, i) => {
      const k = i / n;
      const level =
        0.25 +
        0.55 * Math.abs(Math.sin(t * 2.3 + k * 9)) * (0.6 + 0.4 * Math.sin(t * 0.7 + k * 3)) +
        0.35 * Math.max(0, Math.sin(t * 5.1 + k * 23)) ** 3;
      const h = ctx.reduced ? 0.6 + 0.4 * Math.sin(k * 12) : level * 2.6;
      q.setFromAxisAngle(UP, s.a);
      m.compose(new THREE.Vector3(s.x, 0, s.z), q, new THREE.Vector3(1, Math.max(h, 0.05), 1));
      bars.setMatrixAt(i, m);
    });
    bars.instanceMatrix.needsUpdate = true;
  });

  // Speaker stacks either side, a glowing ring on the floor, sweeping spotlights.
  const cabinet = new THREE.MeshStandardMaterial({ color: '#111015', roughness: 0.6, metalness: 0.3 });
  const coneMat = new THREE.MeshStandardMaterial({ color: '#1c1b22', roughness: 0.35, metalness: 0.5 });
  for (const side of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      const box = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.1, 0.9), cabinet);
      box.position.set(side * 4.6, 0.55 + k * 1.12, -2.2);
      box.rotation.y = -side * 0.35;
      const woofer = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.32, 0.08, 32).rotateX(Math.PI / 2), coneMat);
      woofer.position.set(0, -0.05, 0.47);
      box.add(woofer);
      box.castShadow = ctx.shadows;
      ctx.scene.add(box);
    }
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3.3, 0.025, 8, 128), new THREE.MeshBasicMaterial({ color: '#c99bff' }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.02;
  ctx.scene.add(ring);
  const colors = ['#d59bff', '#7fd8ff', '#ff8fd0', '#9fa8ff', '#7fffe0'];
  const cones = colors.map((color, i) => {
    const beam = new THREE.Mesh(new THREE.ConeGeometry(2.4, 16, 32, 1, true).translate(0, -8, 0), beamMaterial(color, 0.16, false));
    const pivot = new THREE.Group();
    pivot.position.set((i - 2) * 3.4, 15, -6 - Math.abs(i - 2) * 1.5);
    pivot.add(beam);
    ctx.scene.add(pivot);
    return { pivot, phase: i * 1.3 };
  });
  ctx.onFrame((t) => {
    for (const cone of cones) {
      const s = ctx.reduced ? 0 : t;
      cone.pivot.rotation.z = Math.sin(s * 0.5 + cone.phase) * 0.45;
      cone.pivot.rotation.x = 0.25 + Math.cos(s * 0.37 + cone.phase) * 0.2;
    }
  });
}

function buildTuscany(ctx) {
  // A cypress avenue running away behind the picture.
  const avenue = [];
  for (let z = -7; z > -80; z -= 3.6) {
    for (const side of [-1, 1]) avenue.push({ x: side * (3.4 + rand(-0.2, 0.2)) + Math.sin(z * 0.05) * 2, z, scale: rand(0.9, 1.15) });
  }
  const far = scatter(Math.round(40 * ctx.density), { minR: 25, maxR: 90, frontMinR: 40 }).map((s) => ({ ...s, scale: rand(0.9, 1.3) }));
  plant(ctx, Array.from({ length: 3 }, cypress), [...avenue, ...far]);

  const olives = scatter(Math.round(55 * ctx.density), { minR: 10, maxR: 60, frontMinR: 15 }).filter((s) => (Math.abs(s.x) > 6 || s.z > 0) && Math.hypot(s.x - 26, s.z + 34) > 10 && !(s.x < -10 && s.z < -15));
  plant(ctx, Array.from({ length: 3 }, oliveTree), olives.map((s) => ({ ...s, scale: rand(0.8, 1.2) })));
  addRocksAndBushes(ctx, { rocks: 20, bushes: 18, bushPalette: ['#6f7a3f', '#8a8f4c', '#a39a55', '#5f6a37'], minR: 6, maxR: 30 });
  villa(ctx, 26, -34);
  vineyard(ctx);
  hayBales(ctx);

  // A pale gravel path between the cypresses.
  const path = new THREE.Mesh(
    new THREE.PlaneGeometry(3.2, 90, 1, 60).rotateX(-Math.PI / 2).translate(0, 0.03, -45),
    new THREE.MeshStandardMaterial({ color: '#d9c39a', roughness: 1 }),
  );
  const p = path.geometry.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i);
    p.setX(i, p.getX(i) + Math.sin(z * 0.05) * 2);
    p.setY(i, ctx.heightAt(p.getX(i), z) + 0.08);
  }
  path.geometry.computeVertexNormals();
  path.receiveShadow = ctx.shadows;
  ctx.scene.add(path);
}

function buildLanterns(ctx) {
  // A narrow alley of low buildings leading back from the picture.
  const rows = [];
  for (const side of [-1, 1]) {
    for (let z = 16; z > -50; ) {
      const d = rand(3, 5.5);
      const w = rand(3, 4.5);
      rows.push({ x: side * (4.2 + w / 2), z: z - d / 2, w, d: d - 0.15, h: rand(4.5, 9) });
      z -= d;
    }
  }
  buildings(ctx, rows, { color: '#211a1e', windows: windowTexture({ lit: 0.3, warm: 0.95, cols: 4, rows: 4 }), emissive: 1.0, tile: 3 });

  // Strings of paper lanterns along both sides and across the alley.
  const lanternGeo = new THREE.SphereGeometry(0.32, 20, 14).scale(1, 1.25, 1);
  const capGeo = new THREE.CylinderGeometry(0.18, 0.22, 0.08, 16);
  const capMat = new THREE.MeshStandardMaterial({ color: '#2a1a14', roughness: 0.6 });
  const glowTex = glowSpriteTexture();
  const lanterns = [];
  const addLantern = (x, y, z) => {
    const color = new THREE.Color(pick(['#ff5a3c', '#ff7a45', '#ff4d6a', '#ffb35c', '#ff9a3c']));
    const lantern = new THREE.Mesh(lanternGeo, new THREE.MeshBasicMaterial({ color }));
    lantern.position.set(x, y, z);
    for (const dy of [-0.42, 0.42]) {
      const cap = new THREE.Mesh(capGeo, capMat);
      cap.position.y = dy;
      lantern.add(cap);
    }
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.75 }));
    halo.position.copy(lantern.position);
    halo.scale.setScalar(2.6);
    ctx.scene.add(lantern, halo);
    lanterns.push({ halo, phase: rand(0, 6.28) });
  };
  for (const side of [-1, 1]) {
    for (let z = 4; z > -29; z -= 2.8) addLantern(side * 3.75, 3.6 + rand(-0.15, 0.15), z + rand(-0.3, 0.3));
  }
  const strings = [];
  for (let z = -6; z > -29; z -= 7) {
    for (let k = 1; k < 6; k++) addLantern(-3.4 + (k / 6) * 6.8, 4.6 - Math.sin((k / 6) * Math.PI) * 0.7, z);
    strings.push(new THREE.Vector3(-3.75, 4.8, z), new THREE.Vector3(3.75, 4.8, z));
  }
  ctx.scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(strings), new THREE.LineBasicMaterial({ color: '#3a2a24' })));
  for (let i = 0; i < 4; i++) {
    const light = new THREE.PointLight('#ff8a5c', 7, 14, 1.6);
    light.position.set(i % 2 ? 3 : -3, 3.4, 2 - i * 7);
    ctx.scene.add(light);
  }
  ctx.onFrame((t) => {
    if (ctx.reduced) return;
    for (const l of lanterns) l.halo.material.opacity = 0.65 + 0.12 * Math.sin(t * 3 + l.phase) * Math.sin(t * 1.7 + l.phase * 2);
  });

  gateway(ctx);
  garlands(ctx);
  rickshaw(ctx, 2.4, -9, Math.PI * 0.92);
  signboards(ctx);
}

/* ---------- The picture ---------- */

async function placeholderCanvas(project, theme) {
  const portrait = !!project.portrait;
  const W = portrait ? 900 : 1600;
  const H = portrait ? 1600 : 1000;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  try {
    await Promise.all([document.fonts.load('400 160px "Instrument Serif"'), document.fonts.load('400 28px Inter')]);
  } catch (_) {
    /* fall back to system fonts */
  }
  const { from, to, ink } = theme.placeholder;
  const bg = g.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, from);
  bg.addColorStop(1, to);
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  const glow = g.createRadialGradient(W * 0.75, H * 0.2, 0, W * 0.75, H * 0.2, W * 0.7);
  glow.addColorStop(0, project.accent + '55');
  glow.addColorStop(1, project.accent + '00');
  g.fillStyle = glow;
  g.fillRect(0, 0, W, H);

  g.fillStyle = ink;
  g.globalAlpha = 0.7;
  g.font = '400 26px Inter, system-ui, sans-serif';
  if ('letterSpacing' in g) g.letterSpacing = '6px';
  g.fillText(project.motto.toUpperCase(), 64, 96);
  g.globalAlpha = 1;
  if ('letterSpacing' in g) g.letterSpacing = '0px';

  let size = portrait ? 170 : 210;
  g.font = `400 ${size}px "Instrument Serif", Georgia, serif`;
  while (g.measureText(project.name).width > W - 140 && size > 60) {
    size -= 6;
    g.font = `400 ${size}px "Instrument Serif", Georgia, serif`;
  }
  g.fillText(project.name, 64, H / 2 + size * 0.3);

  g.globalAlpha = 0.55;
  g.font = '300 26px Inter, system-ui, sans-serif';
  g.fillText('Screenshot coming soon', 64, H - 72);
  g.globalAlpha = 1;
  return c;
}

function roundedRect(w, h, r) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + r, -h / 2);
  s.lineTo(w / 2 - r, -h / 2);
  s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  s.lineTo(w / 2, h / 2 - r);
  s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  s.lineTo(-w / 2 + r, h / 2);
  s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  s.lineTo(-w / 2, -h / 2 + r);
  s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  return s;
}

async function makePicture(ctx, project) {
  let texture;
  if (project.image) {
    try {
      texture = await new THREE.TextureLoader().loadAsync(project.image);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 8;
    } catch (err) {
      console.warn(`Couldn't load ${project.image}; using a placeholder.`, err);
    }
  }
  texture ??= textureFromCanvas(await placeholderCanvas(project, ctx.theme));
  const aspect = texture.image.width / texture.image.height;
  const height = aspect >= 1 ? 2.25 : 3.1;
  const width = height * aspect;

  const group = new THREE.Group();
  const face = new THREE.ShapeGeometry(roundedRect(width, height, 0.1), 6);
  const uv = face.attributes.uv;
  const pos = face.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / width + 0.5, pos.getY(i) / height + 0.5);
  const picture = new THREE.Mesh(face, new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, fog: false }));
  picture.position.z = 0.02;

  // The backing sits clearly behind the picture so the two never compete
  // for the same depth (that was the blocky flicker).
  const depth = 0.14;
  const bevel = 0.025;
  const backing = new THREE.Mesh(
    new THREE.ExtrudeGeometry(roundedRect(width + 0.12, height + 0.12, 0.14), { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3 }),
    new THREE.MeshStandardMaterial({ color: '#0c0e13', roughness: 0.28, metalness: 0.6 }),
  );
  backing.position.z = -(depth + bevel) - 0.02;
  backing.castShadow = ctx.shadows;

  const halo = new THREE.Mesh(new THREE.PlaneGeometry(width * 2.3, height * 2.5), glowMaterial(project.accent, 0.4, 2.2));
  halo.position.z = backing.position.z - bevel - 0.05;
  group.add(halo, backing, picture);
  group.position.y = FRAME_Y + (aspect < 1 ? 0.4 : 0);
  ctx.scene.add(group);

  // Soft pool of light on the ground beneath it.
  const pool = new THREE.Mesh(new THREE.CircleGeometry(3.4, 48).rotateX(-Math.PI / 2), glowMaterial(project.accent, 0.3, 1.8));
  pool.position.y = ctx.heightAt(0, 0) + 0.12;
  ctx.scene.add(pool);

  const baseY = group.position.y;
  ctx.onFrame((t) => {
    if (ctx.reduced) return;
    group.position.y = baseY + Math.sin(t * 0.8) * 0.06;
    group.rotation.y = Math.sin(t * 0.3) * 0.05;
  });
  return { width, height, center: new THREE.Vector3(0, baseY, 0), textures: [texture] };
}

/* ---------- Opening a place ---------- */

let current = null;

export async function openPlace(project, { onLeave, reduced = false }) {
  current?.dispose();
  root.classList.remove('is-revealed', 'is-leaving');
  const theme = THEMES[project.theme] ?? THEMES.blossom;
  const w = innerWidth;
  const h = innerHeight;
  const small = Math.min(w, h) < 700;
  const ctx = {
    theme,
    reduced,
    scene: new THREE.Scene(),
    density: small ? 0.55 : 1,
    shadows: true,
    time: { value: 0 },
    frameHooks: [],
    onFrame(fn) {
      this.frameHooks.push(fn);
    },
    heightAt(x, z) {
      let y = 0;
      const hills = theme.ground.hills;
      if (hills) {
        const k = smoothstep(9, 30, Math.hypot(x, z));
        const n = Math.sin(x * 0.045 + 1.3) * Math.cos(z * 0.052) + 0.55 * Math.sin(x * 0.11 + z * 0.07 + 2) + 0.3 * Math.sin(z * 0.19 - x * 0.13);
        y = hills * k * (n + 0.9);
      }
      return theme.carve ? y + theme.carve(x, z) : y;
    },
  };

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, small ? 2 : 1.75));
  renderer.setSize(w, h, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = theme.exposure;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = ctx.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const { scene } = ctx;
  scene.fog = new THREE.FogExp2(theme.fog.color, theme.fog.density);
  scene.background = new THREE.Color(theme.fog.color);
  const sky = makeSky(ctx);
  const envTarget = makeEnvironment(ctx, renderer, sky);
  makeLights(ctx);
  makeGround(ctx);
  if (theme.grass) addGrass(ctx, theme.grass);
  theme.build(ctx);
  for (const spec of theme.particles) addParticles(ctx, spec);
  const picture = await makePicture(ctx, project);

  /* Camera: fall from high above, then settle in front of the picture. */
  const camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 1200);
  const target = new THREE.Vector3();
  const rest = { radius: 9, polar: 1.36, azimuth: 0 };
  function frameCamera() {
    const W = innerWidth;
    const H = innerHeight;
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    const portraitScreen = H > W;
    const vHalf = THREE.MathUtils.degToRad(camera.fov / 2);
    const hHalf = Math.atan(Math.tan(vHalf) * camera.aspect);
    const fitH = (picture.height * (portraitScreen ? 1.9 : 1.55)) / 2 / Math.tan(vHalf);
    const fitW = (picture.width * 1.3) / 2 / Math.tan(hHalf);
    rest.radius = Math.max(fitH, fitW, 7.5);
    // Leave room for the project card under the picture on phones.
    target.copy(picture.center).add(new THREE.Vector3(0, portraitScreen ? -picture.height * 0.42 : -0.1, 0));
  }
  frameCamera();

  const controls = new OrbitControls(camera, canvas);
  controls.enabled = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.enablePan = false;
  controls.rotateSpeed = 0.5;
  controls.minPolarAngle = 0.95;
  controls.maxPolarAngle = 1.5;
  const az = theme.azimuth ?? 0.9;
  controls.minAzimuthAngle = -az;
  controls.maxAzimuthAngle = az;
  controls.target.copy(target);

  const spherical = new THREE.Spherical();
  const start = { radius: 110, polar: 0.06, azimuth: 0.9 };
  function placeCamera(k) {
    const e = smootherstep(k);
    spherical.radius = Math.exp(Math.log(start.radius) + (Math.log(rest.radius) - Math.log(start.radius)) * e);
    spherical.phi = start.polar + (rest.polar - start.polar) * smoothstep(0.15, 1, k);
    spherical.theta = start.azimuth + (rest.azimuth - start.azimuth) * e;
    camera.position.setFromSpherical(spherical).add(target);
    camera.lookAt(target);
  }
  placeCamera(reduced ? 1 : 0);

  /* Card */
  card.querySelector('.place-meta').textContent = `${project.place} · ${project.status}`;
  card.querySelector('.place-name').textContent = project.name;
  card.querySelector('.place-blurb').textContent = project.blurb;
  const link = card.querySelector('.place-link');
  link.hidden = !project.link;
  if (project.link) {
    link.href = project.link.href;
    link.textContent = `${project.link.label} ↗`;
  }
  root.style.setProperty('--accent', project.accent);
  card.classList.remove('is-visible');

  await renderer.compileAsync(scene, camera);

  /* Loop */
  const DESCENT = reduced ? 0 : 3.4;
  const view = camera.clone();
  const right = new THREE.Vector3();
  const upward = new THREE.Vector3();
  let raf = 0;
  let revealedAt = null;
  let last = performance.now();
  let clock = 0;
  let pingPong = 1;
  let disposed = false;

  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    clock += dt;
    ctx.time.value = clock;
    const since = revealedAt === null ? 0 : (now - revealedAt) / 1000;
    for (const fn of ctx.frameHooks) fn(since, dt);

    if (!controls.enabled) {
      placeCamera(DESCENT ? since / DESCENT : 1);
      if (revealedAt !== null && since >= DESCENT) {
        controls.target.copy(target);
        controls.enabled = true;
        controls.autoRotate = !reduced;
        controls.autoRotateSpeed = 0.25;
      }
    } else {
      // Drift gently from side to side until the visitor takes over.
      const a = controls.getAzimuthalAngle();
      if (a > az * 0.6) pingPong = -1;
      if (a < -az * 0.6) pingPong = 1;
      controls.autoRotateSpeed = 0.25 * pingPong;
      controls.update();
    }
    if (revealedAt !== null && since > DESCENT * 0.65) card.classList.add('is-visible');
    const ease = 1 - Math.exp(-dt * 2.5);
    pointer.x += (pointer.tx - pointer.x) * ease;
    pointer.y += (pointer.ty - pointer.y) * ease;
    camera.updateMatrixWorld();
    view.copy(camera);
    view.position
      .addScaledVector(right.setFromMatrixColumn(camera.matrixWorld, 0), pointer.x * 0.55)
      .addScaledVector(upward.setFromMatrixColumn(camera.matrixWorld, 1), -pointer.y * 0.3);
    view.lookAt(controls.enabled ? controls.target : target);
    renderer.render(scene, view);
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  controls.addEventListener('start', () => (controls.autoRotate = false));

  // Moving the pointer shifts the viewpoint slightly while still looking at
  // the picture, so near and far things slide past each other.
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  const onPointer = (e) => {
    pointer.tx = (e.clientX / innerWidth) * 2 - 1;
    pointer.ty = (e.clientY / innerHeight) * 2 - 1;
  };
  window.addEventListener('pointermove', onPointer);

  function onResize() {
    renderer.setSize(innerWidth, innerHeight, false);
    frameCamera();
    controls.target.copy(target);
  }
  window.addEventListener('resize', onResize);

  function leave() {
    if (disposed || root.classList.contains('is-leaving')) return;
    root.classList.add('is-leaving');
    card.classList.remove('is-visible');
    onLeave?.();
    setTimeout(dispose, reduced ? 0 : 900);
  }
  const onKey = (e) => {
    if (e.key === 'Escape') leave();
  };
  backButton.addEventListener('click', leave);
  window.addEventListener('keydown', onKey);

  function dispose() {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('pointermove', onPointer);
    backButton.removeEventListener('click', leave);
    controls.dispose();
    scene.traverse((obj) => {
      obj.geometry?.dispose();
      const mats = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : [];
      for (const m of mats) {
        for (const value of Object.values(m)) if (value?.isTexture) value.dispose();
        m.dispose();
      }
    });
    picture.textures.forEach((t) => t.dispose());
    envTarget.dispose();
    renderer.dispose();
    root.hidden = true;
    root.classList.remove('is-revealed', 'is-leaving');
    document.body.classList.remove('place-open');
    if (current === api) current = null;
  }

  root.hidden = false;
  document.body.classList.add('place-open');

  const api = {
    // Fade the place in and start the descent.
    reveal() {
      revealedAt = performance.now();
      requestAnimationFrame(() => !disposed && root.classList.add('is-revealed'));
      backButton.focus({ preventScroll: true });
    },
    dispose,
  };
  current = api;
  return api;
}
