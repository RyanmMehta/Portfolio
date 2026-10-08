// The lit globe on the right of the hero.
//
// Motion model: the globe always has a spin velocity. On load it gets an
// extra "boost" that rises and settles over a few seconds (the opening turn),
// then eases into a slow idle spin. Grabbing the globe at any moment simply
// takes over, so there is never a sequence the visitor has to wait out.

import * as THREE from 'three';

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

const IDLE_SPIN = 0.022; // radians per second
const INTRO_TURN = 1.1; // radians covered by the opening turn
const INTRO_TAU = 0.85; // seconds until the turn is at its fastest
const INTRO_PEAK = INTRO_TURN / (INTRO_TAU * Math.E);
const INTRO_DOLLY = 0.09; // camera starts this much further out
const MAX_THROW = 2.5; // radians per second
const CLOUD_DRIFT = 0.006; // radians per second, relative to the surface

const canvas = document.getElementById('globe');
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

  // pitch (screen-space tilt) > roll (axial lean) > spin (around the poles)
  const pitchGroup = new THREE.Group();
  const rollGroup = new THREE.Group();
  const spin = new THREE.Group();
  rollGroup.rotation.z = AXIAL_ROLL;
  pitchGroup.add(rollGroup);
  rollGroup.add(spin);
  scene.add(pitchGroup);

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
    if (w >= WIDE_LAYOUT) {
      // Keep the globe and most of its glow clear of the text. When space is
      // tight it may run up to 15% of its radius off the right edge.
      const textRight = intro.getBoundingClientRect().right + 32;
      r = Math.min(h * 0.44, (w - textRight) / 1.95);
      const left = textRight + r * 1.1;
      const right = w - r * 0.85;
      cx = (left + right) / 2;
      cy = h / 2;
    } else {
      r = Math.min(w * 0.45, h * 0.25);
      cx = w / 2;
      cy = h * 0.3;
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

    if (!drag.active) {
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

    const settle = reduceMotion ? 1 : Math.min(t / 3.6, 1);
    const dolly = INTRO_DOLLY * (1 - settle) ** 3;
    camera.position.set(0, 0, view.distance * (1 + dolly));
  }

  function frame(now) {
    step(now);
    renderer.render(scene, camera);
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
    if (!ready || !overGlobe(e.clientX, e.clientY)) return;
    Object.assign(drag, { active: true, id: e.pointerId, x: e.clientX, y: e.clientY, time: e.timeStamp, vx: 0, vy: 0 });
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
      canvas.classList.toggle('is-over-globe', ready && overGlobe(e.clientX, e.clientY));
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
  }

  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('pointerleave', () => canvas.classList.remove('is-over-globe'));

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
      loadClouds();
    })
    .catch((err) => console.warn('Globe textures failed to load.', err));
}
