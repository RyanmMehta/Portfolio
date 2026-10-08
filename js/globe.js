// The lit globe on the right of the hero.
//
// Motion model: the globe always has a spin velocity. On load it gets an
// extra "boost" that rises and settles over a few seconds (the opening turn),
// then eases into a slow idle spin. Grabbing the globe at any moment simply
// takes over, so there is never a sequence the visitor has to wait out.

import * as THREE from 'three';
import { PROJECTS } from './projects.js';

// NASA Blue Marble / Black Marble imagery, as packaged with three-globe.
const TEXTURES = 'https://cdn.jsdelivr.net/npm/three-globe@2.34.0/example/img/';
const CLOUDS_URL = 'https://cdn.jsdelivr.net/npm/globe.gl@2.34.0/example/clouds/clouds.png';

// Longitude (degrees) facing the viewer once the opening turn settles.
// Around -25° the Americas sit in daylight and Europe/Africa's city lights
// glow just past the terminator.
const HOME_LONGITUDE = -25;

const BASE_PITCH = 0.32; // tip the north pole toward the viewer (radians)
const AXIAL_ROLL = 0.18; // lean the axis slightly toward the text
const PITCH_LIMITS = [-0.5, 0.95];
const SUN_DIRECTION = new THREE.Vector3(-1, 0.4, 0.36).normalize();
const WIDE_LAYOUT = 900; // px; keep in sync with the breakpoint in styles.css

const IDLE_SPIN = 0.1; // radians per second (a full turn in about a minute)
const INTRO_TURN = 1.1; // radians covered by the opening turn
const INTRO_TAU = 0.85; // seconds until the turn is at its fastest
const INTRO_PEAK = INTRO_TURN / (INTRO_TAU * Math.E);
const INTRO_DOLLY = 0.09; // camera starts this much further out
const MAX_THROW = 2.5; // radians per second
const CLOUD_DRIFT = 0.006; // radians per second, relative to the surface

const canvas = document.getElementById('globe');
const pinLayer = document.getElementById('pins');
const hint = document.querySelector('.hint');
const intro = document.querySelector('.intro');
const root = document.documentElement;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- Shaders ---------- */

const SURFACE_VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;

  void main() {
    vUv = uv;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vPosW = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const EARTH_FRAG = /* glsl */ `
  uniform sampler2D uDay;
  uniform sampler2D uNight;
  uniform sampler2D uWater;
  uniform vec3 uSun;

  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;

  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vPosW);
    vec3 L = normalize(uSun);
    float ndl = dot(N, L);
    float ndv = max(dot(N, V), 0.0);

    vec3 day = texture2D(uDay, vUv).rgb;
    vec3 night = texture2D(uNight, vUv).rgb;
    float water = texture2D(uWater, vUv).r;

    // Sunlight with a slightly wrapped falloff so the terminator is soft.
    float diffuse = clamp((ndl + 0.12) / 1.12, 0.0, 1.0);
    diffuse *= diffuse * (3.0 - 2.0 * diffuse);
    vec3 sun = vec3(1.0, 0.97, 0.92);
    vec3 color = day * sun * diffuse * 1.35;

    // Faint cool fill so the night side isn't pure black.
    color += day * vec3(0.012, 0.018, 0.03);

    // Soft sun glint on open water.
    vec3 H = normalize(L + V);
    float ndh = max(dot(N, H), 0.0);
    float glint = (pow(ndh, 320.0) * 0.12 + pow(ndh, 36.0) * 0.025) * water;
    color += glint * vec3(1.0, 0.94, 0.86) * smoothstep(0.0, 0.25, ndl);

    // City lights, only past the terminator. The night texture also holds a
    // moonlit blue Earth; keep a trace of it and pull the warm lights out by colour.
    float nightSide = 1.0 - smoothstep(-0.2, 0.06, ndl);
    float city = clamp((night.r - night.b * 0.75) * 7.0, 0.0, 1.0);
    color += (night * city * vec3(1.0, 0.82, 0.58) * 7.0 + night * 0.12) * nightSide;

    // Atmosphere seen edge-on, strongest on the sunlit limb.
    float rim = pow(1.0 - ndv, 3.2);
    vec3 sky = vec3(0.28, 0.52, 1.0);
    color += sky * rim * (0.04 + 0.6 * smoothstep(-0.3, 0.6, ndl));

    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const CLOUDS_FRAG = /* glsl */ `
  uniform sampler2D uClouds;
  uniform vec3 uSun;
  uniform float uOpacity;

  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;

  void main() {
    vec4 tex = texture2D(uClouds, vUv);
    float density = tex.a * max(tex.r, max(tex.g, tex.b));
    float ndl = dot(normalize(vNormalW), normalize(uSun));

    vec3 color = vec3(1.0, 0.98, 0.95) * (0.02 + max(ndl + 0.1, 0.0));
    float alpha = density * uOpacity * 0.8 * (0.25 + 0.75 * smoothstep(-0.25, 0.2, ndl));

    gl_FragColor = vec4(color, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    gl_FragColor.rgb *= gl_FragColor.a;
  }
`;

// Rendered on the back faces of a slightly larger sphere, so only the ring
// outside the planet's edge shows.
const ATMOSPHERE_SCALE = 1.12;
const ATMOSPHERE_FRAG = /* glsl */ `
  uniform vec3 uSun;
  uniform float uDepth;

  varying vec3 vNormalW;
  varying vec3 vPosW;

  void main() {
    vec3 V = normalize(cameraPosition - vPosW);
    // 0 at the outer edge of the glow, 1 where it meets the planet.
    float depth = clamp(-dot(normalize(vNormalW), V) / uDepth, 0.0, 1.0);
    float glow = pow(depth, 2.6);

    float sunSide = dot(normalize(vPosW), normalize(uSun));
    float lit = smoothstep(-0.35, 0.55, sunSide);
    float dusk = exp(-pow(sunSide * 4.0, 2.0)) * 0.3;
    vec3 color = mix(vec3(0.3, 0.56, 1.0), vec3(1.0, 0.55, 0.32), dusk);

    gl_FragColor = vec4(color, glow * (0.06 + 0.94 * lit) * 0.72);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    gl_FragColor.rgb *= gl_FragColor.a;
  }
`;

/* ---------- Scene ---------- */

let renderer = null;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
} catch (err) {
  console.warn('WebGL is unavailable, so the globe is skipped.', err);
}

if (renderer) {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);

  // travel (turns a project to face you) > pitch (screen-space tilt) >
  // roll (axial lean) > spin (around the poles)
  const travelGroup = new THREE.Group();
  const pitchGroup = new THREE.Group();
  const rollGroup = new THREE.Group();
  const spin = new THREE.Group();
  rollGroup.rotation.z = AXIAL_ROLL;
  travelGroup.add(pitchGroup);
  pitchGroup.add(rollGroup);
  rollGroup.add(spin);
  scene.add(travelGroup);

  const sphere = new THREE.SphereGeometry(1, 160, 80);
  const sun = { value: SUN_DIRECTION };

  const earthMaterial = new THREE.ShaderMaterial({
    uniforms: { uDay: { value: null }, uNight: { value: null }, uWater: { value: null }, uSun: sun },
    vertexShader: SURFACE_VERT,
    fragmentShader: EARTH_FRAG,
  });
  spin.add(new THREE.Mesh(sphere, earthMaterial));

  const cloudMaterial = new THREE.ShaderMaterial({
    uniforms: { uClouds: { value: null }, uSun: sun, uOpacity: { value: 0 } },
    vertexShader: SURFACE_VERT,
    fragmentShader: CLOUDS_FRAG,
    transparent: true,
    premultipliedAlpha: true,
    depthWrite: false,
  });
  const clouds = new THREE.Mesh(sphere, cloudMaterial);
  clouds.scale.setScalar(1.008);
  clouds.visible = false;
  spin.add(clouds);

  const atmosphere = new THREE.Mesh(
    sphere,
    new THREE.ShaderMaterial({
      uniforms: { uSun: sun, uDepth: { value: Math.sqrt(1 - 1 / ATMOSPHERE_SCALE ** 2) } },
      vertexShader: SURFACE_VERT,
      fragmentShader: ATMOSPHERE_FRAG,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      // Additive, with premultiplied output so it composites cleanly over the page.
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneFactor,
    }),
  );
  atmosphere.scale.setScalar(ATMOSPHERE_SCALE);
  scene.add(atmosphere);

  /* ---------- Layout ---------- */

  // Globe centre and radius in CSS pixels, plus the camera distance that
  // makes a unit sphere appear at that radius.
  const view = { w: 0, h: 0, cx: 0, cy: 0, r: 0, distance: 4 };

  function layout() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    let r, cx, cy;
    // Side by side on desktops and on phones held sideways; stacked in portrait.
    if (w >= WIDE_LAYOUT || w > h) {
      // Keep the globe and most of its glow clear of the text. When space is
      // tight it may run up to 15% of its radius off the right edge.
      const textRight = intro.getBoundingClientRect().right + 32;
      r = Math.min(h * 0.44, (w - textRight) / 1.95);
      const left = textRight + r * 1.1;
      const right = w - r * 0.85;
      cx = (left + right) / 2;
      cy = h / 2;
    } else {
      // Fill the space above the text, running a little off the right edge.
      const space = Math.max(intro.getBoundingClientRect().top - 16, h * 0.4);
      r = Math.min(w * 0.58, space * 0.44);
      cx = w * 0.6;
      cy = space / 2 + 4;
    }
    Object.assign(view, { w, h, cx, cy, r });

    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Shift the projection so the globe sits at (cx, cy) without perspective skew.
    camera.setViewOffset(w, h, w / 2 - cx, h / 2 - cy, w, h);
    const t = (r / (h / 2)) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    view.distance = Math.sqrt(1 + t * t) / t;

    root.style.setProperty('--globe-x', `${cx}px`);
    root.style.setProperty('--hint-top', `${Math.min(cy + r * 1.16 + 12, h - 40)}px`);
  }

  layout();
  window.addEventListener('resize', layout);
  // The name's width changes once the web font arrives.
  document.fonts?.ready.then(layout);

  // Lets the contact transition shatter exactly what's on screen. Drawing
  // right after a render reads the frame before WebGL discards it.
  window.paintGlobe = (ctx, w, h) => {
    renderer.render(scene, camera);
    ctx.drawImage(canvas, 0, 0, w, h);
  };

  /* ---------- Motion ---------- */

  // Spin angle that brings a longitude to the front of a SphereGeometry.
  const yawFor = (longitude) => Math.PI / 2 - ((longitude + 180) / 360) * Math.PI * 2;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  const motion = {
    yaw: yawFor(HOME_LONGITUDE) - (reduceMotion ? 0 : INTRO_TURN),
    pitch: BASE_PITCH,
    yawVel: reduceMotion ? 0 : IDLE_SPIN,
    pitchVel: 0,
    intro: !reduceMotion,
  };
  const drag = { active: false, id: null, x: 0, y: 0, time: 0, vx: 0, vy: 0 };

  let ready = false;
  let startTime = 0;
  let cloudStart = 0;
  let last = 0;

  function step(now) {
    const dt = Math.min((now - last) / 1000, 1 / 20);
    last = now;
    const t = (now - startTime) / 1000;

    let boost = 0;
    if (motion.intro) {
      boost = INTRO_PEAK * (t / INTRO_TAU) * Math.exp(1 - t / INTRO_TAU);
      if (t > INTRO_TAU * 10) motion.intro = false;
    }

    if (!drag.active && !travel.active) {
      const idle = reduceMotion ? 0 : IDLE_SPIN;
      // Any throw from a drag eases back into the idle spin.
      motion.yawVel += (idle - motion.yawVel) * (1 - Math.exp(-dt / 0.8));
      motion.pitchVel *= Math.exp(-dt / 0.4);
      motion.yaw += (motion.yawVel + boost) * dt;
      motion.pitch += motion.pitchVel * dt;
      // Drift back to the resting tilt after being let go.
      motion.pitch += (BASE_PITCH - motion.pitch) * (1 - Math.exp(-dt / 3));
      motion.pitch = clamp(motion.pitch, ...PITCH_LIMITS);
    }

    spin.rotation.y = motion.yaw;
    pitchGroup.rotation.x = motion.pitch;
    clouds.rotation.y += CLOUD_DRIFT * dt;

    if (clouds.visible) {
      cloudMaterial.uniforms.uOpacity.value = Math.min((now - cloudStart) / 2500, 1);
    }

    if (travel.active) {
      updateTravel(now);
    } else if (space.phase !== 'idle') {
      updateSpace(now);
    } else {
      const settle = reduceMotion ? 1 : Math.min(t / 3.6, 1);
      const dolly = INTRO_DOLLY * (1 - settle) ** 3;
      camera.position.set(0, 0, view.distance * (1 + dolly));
    }
    updatePins(t, dt);
  }

  function frame(now) {
    step(now);
    // While a project's world is open, the globe sits underneath it unseen.
    if (travel.phase !== 'inside' && space.phase !== 'away') renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  /* ---------- Interaction ---------- */

  const overGlobe = (x, y) => Math.hypot(x - view.cx, y - view.cy) <= view.r * 1.04;

  let hintDismissed = false;
  function dismissHint() {
    hintDismissed = true;
    hint?.classList.remove('is-visible');
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (!ready || travel.active || space.phase !== 'idle' || !overGlobe(e.clientX, e.clientY)) return;
    Object.assign(drag, { active: true, id: e.pointerId, x: e.clientX, y: e.clientY, time: e.timeStamp, vx: 0, vy: 0 });
    Object.assign(drag, { startX: e.clientX, startY: e.clientY, startTime: e.timeStamp });
    // Grabbing stops the opening turn on the spot.
    motion.intro = false;
    motion.yawVel = 0;
    motion.pitchVel = 0;
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('is-dragging');
    dismissHint();
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!drag.active || e.pointerId !== drag.id) {
      const over = ready && !travel.active && overGlobe(e.clientX, e.clientY);
      canvas.classList.toggle('is-over-globe', over);
      canvas.classList.toggle('is-over-pin', over && !!pinAt(e.clientX, e.clientY));
      return;
    }
    // One globe radius of travel turns it about a radian, so the surface
    // roughly follows the pointer near the centre.
    const k = 1 / view.r;
    const dx = (e.clientX - drag.x) * k;
    const dy = (e.clientY - drag.y) * k;
    const dt = Math.max(e.timeStamp - drag.time, 1) / 1000;

    motion.yaw += dx;
    motion.pitch = clamp(motion.pitch + dy, ...PITCH_LIMITS);
    drag.vx += (dx / dt - drag.vx) * 0.4;
    drag.vy += (dy / dt - drag.vy) * 0.4;
    Object.assign(drag, { x: e.clientX, y: e.clientY, time: e.timeStamp });
  });

  function endDrag(e) {
    if (!drag.active || e.pointerId !== drag.id) return;
    drag.active = false;
    canvas.classList.remove('is-dragging');
    // No throw if the pointer had come to rest before release.
    const resting = e.timeStamp - drag.time > 80;
    motion.yawVel = resting ? 0 : clamp(drag.vx, -MAX_THROW, MAX_THROW);
    motion.pitchVel = resting ? 0 : clamp(drag.vy, -MAX_THROW, MAX_THROW);
    // A short tap with no real movement visits the pin under it.
    const moved = Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY);
    if (e.type === 'pointerup' && moved < 8 && e.timeStamp - drag.startTime < 500) {
      const pin = pinAt(e.clientX, e.clientY);
      if (pin) enter(pin);
    }
  }

  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('pointerleave', () => canvas.classList.remove('is-over-globe'));

  /* ---------- Project pins ---------- */

  const UP = new THREE.Vector3(0, 1, 0);
  const TOWARD_CAMERA = new THREE.Vector3(0, 0, 1);
  const FOCUS_FACING = 0.94; // how close to the centre a pin must be to pop up
  const smooth = (a, b, v) => {
    const x = clamp((v - a) / (b - a), 0, 1);
    return x * x * (3 - 2 * x);
  };
  const smoother = (v) => {
    const x = clamp(v, 0, 1);
    return x * x * x * (x * (x * 6 - 15) + 10);
  };

  // Same mapping as SphereGeometry's UVs, so pins land on the right spot.
  function surfacePoint(lat, lon) {
    const phi = THREE.MathUtils.degToRad(lon + 180);
    const theta = THREE.MathUtils.degToRad(90 - lat);
    return new THREE.Vector3(-Math.cos(phi) * Math.sin(theta), Math.cos(theta), Math.sin(phi) * Math.sin(theta));
  }

  const pinGlow = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.2, 'rgba(255,255,255,0.6)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const ringGeo = new THREE.RingGeometry(0.7, 1, 48).rotateX(-Math.PI / 2);
  const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true).translate(0, 0.5, 0);
  const sprite = (color) =>
    new THREE.Sprite(
      new THREE.SpriteMaterial({ map: pinGlow, color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }),
    );

  const pins = PROJECTS.map((project, i) => {
    const color = new THREE.Color(project.accent);
    const group = new THREE.Group();
    const normal = surfacePoint(project.lat, project.lon);
    group.position.copy(normal);
    group.quaternion.setFromUnitVectors(UP, normal);
    const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false }));
    const aura = sprite(color);
    const halo = sprite(color);
    const core = sprite(0xffffff);
    const ring = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
    );
    ring.position.y = 0.002;
    group.add(beam, ring, aura, halo, core);
    spin.add(group);

    const label = document.createElement('button');
    label.type = 'button';
    label.className = 'pin-label';
    label.style.setProperty('--accent', project.accent);
    label.setAttribute('aria-label', `${project.name}, ${project.place}. Visit this project.`);
    for (const [cls, text] of [['pin-name', project.name], ['pin-place', project.place], ['pin-cta', 'Explore ↗']]) {
      const span = document.createElement('span');
      span.className = cls;
      span.textContent = text;
      label.append(span);
    }
    pinLayer?.append(label);

    const pin = { project, group, beam, aura, halo, core, ring, label, focus: 0, facing: 0, vis: 0, seed: i * 0.37, x: 0, y: 0 };
    label.addEventListener('click', () => enter(pin));
    return pin;
  });

  const tmp = new THREE.Vector3();

  function updatePins(t, dt) {
    let best = null;
    let bestFacing = FOCUS_FACING;
    for (const pin of pins) {
      pin.facing = pin.group.getWorldPosition(tmp).normalize().dot(TOWARD_CAMERA);
      if (pin.facing > bestFacing) {
        best = pin;
        bestFacing = pin.facing;
      }
    }
    if (travel.active) best = travel.pin;

    for (const pin of pins) {
      pin.focus += ((pin === best ? 1 : 0) - pin.focus) * (1 - Math.exp(-dt / 0.22));
      const f = pin.focus;
      let vis = smooth(0.08, 0.3, pin.facing);
      // On the way in, everything but the destination fades, and the
      // destination itself before the camera gets too close.
      if (travel.active) vis *= pin === travel.pin ? 1 - smooth(0.25, 0.55, travel.depth) : 1 - smooth(0, 0.25, travel.depth);
      pin.vis = vis;

      // A beacon: a beam of light rising from the spot, a bright head, a wide
      // soft aura, and rings pulsing out across the ground.
      const lift = 0.05 + 0.13 * f;
      const width = 0.0035 + 0.003 * f;
      pin.beam.scale.set(width, lift, width);
      pin.beam.material.opacity = vis * (0.55 + 0.4 * f);
      const pulse = reduceMotion ? 1 : 1 + 0.14 * Math.sin(t * 3 + pin.seed * 9);
      pin.aura.position.y = pin.halo.position.y = pin.core.position.y = lift;
      pin.aura.scale.setScalar((0.26 + 0.2 * f) * pulse);
      pin.aura.material.opacity = vis * (0.32 + 0.2 * f);
      pin.halo.scale.setScalar((0.1 + 0.1 * f) * pulse);
      pin.halo.material.opacity = vis;
      pin.core.scale.setScalar(0.03 + 0.025 * f);
      pin.core.material.opacity = vis;
      const phase = reduceMotion ? 0.5 : (t * 0.6 + pin.seed) % 1;
      pin.ring.scale.setScalar(0.02 + (0.1 + 0.08 * f) * phase);
      pin.ring.material.opacity = vis * (1 - phase) * (0.75 + 0.25 * f);

      // Where the glowing head sits on screen, for labels and taps.
      pin.halo.getWorldPosition(tmp).project(camera);
      pin.x = ((tmp.x + 1) / 2) * view.w;
      pin.y = ((1 - tmp.y) / 2) * view.h;
      pin.label.style.transform = `translate(${pin.x.toFixed(1)}px, ${pin.y.toFixed(1)}px) translate(-50%, calc(-100% - 22px))`;
      pin.label.classList.toggle('is-focused', f > 0.5 && !travel.active);
      pin.label.classList.toggle('is-visible', vis > 0.45 && !travel.active);
      pin.label.tabIndex = vis > 0.4 && !travel.active ? 0 : -1;
    }
  }

  function pinAt(x, y) {
    let hit = null;
    let best = Infinity;
    for (const pin of pins) {
      if (pin.vis < 0.5) continue;
      const d = Math.hypot(pin.x - x, pin.y - y);
      if (d < (pin.focus > 0.5 ? 48 : 36) && d < best) {
        hit = pin;
        best = d;
      }
    }
    return hit;
  }

  /* ---------- Travelling into a project ---------- */

  const ENTER_TIME = 2.6; // seconds from tap to arriving
  const EXIT_TIME = 1.9;
  const travel = {
    active: false,
    phase: 'idle', // preparing → entering → inside → exiting
    pin: null,
    place: null,
    start: 0,
    depth: 0, // 0 = normal view, 1 = at the surface
    revealed: false,
    from: new THREE.Quaternion(),
    to: new THREE.Quaternion(),
  };
  let placesModule = null;
  const loadPlaces = () => (placesModule ??= import('./places.js'));

  function setCentre(k) {
    const cx = view.cx + (view.w / 2 - view.cx) * k;
    const cy = view.cy + (view.h / 2 - view.cy) * k;
    camera.setViewOffset(view.w, view.h, view.w / 2 - cx, view.h / 2 - cy, view.w, view.h);
  }

  // Camera distance from the globe's centre as we dive: equal steps in
  // log space feel like a steady fall toward the surface.
  function diveDistance(k) {
    const far = Math.log(view.distance - 1);
    const near = Math.log(0.004);
    return 1 + Math.exp(far + (near - far) * k);
  }

  async function enter(pin) {
    if (travel.active || !ready || space.phase !== 'idle') return;
    Object.assign(travel, { active: true, phase: 'preparing', pin, depth: 0, revealed: false });
    dismissHint();
    drag.active = false;
    canvas.classList.remove('is-dragging', 'is-over-pin');
    motion.intro = false;
    motion.yawVel = 0;
    motion.pitchVel = 0;
    document.body.classList.add('is-traveling');
    try {
      const { openPlace } = await loadPlaces();
      travel.place = await openPlace(pin.project, { reduced: reduceMotion, onLeave: leave });
    } catch (err) {
      console.warn('Could not open that project.', err);
      Object.assign(travel, { active: false, phase: 'idle', pin: null });
      document.body.classList.remove('is-traveling');
      return;
    }
    // The turn that brings this pin to face the camera.
    travel.from.copy(travelGroup.quaternion);
    travel.to.setFromUnitVectors(pin.group.getWorldPosition(tmp).normalize(), TOWARD_CAMERA).multiply(travel.from);
    camera.near = 0.0005;
    travel.phase = 'entering';
    travel.start = performance.now();
  }

  function leave() {
    travel.phase = 'exiting';
    travel.start = performance.now();
    travel.place = null;
    document.body.classList.remove('is-traveling');
  }

  function updateTravel(now) {
    const elapsed = (now - travel.start) / 1000;
    if (travel.phase === 'entering') {
      const p = reduceMotion ? 1 : Math.min(elapsed / ENTER_TIME, 1);
      travelGroup.quaternion.slerpQuaternions(travel.from, travel.to, smoother(p / 0.45));
      travel.depth = smoother((p - 0.15) / 0.85);
      if (!travel.revealed && p > 0.8) {
        travel.revealed = true;
        travel.place?.reveal();
      }
      if (p >= 1) travel.phase = 'inside';
    } else if (travel.phase === 'exiting') {
      const p = reduceMotion ? 1 : Math.min(elapsed / EXIT_TIME, 1);
      travel.depth = 1 - smoother(p);
      if (p >= 1) {
        Object.assign(travel, { active: false, phase: 'idle', pin: null, depth: 0 });
        camera.near = 0.1;
        motion.yawVel = 0;
      }
    } else if (travel.phase === 'preparing') {
      travel.depth = 0;
    }
    const centre = travel.phase === 'exiting' ? smoother(travel.depth * 1.6) : smoother(travel.depth * 2.2);
    setCentre(travel.active ? centre : 0);
    camera.position.set(0, 0, travel.active ? diveDistance(travel.depth) : view.distance);
    camera.updateProjectionMatrix();
  }

  /* ---------- Off to the Work universe ---------- */

  // The camera pulls straight back until Earth is a speck, while the
  // universe fades in around it (starting from that same speck).
  const SPACE_OUT = 1.7;
  const SPACE_IN = 1.5;
  const space = { phase: 'idle', start: 0, universe: null, revealed: false, then: null };
  let universeModule = null;
  const loadUniverse = () => (universeModule ??= import('./universe.js'));

  async function goToSpace() {
    if (!ready || travel.active || space.phase !== 'idle') return;
    space.phase = 'preparing';
    dismissHint();
    drag.active = false;
    motion.intro = false;
    canvas.classList.remove('is-dragging', 'is-over-pin');
    document.body.classList.add('is-traveling');
    try {
      const { openUniverse } = await loadUniverse();
      space.universe = await openUniverse({
        reduced: reduceMotion,
        onLeave: () => returnFromSpace(),
        onVisitProject: (id) => returnFromSpace(id),
      });
    } catch (err) {
      console.warn('Could not open the universe.', err);
      space.phase = 'idle';
      document.body.classList.remove('is-traveling');
      return;
    }
    Object.assign(space, { phase: 'leaving', start: performance.now(), revealed: false });
  }

  function returnFromSpace(projectId = null) {
    Object.assign(space, { phase: 'returning', start: performance.now(), universe: null, then: projectId });
    if (!projectId) document.body.classList.remove('is-traveling');
  }

  function updateSpace(now) {
    const elapsed = (now - space.start) / 1000;
    let k = 0;
    if (space.phase === 'leaving') {
      const p = reduceMotion ? 1 : Math.min(elapsed / SPACE_OUT, 1);
      k = smoother(p);
      if (!space.revealed && p > 0.35) {
        space.revealed = true;
        space.universe?.reveal();
      }
      if (p >= 1) space.phase = 'away';
    } else if (space.phase === 'away') {
      k = 1;
    } else if (space.phase === 'returning') {
      const p = reduceMotion ? 1 : Math.min(elapsed / SPACE_IN, 1);
      k = 1 - smoother(p);
      if (p >= 1) {
        space.phase = 'idle';
        const id = space.then;
        space.then = null;
        setCentre(0);
        camera.position.set(0, 0, view.distance);
        // Chose a project from the Projects planet: dive straight into it.
        const pin = id && pins.find((p) => p.project.id === id);
        if (pin) {
          document.body.classList.remove('is-traveling');
          enter(pin);
        }
        return;
      }
    }
    setCentre(smoother(Math.min(k * 1.5, 1)));
    camera.position.set(0, 0, view.distance * (1 + 11 * k * k));
  }

  document.querySelector('.links a[href="#work"]')?.addEventListener('click', (e) => {
    e.preventDefault();
    goToSpace();
  });

  /* ---------- Loading ---------- */

  const loader = new THREE.TextureLoader();
  const load = (url, srgb) =>
    loader.loadAsync(url).then((texture) => {
      if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
      renderer.initTexture(texture);
      return texture;
    });

  function loadClouds() {
    // The cloud layer is ~5 MB, so it's a large-screen extra only.
    if (view.w < WIDE_LAYOUT || navigator.connection?.saveData) return;
    load(CLOUDS_URL, false)
      .then((texture) => {
        cloudMaterial.uniforms.uClouds.value = texture;
        clouds.visible = true;
        cloudStart = performance.now();
      })
      .catch(() => {});
  }

  Promise.all([
    load(`${TEXTURES}earth-blue-marble.jpg`, true),
    load(`${TEXTURES}earth-night.jpg`, true),
    load(`${TEXTURES}earth-water.png`, false),
  ])
    .then(([day, night, water]) => {
      earthMaterial.uniforms.uDay.value = day;
      earthMaterial.uniforms.uNight.value = night;
      earthMaterial.uniforms.uWater.value = water;
      renderer.compile(scene, camera);

      ready = true;
      startTime = last = performance.now();
      canvas.classList.add('is-ready');
      requestAnimationFrame(frame);

      setTimeout(() => {
        if (!hintDismissed) hint?.classList.add('is-visible');
      }, 2800);
      setTimeout(() => loadPlaces().catch(() => {}), 4000);
      loadClouds();
    })
    .catch((err) => console.warn('Globe textures failed to load.', err));
}
