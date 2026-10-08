// Contact remains usable if WebGL or the animation dependency is unavailable.
(() => {
  const dialog = document.querySelector('#contact');
  const content = dialog.querySelector('.contact-content');
  const skip = document.querySelector('#skip-impact');
  const replay = document.querySelector('#replay-impact');
  const status = document.querySelector('#impact-status');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let dispose = () => {}, generation = 0, previousFocus;
  function finish() {
    generation++;
    dispose();
    dialog.classList.add('is-complete');
    document.body.classList.add('contact-struck');
    content.inert = false;
    skip.hidden = true;
    replay.hidden = reduced.matches;
    status.textContent = 'CONNECTION ESTABLISHED';
    document.querySelector('#contact-title').focus({ preventScroll: true });
  }
  function close() {
    generation++;
    dispose();
    dialog.close();
    document.body.classList.remove('contact-open', 'contact-struck');
    if (location.hash === '#contact') history.replaceState(null, '', location.pathname + location.search);
    previousFocus?.focus({ preventScroll: true });
  }
  async function play() {
    const run = ++generation;
    dispose();
    dialog.scrollTop = 0;
    dialog.classList.remove('is-complete', 'has-impact');
    document.body.classList.remove('contact-struck');
    content.inert = true;
    skip.hidden = false;
    replay.hidden = true;
    status.textContent = 'INCOMING / MAKING CONTACT';
    if (reduced.matches) return finish();
    // A stalled CDN must never leave the contact information behind a loading state.
    const timeout = setTimeout(() => { if (run === generation) finish(); }, 8000);
    dispose = () => clearTimeout(timeout);
    try {
      const THREE = await import('three');
      if (run !== generation) return;
      clearTimeout(timeout);
      animate(THREE, run);
    } catch (error) {
      console.warn('Contact animation unavailable.', error);
      if (run === generation) finish();
    }
  }
  function open() {
    if (dialog.open) return;
    previousFocus = document.activeElement;
    dialog.showModal();
    document.body.classList.add('contact-open');
    history.replaceState(null, '', '#contact');
    play();
  }
  document.querySelector('a[href="#contact"]').addEventListener('click', e => { e.preventDefault(); open(); });
  document.querySelector('#close-contact').addEventListener('click', close);
  dialog.addEventListener('cancel', e => { e.preventDefault(); close(); });
  skip.addEventListener('click', finish);
  replay.addEventListener('click', play);
  window.addEventListener('hashchange', () => { if (location.hash === '#contact') open(); else if (dialog.open) close(); });
  window.addEventListener('resize', () => { if (dialog.open && !dialog.classList.contains('is-complete')) finish(); });
  reduced.addEventListener('change', () => { if (dialog.open && reduced.matches) finish(); });

  function animate(T, run) {
    const w = innerWidth, h = innerHeight;
    const renderer = new T.WebGLRenderer({ canvas: document.querySelector('#impact'), alpha: true, antialias: true });
    renderer.setSize(w, h, false);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    const scene = new T.Scene();
    // World units coincide with CSS pixels at the page surface (z = 0).
    const camera = new T.PerspectiveCamera(45, w / h, 1, 6000);
    camera.position.z = h / (2 * Math.tan(Math.PI / 8));
    scene.add(new T.AmbientLight(0x6b8daf, 2));
    const sun = new T.PointLight(0xffa05b, 1200000);
    sun.position.set(-200, 250, 250);
    scene.add(sun);
    const geometry = new T.IcosahedronGeometry(42, 2);
    const vertices = geometry.attributes.position;
    for (let i = 0; i < vertices.count; i++) {
      const x = vertices.getX(i), y = vertices.getY(i), z = vertices.getZ(i);
      const rough = 1 + .13 * Math.sin(x * .19 + y * .1) * Math.cos(z * .16);
      vertices.setXYZ(i, x * rough, y * rough, z * rough);
    }
    geometry.computeVertexNormals();
    const rock = new T.Mesh(geometry, new T.MeshStandardMaterial({ color: 0x49352d, roughness: .96, flatShading: true, emissive: 0x7d2106, emissiveIntensity: .7 }));
    scene.add(rock);
    const glowCanvas = document.createElement('canvas');
    glowCanvas.width = glowCanvas.height = 128;
    const gc = glowCanvas.getContext('2d');
    const gradient = gc.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, '#fff1d2'); gradient.addColorStop(.15, '#ffb04ddd'); gradient.addColorStop(.4, '#ff551644'); gradient.addColorStop(1, '#ff550000');
    gc.fillStyle = gradient; gc.fillRect(0, 0, 128, 128);
    const glowTexture = new T.CanvasTexture(glowCanvas);
    const trail = Array.from({ length: 22 }, (_, i) => {
      const sprite = new T.Sprite(new T.SpriteMaterial({ map: glowTexture, transparent: true, blending: T.AdditiveBlending, depthWrite: false, opacity: (1 - i / 22) * .65 }));
      scene.add(sprite); return sprite;
    });
    const ring = new T.Mesh(new T.RingGeometry(.94, 1, 96), new T.MeshBasicMaterial({ color: 0xffbc7c, transparent: true, opacity: 0, side: T.DoubleSide, depthWrite: false }));
    scene.add(ring);

    // Sample the actual final link typography, so the particles land on the text.
    const textCanvas = document.createElement('canvas');
    textCanvas.width = w; textCanvas.height = h;
    const ctx = textCanvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = 'white'; ctx.textBaseline = 'middle';
    for (const el of document.querySelectorAll('.contact-value')) {
      const rect = el.getBoundingClientRect(), style = getComputedStyle(el);
      ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      ctx.fillText(el.textContent, rect.left, rect.top + rect.height / 2);
    }
    const pixels = ctx.getImageData(0, 0, w, h).data;
    const targets = [];
    for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
      if (pixels[(y * w + x) * 4 + 3] > 80) targets.push(x - w / 2, h / 2 - y, 0);
    }
    const n = targets.length / 3;
    const positions = new Float32Array(n * 3), bursts = new Float32Array(n * 3), colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const angle = Math.random() * Math.PI * 2, radius = 80 + Math.random() * Math.max(w, h) * .65;
      bursts.set([Math.cos(angle) * radius, Math.sin(angle) * radius, (Math.random() - .5) * 650], i * 3);
      colors.set([.65 + Math.random() * .35, .65 + Math.random() * .25, .8 + Math.random() * .2], i * 3);
    }
    const pointsGeometry = new T.BufferGeometry();
    pointsGeometry.setAttribute('position', new T.BufferAttribute(positions, 3));
    pointsGeometry.setAttribute('color', new T.BufferAttribute(colors, 3));
    const points = new T.Points(pointsGeometry, new T.PointsMaterial({ size: 1.6, vertexColors: true, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, sizeAttenuation: true }));
    scene.add(points);

    // Tiles borrow the page's visible text and colors and fracture in perspective.
    const page = document.createElement('canvas'); page.width = w; page.height = h;
    const pc = page.getContext('2d');
    pc.fillStyle = '#03050a'; pc.fillRect(0, 0, w, h);
    for (let i = 0; i < 350; i++) { pc.fillStyle = `rgba(180,205,255,${Math.random() * .6})`; pc.fillRect(Math.random()*w, Math.random()*h, 1, 1); }
    // Capture the current globe when the browser's drawing buffer is available.
    const globe = document.querySelector('#globe');
    try { pc.drawImage(globe, 0, 0, w, h); } catch (_) { /* Decorative layer only. */ }
    for (const el of document.querySelectorAll('.name, .lede, .links a')) {
      const rect = el.getBoundingClientRect(), style = getComputedStyle(el);
      pc.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      pc.fillStyle = style.color; pc.textBaseline = 'top';
      const words = el.textContent.trim().split(/\s+/); let line = '', y = rect.top;
      for (const word of words) {
        if (pc.measureText(line + word).width > rect.width && line) { pc.fillText(line, rect.left, y); y += parseFloat(style.lineHeight) || 24; line = ''; }
        line += word + ' ';
      }
      pc.fillText(line, rect.left, y);
    }
    const texture = new T.CanvasTexture(page); texture.colorSpace = T.SRGBColorSpace;
    const columns = 16, rows = Math.ceil(16 * h / w), tw = w / columns, th = h / rows;
    const tileGeometry = new T.PlaneGeometry(tw * .98, th * .98);
    const shards = [];
    for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) {
      const geo = tileGeometry.clone(), uv = geo.attributes.uv;
      for (let k = 0; k < uv.count; k++) uv.setXY(k, (x + uv.getX(k)) / columns, 1 - (y + 1 - uv.getY(k)) / rows);
      const shard = new T.Mesh(geo, new T.MeshBasicMaterial({ map: texture, transparent: true, side: T.DoubleSide }));
      shard.userData = { x: (x + .5) * tw - w / 2, y: h / 2 - (y + .5) * th, spin: (Math.random() - .5) * 5, z: Math.random() * 450 };
      shard.visible = false; shards.push(shard); scene.add(shard);
    }
    tileGeometry.dispose();
    let raf, start = performance.now(), impacted = false, cleaned = false;
    dispose = () => {
      if (cleaned) return; cleaned = true; cancelAnimationFrame(raf);
      scene.traverse(object => { object.geometry?.dispose(); if (object.material) object.material.dispose(); });
      texture.dispose(); glowTexture.dispose(); renderer.clear(); renderer.dispose();
    };
    const smooth = v => { v = Math.max(0, Math.min(1, v)); return v * v * (3 - 2 * v); };
    function frame(now) {
      if (run !== generation) return;
      const t = (now - start) / 1000;
      const approach = Math.min(t / 1.35, 1);
      const x = (1 - approach) * w * .65, y = (1 - approach) * h * .62;
      rock.position.set(x, y, -900 * (1 - approach));
      rock.rotation.set(t * 2, t * 1.3, t * .7);
      rock.scale.setScalar(.45 + approach * .85);
      rock.visible = t < 1.35;
      trail.forEach((sprite, i) => { sprite.visible = t < 1.35; sprite.position.set(x + i * 13, y + i * 11, rock.position.z - i * 18); sprite.scale.setScalar(135 - i * 4); });
      if (t >= 1.35) {
        if (!impacted) { impacted = true; dialog.classList.add('has-impact'); document.body.classList.add('contact-struck'); status.textContent = 'IMPACT / REASSEMBLING'; }
        const age = t - 1.35, disperse = Math.min(age / 1.25, 1), gather = smooth((age - 1.1) / 2.25);
        ring.scale.setScalar(30 + age * 850); ring.material.opacity = Math.max(0, .65 - age * .75);
        for (const shard of shards) {
          const d = shard.userData;
          shard.visible = age < 1.6;
          shard.position.set(d.x * (1 + age * .7), d.y * (1 + age * .7) - age * age * 130, age * d.z);
          shard.rotation.set(age * d.spin, age * d.spin * .65, age * d.spin * .2);
          shard.material.opacity = Math.max(0, 1 - age / 1.5);
        }
        points.material.opacity = Math.min(age * 3, 1);
        for (let i = 0; i < n; i++) {
          for (let axis = 0; axis < 3; axis++) {
            const k = i * 3 + axis;
            const drift = Math.sin(age * 1.5 + i * .12 + axis) * 18 * (1 - gather);
            positions[k] = bursts[k] * disperse * (1 - gather) + targets[k] * gather + drift;
          }
        }
        pointsGeometry.attributes.position.needsUpdate = true;
        if (gather > .1) status.textContent = 'REASSEMBLING / FINDING A CONNECTION';
      }
      renderer.render(scene, camera);
      if (t > 5.15) { finish(); return; }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
  }
  if (location.hash === '#contact') open();
})();
