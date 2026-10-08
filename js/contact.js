// Contact: an asteroid strikes the screen, the page shatters like glass, and
// the pieces rebuild into the contact icons. The icons are ordinary links
// underneath, so everything still works without WebGL or with reduced motion.
(() => {
  const dialog = document.getElementById('contact');
  const canvas = document.getElementById('impact');
  const closeButton = document.getElementById('close-contact');
  const iconRow = dialog.querySelector('.contact-icons');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

  let run = 0;
  let stop = () => {};
  let previousFocus = null;

  function settle() {
    stop();
    stop = () => {};
    dialog.classList.add('is-struck', 'is-built');
    document.body.classList.add('contact-struck');
    iconRow.inert = false;
  }

  function open() {
    if (dialog.open) return;
    previousFocus = document.activeElement;
    dialog.classList.remove('is-struck', 'is-built');
    iconRow.inert = true;
    dialog.showModal();
    document.body.classList.add('contact-open');
    if (location.hash !== '#contact') history.replaceState(null, '', '#contact');
    play();
  }

  function close() {
    run++;
    stop();
    stop = () => {};
    if (dialog.open) dialog.close();
    dialog.classList.remove('is-struck', 'is-built');
    document.body.classList.remove('contact-open', 'contact-struck');
    if (location.hash === '#contact') history.replaceState(null, '', location.pathname + location.search);
    previousFocus?.focus({ preventScroll: true });
  }

  async function play() {
    const id = ++run;
    if (reduced.matches) return settle();
    // Never leave the links hidden behind a stalled CDN.
    const fallback = setTimeout(() => id === run && settle(), 4000);
    stop = () => clearTimeout(fallback);
    try {
      const THREE = await import('three');
      if (id !== run) return;
      clearTimeout(fallback);
      stop = await strike(THREE, () => id === run);
    } catch (err) {
      console.warn('Contact animation unavailable.', err);
      if (id === run) settle();
    }
  }

  document.querySelector('a[href="#contact"]').addEventListener('click', (e) => {
    e.preventDefault();
    open();
  });
  closeButton.addEventListener('click', close);
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    close();
  });
  // Clicking anywhere mid-animation jumps to the end.
  dialog.addEventListener('click', (e) => {
    if (!dialog.classList.contains('is-built') && !closeButton.contains(e.target)) settle();
  });
  window.addEventListener('hashchange', () => {
    if (location.hash === '#contact') open();
    else if (dialog.open) close();
  });
  window.addEventListener('resize', () => {
    if (dialog.open && !dialog.classList.contains('is-built')) settle();
  });

  /* ---------- Timeline (seconds) ---------- */

  const T_HIT = 0.95; // asteroid reaches the glass
  const CRACK_SPEED = 3200; // px/s, how fast fractures run out from the impact
  const T_REBUILD = T_HIT + 0.7; // first pieces start flying home

  /* ---------- Small helpers ---------- */

  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  const smoothstep = (a, b, v) => {
    const x = clamp01((v - a) / (b - a));
    return x * x * (3 - 2 * x);
  };
  const smootherstep = (v) => {
    const x = clamp01(v);
    return x * x * x * (x * (x * 6 - 15) + 10);
  };
  const rand = (a = 0, b = 1) => a + Math.random() * (b - a);

  // Clip a convex polygon to the half-plane closer to `site` than `other`.
  function clipToBisector(poly, site, other) {
    const mx = (site[0] + other[0]) / 2;
    const my = (site[1] + other[1]) / 2;
    const nx = other[0] - site[0];
    const ny = other[1] - site[1];
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const da = (a[0] - mx) * nx + (a[1] - my) * ny;
      const db = (b[0] - mx) * nx + (b[1] - my) * ny;
      if (da <= 0) out.push(a);
      if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
        const t = da / (da - db);
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
    }
    return out;
  }

  // Voronoi cells of `sites` inside the convex polygon `bounds`.
  function voronoi(sites, bounds) {
    return sites.map((site, i) => {
      let poly = bounds;
      for (let j = 0; j < sites.length && poly.length >= 3; j++) {
        if (j !== i) poly = clipToBisector(poly, site, sites[j]);
      }
      return poly;
    });
  }

  function polygonCentroid(poly) {
    let area = 0;
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < poly.length; i++) {
      const [x0, y0] = poly[i];
      const [x1, y1] = poly[(i + 1) % poly.length];
      const cross = x0 * y1 - x1 * y0;
      area += cross;
      cx += (x0 + x1) * cross;
      cy += (y0 + y1) * cross;
    }
    area /= 2;
    return { x: cx / (6 * area), y: cy / (6 * area), area: Math.abs(area) };
  }

  /* ---------- Page snapshot ---------- */

  // Repaint the homepage into a canvas so it can be broken apart.
  function snapshot(w, h, dpr) {
    const out = document.createElement('canvas');
    out.width = Math.round(w * dpr);
    out.height = Math.round(h * dpr);
    const ctx = out.getContext('2d');
    ctx.scale(dpr, dpr);

    ctx.fillStyle = '#03050a';
    ctx.fillRect(0, 0, w, h);
    const gx = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--globe-x')) || w * 0.69;
    const haze = ctx.createRadialGradient(gx, h / 2, 0, gx, h / 2, Math.max(w, h) * 0.5);
    haze.addColorStop(0, 'rgba(40, 80, 150, 0.09)');
    haze.addColorStop(1, 'rgba(40, 80, 150, 0)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, w, h);

    try {
      ctx.drawImage(document.getElementById('stars'), 0, 0, w, h);
    } catch (_) {
      /* decorative */
    }
    try {
      window.paintGlobe?.(ctx, w, h);
    } catch (_) {
      /* decorative */
    }

    // Redraw each word of the intro where the browser laid it out.
    const range = document.createRange();
    for (const el of document.querySelectorAll('.hero .name, .hero .lede, .hero .links a')) {
      const style = getComputedStyle(el);
      ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      ctx.fillStyle = style.color;
      if ('letterSpacing' in ctx) ctx.letterSpacing = style.letterSpacing === 'normal' ? '0px' : style.letterSpacing;
      ctx.textBaseline = 'alphabetic';
      const upper = style.textTransform === 'uppercase';
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const words = /\S+/g;
        for (let m = words.exec(node.textContent); m; m = words.exec(node.textContent)) {
          range.setStart(node, m.index);
          range.setEnd(node, m.index + m[0].length);
          const r = range.getBoundingClientRect();
          if (!r.width) continue;
          const word = upper ? m[0].toUpperCase() : m[0];
          const metrics = ctx.measureText(word);
          const ascent = metrics.fontBoundingBoxAscent ?? parseFloat(style.fontSize) * 0.8;
          const descent = metrics.fontBoundingBoxDescent ?? parseFloat(style.fontSize) * 0.2;
          ctx.fillText(word, r.left, r.top + (r.height - ascent - descent) / 2 + ascent);
        }
      }
    }
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    return out;
  }

  async function iconTexture(T, svg) {
    const xml = new XMLSerializer().serializeToString(svg);
    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    c.getContext('2d').drawImage(img, 0, 0, 512, 512);
    const texture = new T.CanvasTexture(c);
    texture.colorSpace = T.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
  }

  /* ---------- Shaders ---------- */

  const SURFACE_VERT = /* glsl */ `
    varying vec2 vUv;
    varying vec3 vN;
    varying vec3 vV;
    void main() {
      vUv = uv;
      vN = normalize(normalMatrix * normal);
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vV = normalize(-mv.xyz);
      gl_Position = projectionMatrix * mv;
    }
  `;

  // Glass shard carrying a piece of the page. Flat-on it shows the page
  // exactly; as it turns it darkens and catches a specular glint.
  const SHARD_FRAG = /* glsl */ `
    uniform sampler2D uMap;
    uniform float uOpacity;
    varying vec2 vUv;
    varying vec3 vN;
    varying vec3 vV;
    void main() {
      vec3 base = texture2D(uMap, vUv).rgb;
      vec3 N = normalize(vN);
      vec3 L = normalize(vec3(-0.45, 0.65, 0.6));
      float spec = pow(max(dot(reflect(-L, N), normalize(vV)), 0.0), 48.0);
      float turned = clamp(1.0 - N.z, 0.0, 1.0);
      vec3 color = base * (1.0 - 0.5 * turned)
        + vec3(0.8, 0.9, 1.0) * spec * 0.9
        + vec3(0.25, 0.4, 0.7) * turned * 0.12;
      gl_FragColor = vec4(color, uOpacity);
      #include <colorspace_fragment>
    }
  `;

  // A piece of an icon: starts as bright glass, resolves into the icon.
  const PIECE_FRAG = /* glsl */ `
    uniform sampler2D uMap;
    uniform float uMorph;
    uniform float uGlow;
    uniform float uOpacity;
    varying vec2 vUv;
    varying vec3 vN;
    varying vec3 vV;
    void main() {
      vec4 icon = texture2D(uMap, vUv);
      vec3 N = normalize(vN);
      vec3 L = normalize(vec3(-0.45, 0.65, 0.6));
      float spec = pow(max(dot(reflect(-L, N), normalize(vV)), 0.0), 32.0);
      vec3 glass = vec3(0.42, 0.6, 0.95);
      vec3 color = mix(glass, icon.rgb, uMorph);
      color += vec3(0.85, 0.92, 1.0) * spec * (1.0 - 0.7 * uMorph);
      color += vec3(0.45, 0.65, 1.0) * uGlow;
      float alpha = mix(0.75, icon.a, uMorph) * uOpacity;
      if (alpha < 0.004) discard;
      gl_FragColor = vec4(color, alpha);
      #include <colorspace_fragment>
    }
  `;

  // Additive output that composites correctly over a transparent canvas.
  const ADDITIVE = (T) => ({
    transparent: true,
    depthWrite: false,
    blending: T.CustomBlending,
    blendSrc: T.OneFactor,
    blendDst: T.OneFactor,
    blendSrcAlpha: T.OneFactor,
    blendDstAlpha: T.OneFactor,
  });

  const GLOW_FRAG = /* glsl */ `
    uniform vec3 uColor;
    uniform float uIntensity;
    uniform float uPower;
    varying vec2 vUv;
    void main() {
      float d = length(vUv - 0.5) * 2.0;
      vec3 c = uColor * pow(max(1.0 - d, 0.0), uPower) * uIntensity;
      gl_FragColor = vec4(c, clamp(max(c.r, max(c.g, c.b)), 0.0, 1.0));
    }
  `;

  // Full-screen flash plus the expanding shockwave ring, in pixel space.
  const BLAST_FRAG = /* glsl */ `
    uniform vec2 uSize;
    uniform vec2 uCenter;
    uniform float uFlash;
    uniform float uRing;
    uniform float uRadius;
    uniform float uWidth;
    varying vec2 vUv;
    void main() {
      vec2 p = vUv * uSize;
      float d = distance(p, uCenter);
      float core = exp(-d * d / (uSize.y * uSize.y * 0.05));
      vec3 flash = mix(vec3(1.0, 0.55, 0.2), vec3(1.0, 0.97, 0.9), core) * (core * 1.2 + 0.18) * uFlash;
      float ring = exp(-pow((d - uRadius) / uWidth, 2.0)) * uRing;
      vec3 c = flash + vec3(0.65, 0.8, 1.0) * ring;
      gl_FragColor = vec4(c, clamp(max(c.r, max(c.g, c.b)), 0.0, 1.0));
    }
  `;

  const CRACK_VERT = /* glsl */ `
    attribute float aDist;
    varying float vDist;
    void main() {
      vDist = aDist;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  const CRACK_FRAG = /* glsl */ `
    uniform float uFront;
    uniform float uFade;
    varying float vDist;
    void main() {
      float lit = step(vDist, uFront) * exp(-(uFront - vDist) / 900.0);
      vec3 c = vec3(0.8, 0.9, 1.0) * lit * uFade;
      gl_FragColor = vec4(c, clamp(max(c.r, max(c.g, c.b)), 0.0, 1.0));
    }
  `;

  const PARTICLE_VERT = /* glsl */ `
    attribute float aSize;
    attribute vec4 aColor;
    uniform float uScale;
    varying vec4 vColor;
    void main() {
      vColor = aColor;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = aSize * uScale / max(-mv.z, 1.0);
      gl_Position = projectionMatrix * mv;
    }
  `;

  const PARTICLE_FRAG = /* glsl */ `
    varying vec4 vColor;
    void main() {
      vec2 p = gl_PointCoord * 2.0 - 1.0;
      float d = dot(p, p);
      if (d > 1.0) discard;
      float falloff = (1.0 - d) * (1.0 - d);
      vec3 c = vColor.rgb * vColor.a * falloff;
      gl_FragColor = vec4(c, clamp(max(c.r, max(c.g, c.b)), 0.0, 1.0));
    }
  `;

  const HEAT_FRAG = /* glsl */ `
    uniform float uHeat;
    varying vec3 vN;
    varying vec3 vV;
    void main() {
      float facing = abs(dot(normalize(vN), normalize(vV)));
      float rim = pow(1.0 - facing, 3.0) * smoothstep(0.0, 0.25, facing);
      vec3 c = mix(vec3(1.0, 0.32, 0.05), vec3(1.0, 0.8, 0.45), rim) * rim * uHeat;
      gl_FragColor = vec4(c, clamp(max(c.r, max(c.g, c.b)), 0.0, 1.0));
    }
  `;

  /* ---------- Asteroid ---------- */

  function rockGeometry(T) {
    const geo = new T.IcosahedronGeometry(1, 5);
    const p = geo.attributes.position;
    const v = new T.Vector3();
    const craters = Array.from({ length: 8 }, () => ({
      c: new T.Vector3().randomDirection(),
      r: rand(0.22, 0.5),
      d: rand(0.05, 0.12),
    }));
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).normalize();
      let n =
        1 +
        0.16 * Math.sin(v.x * 2.1 + 1.3) * Math.sin(v.y * 2.7 + 0.4) * Math.sin(v.z * 1.9 + 2.2) +
        0.06 * Math.sin(v.x * 6.3 + v.y * 5.1) * Math.cos(v.z * 5.7) +
        0.025 * Math.sin(v.x * 13.1) * Math.sin(v.y * 11.7 + v.z * 12.3);
      for (const k of craters) {
        const dist = v.distanceTo(k.c);
        if (dist < k.r) {
          const x = 1 - (dist / k.r) ** 2;
          n -= k.d * x * x;
        } else if (dist < k.r * 1.3) {
          n += k.d * 0.3 * (1 - (dist - k.r) / (k.r * 0.3));
        }
      }
      v.multiplyScalar(n);
      p.setXYZ(i, v.x * 1.18, v.y, v.z * 0.92);
    }
    geo.computeVertexNormals();
    return geo;
  }

  /* ---------- The sequence ---------- */

  async function strike(T, alive) {
    const w = innerWidth;
    const h = innerHeight;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const icons = [...dialog.querySelectorAll('.app-icon')];
    const iconMaps = await Promise.all(icons.map((a) => iconTexture(T, a.querySelector('svg'))));
    if (!alive()) {
      iconMaps.forEach((t) => t.dispose());
      return () => {};
    }

    const renderer = new T.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    renderer.setClearColor(0x000000, 0);

    const scene = new T.Scene();
    // At z = 0, one world unit is one CSS pixel; +y is up.
    const camera = new T.PerspectiveCamera(35, w / h, 1, 20000);
    const camZ = h / 2 / Math.tan(T.MathUtils.degToRad(17.5));
    camera.position.z = camZ;
    const world = (sx, sy) => new T.Vector3(sx - w / 2, h / 2 - sy, 0);

    // Strike where the icons will form.
    const row = iconRow.getBoundingClientRect();
    const iconBox = icons.map((a) => a.getBoundingClientRect());
    const impactS = { x: w / 2, y: (iconBox[0].top + iconBox[0].bottom) / 2 || row.top + row.height / 2 };
    const impact = world(impactS.x, impactS.y);
    const scaleK = Math.min(Math.max(Math.min(w, h * 1.6) / 1300, 0.65), 1.2);

    /* Lights and asteroid */

    scene.add(new T.AmbientLight(0x3a4560, 0.7));
    const key = new T.DirectionalLight(0xc8dcff, 2.4);
    key.position.set(-1, 1, 0.8);
    scene.add(key);
    const heatLight = new T.PointLight(0xff6a1a, 5, 0, 0);
    scene.add(heatLight);

    const rockR = 58 * scaleK;
    const rockGeo = rockGeometry(T);
    const rock = new T.Mesh(
      rockGeo,
      new T.MeshStandardMaterial({ color: 0x6d5c50, roughness: 0.95, metalness: 0.05, flatShading: true }),
    );
    rock.scale.setScalar(rockR);
    scene.add(rock);
    const heat = new T.Mesh(
      rockGeo,
      new T.ShaderMaterial({ uniforms: { uHeat: { value: 0 } }, vertexShader: SURFACE_VERT, fragmentShader: HEAT_FRAG, ...ADDITIVE(T) }),
    );
    heat.scale.setScalar(1.07);
    rock.add(heat);

    const glowGeo = new T.PlaneGeometry(1, 1);
    const makeGlow = (color, power) =>
      new T.Mesh(
        glowGeo,
        new T.ShaderMaterial({
          uniforms: { uColor: { value: new T.Color(color) }, uIntensity: { value: 0 }, uPower: { value: power } },
          vertexShader: SURFACE_VERT,
          fragmentShader: GLOW_FRAG,
          ...ADDITIVE(T),
        }),
      );
    const coma = makeGlow(0xff6a20, 2.2);
    const core = makeGlow(0xfff0d0, 3.0);
    coma.renderOrder = core.renderOrder = 5;
    scene.add(coma, core);

    const rockStart = impact.clone().add(new T.Vector3(w * 1.7, h * 1.35, -3600));
    const rockEnd = impact.clone().add(new T.Vector3(0, 0, rockR));
    const travel = rockEnd.clone().sub(rockStart).normalize();
    const spinAxis = new T.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize();

    /* Particles: fiery trail, impact embers, glass glints */

    const MAX_PARTICLES = 2200;
    const pPos = new Float32Array(MAX_PARTICLES * 3);
    const pSize = new Float32Array(MAX_PARTICLES);
    const pColor = new Float32Array(MAX_PARTICLES * 4);
    const particles = [];
    const pGeo = new T.BufferGeometry();
    pGeo.setAttribute('position', new T.BufferAttribute(pPos, 3));
    pGeo.setAttribute('aSize', new T.BufferAttribute(pSize, 1));
    pGeo.setAttribute('aColor', new T.BufferAttribute(pColor, 4));
    const points = new T.Points(
      pGeo,
      new T.ShaderMaterial({
        uniforms: { uScale: { value: camZ * dpr } },
        vertexShader: PARTICLE_VERT,
        fragmentShader: PARTICLE_FRAG,
        ...ADDITIVE(T),
      }),
    );
    points.frustumCulled = false;
    points.renderOrder = 6;
    scene.add(points);

    const PALETTE = {
      fire: [[1, 0.95, 0.8], [1, 0.55, 0.15], [0.75, 0.14, 0.04]],
      ember: [[1, 0.92, 0.7], [1, 0.45, 0.1], [0.6, 0.1, 0.02]],
      glass: [[0.9, 0.96, 1], [0.6, 0.78, 1], [0.3, 0.45, 0.9]],
    };
    function emit(kind, pos, vel, life, size0, size1, drag, gravity, brightness = 1) {
      if (particles.length >= MAX_PARTICLES) return;
      particles.push({ kind, p: pos.clone(), v: vel, life, age: 0, size0, size1, drag, gravity, brightness });
    }
    function updateParticles(dt) {
      let n = 0;
      for (let i = particles.length - 1; i >= 0; i--) {
        const q = particles[i];
        q.age += dt;
        if (q.age >= q.life) {
          particles.splice(i, 1);
          continue;
        }
        q.v.multiplyScalar(Math.exp(-q.drag * dt));
        q.v.y -= q.gravity * dt;
        q.p.addScaledVector(q.v, dt);
      }
      for (const q of particles) {
        const f = q.age / q.life;
        const [c0, c1, c2] = PALETTE[q.kind];
        const c = f < 0.3 ? lerp3(c0, c1, f / 0.3) : lerp3(c1, c2, (f - 0.3) / 0.7);
        pPos.set([q.p.x, q.p.y, q.p.z], n * 3);
        pSize[n] = q.size0 + (q.size1 - q.size0) * f;
        pColor.set([c[0], c[1], c[2], (1 - f) ** 1.4 * q.brightness], n * 4);
        n++;
      }
      pGeo.setDrawRange(0, n);
      pGeo.attributes.position.needsUpdate = true;
      pGeo.attributes.aSize.needsUpdate = true;
      pGeo.attributes.aColor.needsUpdate = true;
    }
    const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    const randomDir = () => new T.Vector3().randomDirection();

    /* Flash and shockwave */

    const blast = new T.Mesh(
      new T.PlaneGeometry(w, h),
      new T.ShaderMaterial({
        uniforms: {
          uSize: { value: new T.Vector2(w, h) },
          uCenter: { value: new T.Vector2(impactS.x, h - impactS.y) },
          uFlash: { value: 0 },
          uRing: { value: 0 },
          uRadius: { value: 0 },
          uWidth: { value: 20 },
        },
        vertexShader: SURFACE_VERT,
        fragmentShader: BLAST_FRAG,
        ...ADDITIVE(T),
        depthTest: false,
      }),
    );
    blast.position.z = 1;
    blast.renderOrder = 10;
    scene.add(blast);

    /* The screen, cut into glass */

    const maxR = Math.max(
      Math.hypot(impactS.x, impactS.y),
      Math.hypot(w - impactS.x, impactS.y),
      Math.hypot(impactS.x, h - impactS.y),
      Math.hypot(w - impactS.x, h - impactS.y),
    );
    // Rings of sites, tighter near the impact and more numerous around each
    // ring than between rings, which gives long radial shards like real glass.
    const sites = [[impactS.x + rand(-4, 4), impactS.y + rand(-4, 4)]];
    for (const [f, count] of [[0.05, 8], [0.12, 12], [0.22, 16], [0.36, 20], [0.55, 24], [0.8, 26], [1.1, 26]]) {
      const offset = rand(0, Math.PI * 2);
      for (let k = 0; k < count; k++) {
        const a = offset + ((k + rand(-0.3, 0.3)) / count) * Math.PI * 2;
        const r = maxR * f * rand(0.85, 1.15);
        sites.push([impactS.x + Math.cos(a) * r, impactS.y + Math.sin(a) * r]);
      }
    }
    const screenRect = [[0, 0], [w, 0], [w, h], [0, h]];
    const shardMap = { value: null };
    const shards = [];
    const crackPositions = [];
    const crackDists = [];

    for (const cell of voronoi(sites, screenRect)) {
      if (cell.length < 3) continue;
      const c = polygonCentroid(cell);
      if (!(c.area > 4)) continue;
      const shape = new T.Shape(cell.map(([x, y]) => new T.Vector2(x - c.x, c.y - y)));
      const geo = new T.ExtrudeGeometry(shape, { depth: 3, bevelEnabled: false });
      geo.translate(0, 0, -3);
      const pos = geo.attributes.position;
      const uv = geo.attributes.uv;
      for (let k = 0; k < pos.count; k++) {
        uv.setXY(k, (pos.getX(k) + c.x) / w, 1 - (c.y - pos.getY(k)) / h);
      }
      const face = new T.ShaderMaterial({
        uniforms: { uMap: shardMap, uOpacity: { value: 1 } },
        vertexShader: SURFACE_VERT,
        fragmentShader: SHARD_FRAG,
        transparent: true,
      });
      const edge = new T.MeshBasicMaterial({ color: 0x7f9fd0, transparent: true, opacity: 1 });
      const mesh = new T.Mesh(geo, [face, edge]);
      mesh.visible = false;
      scene.add(mesh);

      const dx = c.x - impactS.x;
      const dy = c.y - impactS.y;
      const dist = Math.hypot(dx, dy) || 1;
      const near = 1 - Math.min(dist / maxR, 1);
      shards.push({
        mesh,
        face,
        edge,
        home: world(c.x, c.y),
        size: Math.sqrt(c.area),
        dir: new T.Vector3(dx / dist, -dy / dist, 0),
        near,
        crackAt: dist / CRACK_SPEED,
        release: dist / CRACK_SPEED + rand(0.05, 0.16),
        speed: 140 + 950 * near ** 1.5 + rand(0, 120),
        vz: (Math.random() < 0.78 ? 1 : -0.5) * (120 + 950 * near * rand(0.4, 1)),
        axis: randomDir(),
        spin: (1.4 + 5 * near) * rand(0.5, 1.4),
        fadeFrom: Infinity, // set for shards that hand off to an icon piece
      });

      for (let k = 0; k < cell.length; k++) {
        const a = cell[k];
        const b = cell[(k + 1) % cell.length];
        crackPositions.push(a[0] - w / 2, h / 2 - a[1], 0.5, b[0] - w / 2, h / 2 - b[1], 0.5);
        crackDists.push(Math.hypot(a[0] - impactS.x, a[1] - impactS.y), Math.hypot(b[0] - impactS.x, b[1] - impactS.y));
      }
    }

    const crackGeo = new T.BufferGeometry();
    crackGeo.setAttribute('position', new T.Float32BufferAttribute(crackPositions, 3));
    crackGeo.setAttribute('aDist', new T.Float32BufferAttribute(crackDists, 1));
    const cracks = new T.LineSegments(
      crackGeo,
      new T.ShaderMaterial({
        uniforms: { uFront: { value: 0 }, uFade: { value: 0 } },
        vertexShader: CRACK_VERT,
        fragmentShader: CRACK_FRAG,
        ...ADDITIVE(T),
      }),
    );
    cracks.visible = false;
    cracks.renderOrder = 4;
    scene.add(cracks);

    // Where a shard is at time t (seconds since start). Returns its opacity.
    const tmpQ = new T.Quaternion();
    function shardState(s, t, outPos, outQuat) {
      const age = t - T_HIT;
      outPos.copy(s.home);
      outQuat.identity();
      if (age < s.crackAt) return 1;
      // The fracture opens a hairline gap first...
      const gap = smoothstep(s.crackAt, s.crackAt + 0.08, age) * (1.5 + 3 * s.near);
      outPos.addScaledVector(s.dir, gap);
      const f = age - s.release;
      if (f <= 0) return 1;
      // ...then the shard breaks free: drag-damped burst, gravity, tumble.
      const ramp = smoothstep(0, 0.12, f);
      outPos.addScaledVector(s.dir, (s.speed * (1 - Math.exp(-1.1 * f))) / 1.1);
      outPos.y -= 380 * f * f;
      outPos.z += Math.min((s.vz * (1 - Math.exp(-0.9 * f))) / 0.9, camZ * 0.6);
      outQuat.setFromAxisAngle(s.axis, s.spin * f * ramp);
      return 1 - smoothstep(0.9, 1.7, f);
    }

    /* Icon pieces */

    const pieceGeos = [];
    const pieces = [];
    const tiles = iconBox.map((box, i) => {
      const size = box.width;
      // Jittered grid so pieces are irregular but never slivers.
      const pts = [];
      for (let gy = 0; gy < 3; gy++) {
        for (let gx = 0; gx < 3; gx++) {
          pts.push([((gx + 0.5 + rand(-0.35, 0.35)) / 3) * size, ((gy + 0.5 + rand(-0.35, 0.35)) / 3) * size]);
        }
      }
      pts.push([rand(0.2, 0.8) * size, rand(0.2, 0.8) * size]);
      const tile = { landed: 0, glow: makeGlow(i === 0 ? 0x8fb4ff : 0x5ea4ff, 2.0) };
      tile.glow.position.copy(world(box.left + size / 2, box.top + size / 2));
      tile.glow.position.z = -2;
      tile.glow.scale.setScalar(size * 2.4);
      tile.glow.renderOrder = 3;
      scene.add(tile.glow);

      for (const cell of voronoi(pts, [[0, 0], [size, 0], [size, size], [0, size]])) {
        if (cell.length < 3) continue;
        const c = polygonCentroid(cell);
        const shape = new T.Shape(cell.map(([x, y]) => new T.Vector2(x - c.x, c.y - y)));
        const geo = new T.ExtrudeGeometry(shape, { depth: 4, bevelEnabled: false });
        geo.translate(0, 0, -4);
        const pos = geo.attributes.position;
        const uv = geo.attributes.uv;
        for (let k = 0; k < pos.count; k++) uv.setXY(k, (pos.getX(k) + c.x) / size, 1 - (c.y - pos.getY(k)) / size);
        pieceGeos.push(geo);
        const face = new T.ShaderMaterial({
          uniforms: { uMap: { value: iconMaps[i] }, uMorph: { value: 0 }, uGlow: { value: 0 }, uOpacity: { value: 0 } },
          vertexShader: SURFACE_VERT,
          fragmentShader: PIECE_FRAG,
          transparent: true,
        });
        const edge = new T.MeshBasicMaterial({ color: 0xb8d4ff, transparent: true, opacity: 0 });
        const mesh = new T.Mesh(geo, [face, edge]);
        mesh.visible = false;
        mesh.renderOrder = 2;
        scene.add(mesh);
        const start = T_REBUILD + i * 0.08 + rand(0, 0.42);
        const duration = rand(1.1, 1.45);
        pieces.push({
          mesh,
          face,
          edge,
          tile,
          size: Math.sqrt(c.area),
          target: world(box.left + c.x, box.top + c.y),
          start,
          duration,
          swirl: new T.Vector3(rand(-1, 1), rand(-1, 1), 0).multiplyScalar(size * 1.6),
          lift: rand(220, 420),
          landed: false,
        });
        tile.landed = Math.max(tile.landed, start + duration);
      }
      return tile;
    });

    // Each piece is born from a shard that's still on screen when it leaves.
    const p0 = new T.Vector3();
    const q0 = new T.Quaternion();
    const candidates = shards
      .map((s) => {
        const o = shardState(s, T_REBUILD + 0.2, p0, q0);
        const sx = p0.x * (camZ / (camZ - p0.z));
        const sy = p0.y * (camZ / (camZ - p0.z));
        const onScreen = Math.abs(sx) < w * 0.48 && Math.abs(sy) < h * 0.48;
        return { s, score: (onScreen ? 1 : 0) * o * s.size };
      })
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((c) => c.s);
    const pool = candidates.length ? candidates : shards;
    pieces.forEach((piece, i) => {
      const src = pool[i % Math.min(pool.length, pieces.length)];
      piece.source = src;
      src.fadeFrom = Math.min(src.fadeFrom, piece.start);
    });
    for (const piece of pieces) {
      const P0 = new T.Vector3();
      const Q0 = new T.Quaternion();
      const P0b = new T.Vector3();
      shardState(piece.source, piece.start, P0, Q0);
      shardState(piece.source, piece.start + 1 / 60, P0b, tmpQ);
      const velocity = P0b.sub(P0).multiplyScalar(60);
      piece.P0 = P0;
      piece.Q0 = Q0;
      piece.P1 = P0.clone().addScaledVector(velocity, piece.duration / 9);
      piece.P2 = piece.target.clone().add(piece.swirl).add(new T.Vector3(0, 0, piece.lift));
      piece.scale0 = Math.min(Math.max(piece.source.size / piece.size, 1), 2.6);
    }
    const tBuilt = Math.max(...tiles.map((t) => t.landed)) + 0.2;

    /* Loop */

    const startTime = performance.now();
    let last = startTime;
    let raf = 0;
    let hit = false;
    let captured = false;
    let built = false;
    let disposed = false;
    const rockPos = new T.Vector3();
    const prevRockPos = new T.Vector3();
    const tmpPos = new T.Vector3();
    const identity = new T.Quaternion();
    let pageTexture = null;

    function capture() {
      captured = true;
      pageTexture = new T.CanvasTexture(snapshot(w, h, dpr));
      pageTexture.colorSpace = T.SRGBColorSpace;
      pageTexture.minFilter = T.LinearFilter;
      pageTexture.generateMipmaps = false;
      shardMap.value = pageTexture;
      renderer.initTexture(pageTexture);
    }

    function strikeGlass() {
      hit = true;
      dialog.classList.add('is-struck');
      document.body.classList.add('contact-struck');
      rock.visible = coma.visible = core.visible = false;
      heatLight.intensity = 0;
      for (const s of shards) s.mesh.visible = true;
      cracks.visible = true;
      for (let i = 0; i < 320; i++) {
        const d = randomDir();
        d.z = Math.abs(d.z) * 1.4;
        emit('ember', impact.clone().add(randomDir().multiplyScalar(rand(0, 20))), d.multiplyScalar(rand(300, 1700)), rand(0.5, 1.4), rand(5, 11), rand(1, 3), 2.4, 520);
      }
      for (let i = 0; i < 160; i++) {
        const d = randomDir();
        d.z = Math.abs(d.z);
        emit('glass', impact.clone(), d.multiplyScalar(rand(400, 1400)), rand(0.4, 1.0), rand(3, 6), 1, 2.8, 300, 1.4);
      }
    }

    function frame(now) {
      if (disposed || !alive()) return;
      const t = (now - startTime) / 1000;
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;

      // Approach: accelerate in from deep space toward the glass.
      if (!hit) {
        const u = Math.min(t / T_HIT, 1);
        const e = u ** 1.7;
        prevRockPos.copy(t > 0 && rockPos.lengthSq() ? rockPos : rockStart);
        rockPos.lerpVectors(rockStart, rockEnd, e);
        rock.position.copy(rockPos);
        rock.quaternion.setFromAxisAngle(spinAxis, t * 3.2);
        heat.material.uniforms.uHeat.value = 0.4 + 0.8 * u;
        heatLight.position.copy(rockPos).add(new T.Vector3(-0.2, -0.2, 1.4).multiplyScalar(rockR));
        heatLight.intensity = 3 + 6 * u;
        coma.position.copy(rockPos).addScaledVector(travel, -rockR * 0.6);
        coma.scale.setScalar(rockR * 7);
        coma.material.uniforms.uIntensity.value = 0.55 + 0.6 * u;
        core.position.copy(rockPos).addScaledVector(travel, rockR * 0.3);
        core.scale.setScalar(rockR * 2.8);
        core.material.uniforms.uIntensity.value = 0.6 + 0.8 * u;
        const count = Math.round(dt * 900);
        for (let i = 0; i < count; i++) {
          const along = prevRockPos.clone().lerp(rockPos, Math.random());
          const pos = along.add(randomDir().multiplyScalar(rockR * rand(0.2, 0.8)));
          const vel = travel.clone().multiplyScalar(-rand(80, 260)).add(randomDir().multiplyScalar(rand(10, 60)));
          emit('fire', pos, vel, rand(0.3, 0.7), rockR * rand(0.9, 1.6), rockR * rand(2.0, 3.0), 1.5, 0, 0.32);
        }
        blast.material.uniforms.uFlash.value = smoothstep(T_HIT - 0.12, T_HIT, t) * 0.6;
        if (!captured && t >= T_HIT - 0.05) capture();
        if (t >= T_HIT) strikeGlass();
      }

      if (hit) {
        const age = t - T_HIT;
        const blastU = blast.material.uniforms;
        blastU.uFlash.value = 1.6 * Math.exp(-age * 6.5);
        blastU.uRadius.value = maxR * 1.4 * (1 - Math.exp(-age * 2.4));
        blastU.uWidth.value = 16 + 90 * age;
        blastU.uRing.value = 0.7 * Math.exp(-age * 2.6);

        cracks.material.uniforms.uFront.value = age * CRACK_SPEED;
        cracks.material.uniforms.uFade.value = 1.3 * Math.exp(-age * 7.5);
        if (age > 0.6) cracks.visible = false;

        for (const s of shards) {
          if (!s.mesh.visible) continue;
          let o = shardState(s, t, s.mesh.position, s.mesh.quaternion);
          if (s.fadeFrom < Infinity) o *= 1 - smoothstep(s.fadeFrom, s.fadeFrom + 0.3, t);
          if (s.mesh.position.z > camZ * 0.45) o *= 1 - smoothstep(camZ * 0.45, camZ * 0.6, s.mesh.position.z);
          s.face.uniforms.uOpacity.value = o;
          s.edge.opacity = o * 0.55;
          if (o <= 0.002 && t > T_HIT + 0.5) s.mesh.visible = false;
        }

        // Camera shake that dies away quickly.
        const shake = 16 * scaleK * Math.exp(-age * 8);
        camera.position.x = shake * (Math.sin(age * 91) + 0.5 * Math.sin(age * 53 + 1));
        camera.position.y = shake * (Math.cos(age * 77) + 0.5 * Math.sin(age * 41 + 2));
      }

      // Rebuild: each piece leaves its shard and curves home.
      for (const piece of pieces) {
        const u = (t - piece.start) / piece.duration;
        if (u < 0) continue;
        piece.mesh.visible = true;
        const k = clamp01(u);
        const e = 1 - (1 - k) ** 3;
        const a = 1 - e;
        // Cubic Bézier: momentum from the shard, then a swing in from the front.
        piece.mesh.position
          .copy(piece.P0)
          .multiplyScalar(a * a * a)
          .addScaledVector(piece.P1, 3 * a * a * e)
          .addScaledVector(piece.P2, 3 * a * e * e)
          .addScaledVector(piece.target, e * e * e);
        piece.mesh.quaternion.slerpQuaternions(piece.Q0, identity, smootherstep(k));
        piece.mesh.scale.setScalar(piece.scale0 + (1 - piece.scale0) * smoothstep(0, 0.6, k));
        const flash = t > piece.tile.landed ? 0.9 * Math.exp(-(t - piece.tile.landed) * 5) : 0;
        piece.face.uniforms.uOpacity.value = smoothstep(0, 0.12, k);
        piece.face.uniforms.uMorph.value = smoothstep(0.2, 0.75, k);
        piece.face.uniforms.uGlow.value = 0.5 * (1 - smoothstep(0.5, 1, k)) + flash * 0.35;
        piece.edge.opacity = 0.9 * (1 - smoothstep(0.7, 1, k));
        if (k >= 1 && !piece.landed) {
          piece.landed = true;
          for (let i = 0; i < 5; i++) {
            emit('glass', piece.target.clone(), randomDir().setZ(rand(0, 1)).multiplyScalar(rand(60, 220)), rand(0.3, 0.6), rand(2, 4), 1, 3, 0, 1.2);
          }
        }
      }
      for (const tile of tiles) {
        const since = t - tile.landed;
        tile.glow.material.uniforms.uIntensity.value = since > 0 ? 0.55 * Math.exp(-since * 4) : 0;
      }

      updateParticles(dt);
      renderer.render(scene, camera);

      if (!built && t >= tBuilt) {
        built = true;
        dialog.classList.add('is-built');
        iconRow.inert = false;
      }
      if (built && t >= tBuilt + 1.0) {
        dispose();
        return;
      }
      raf = requestAnimationFrame(frame);
    }

    function dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(raf);
      renderer.setClearColor(0x000000, 0);
      renderer.clear();
      scene.traverse((obj) => {
        obj.geometry?.dispose();
        const mats = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : [];
        mats.forEach((m) => m.dispose());
      });
      pieceGeos.forEach((g) => g.dispose());
      iconMaps.forEach((t) => t.dispose());
      pageTexture?.dispose();
      renderer.dispose();
    }

    raf = requestAnimationFrame(frame);
    return dispose;
  }

  if (location.hash === '#contact') open();
})();
