// The Work page: a plain, formal page for recruiters. Content follows the
// résumé, trimmed to what matters most.

const RESUME_URL = 'assets/resume/Ryan_Mehta_Resume.pdf';

const EXPERIENCE = [
  {
    org: 'Ditto AI',
    role: 'Product Manager Intern',
    dates: 'Jun 2026 – Present',
    points: [
      'Cut six low-value onboarding prompts after analyzing 12,000 sign-ups and interviewing 12 users; questionnaire completion rose <strong>11 percentage points</strong>.',
      'Designed a pair-level A/B test across 1,000 eligible pairs and a survival analysis of 7,500 users to understand delays to first dates.',
    ],
  },
  {
    org: 'Simeio',
    role: 'Product Analyst',
    dates: 'Jun – Aug 2025',
    points: [
      'Traced the longest onboarding delays in 620 requests to unowned cases and proposed an owner-assignment pilot.',
      'Wrote the PRD and 11 acceptance criteria; during the pilot, 48-hour owner confirmation rose from <strong>52% to 74%</strong>.',
    ],
  },
  {
    org: 'Business Analytics Club',
    role: 'Machine Learning Researcher',
    dates: 'Sep 2025 – Present',
    points: [
      'Built scam-text classifiers and a retrieval pipeline grounded in FTC guidance, reaching <strong>95% recall</strong> at a 4% false-alert rate.',
    ],
  },
];

const COMPETITIONS = [
  { place: '1st place', event: 'Salesforce Case Competition, NYU Product Management Club', date: 'Apr 2026', what: 'Decision Vault, a governance layer that routes risky AI agent actions to human approval.' },
  { place: '1st place', event: 'Product Case Competition, Ditto AI', date: 'Apr 2026', what: 'Drop Filler, a five-day post-match SMS concept with an A/B plan.' },
  { place: '2nd place', event: 'Intercollegiate PM Competition, NYU Product Management Club', date: 'Oct 2025', what: 'Awareness Mode, a digital wellness mode chosen from 20 interviews.' },
];

const PROJECTS = [
  { name: 'JobOS', dates: 'Sep 2026 – Present', what: 'A review-first application manager. In a guided test, eight students found 11 overdue follow-ups.', note: 'Private build' },
  { name: 'Mind Garden', dates: 'Feb 2026 – Present', what: 'A 3D journaling app. 300 sign-ups at launch; 29% still writing in their fourth week.', href: 'https://mindgardens.us/' },
  { name: 'GrowYourHabit', what: 'An iPhone-first habit tracker that turns daily logs into a growing forest.', href: 'https://ryanos.pages.dev/' },
  { name: 'Vocal Studio', what: 'A private browser studio that corrects pitch and timing and arranges a song around a vocal take.', href: 'https://vocal-studio.rm6886.workers.dev/' },
  { name: 'Pantry', what: 'A kitchen system that connects inventory, meal prep, nutrition and restocking.', href: 'https://pantry-demo.rm6886.workers.dev/' },
  { name: 'Rest.aurant', what: 'In stealth.', note: 'Coming later' },
];

const root = document.getElementById('work-page');
const scroller = root.querySelector('.work-scroll');
const stars = root.querySelector('.work-stars');
const homeButton = root.querySelector('.work-home');

/* ---------- Rendering ---------- */

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function entry({ title, sub, dates }) {
  const head = el('div', 'work-entry-head');
  const left = el('div');
  left.append(el('h4', 'work-entry-title', title));
  if (sub) left.append(el('p', 'work-entry-sub', sub));
  head.append(left);
  if (dates) head.append(el('p', 'work-entry-dates', dates));
  return head;
}

function render() {
  for (const link of root.querySelectorAll('.work-resume-link')) link.href = RESUME_URL;

  const experience = root.querySelector('.work-experience');
  for (const job of EXPERIENCE) {
    const li = el('li', 'work-entry');
    const points = el('ul', 'work-points');
    for (const p of job.points) {
      const item = el('li');
      item.innerHTML = p; // trusted, static copy with <strong> highlights
      points.append(item);
    }
    li.append(entry({ title: job.org, sub: job.role, dates: job.dates }), points);
    experience.append(li);
  }

  const competitions = root.querySelector('.work-competitions');
  for (const c of COMPETITIONS) {
    const li = el('li', 'work-entry');
    li.append(entry({ title: c.place, sub: c.event, dates: c.date }), el('p', 'work-entry-text', c.what));
    competitions.append(li);
  }

  const projects = root.querySelector('.work-projects');
  for (const p of PROJECTS) {
    const li = el('li', 'work-entry');
    const head = entry({ title: p.name, dates: p.dates });
    li.append(head, el('p', 'work-entry-text', p.what));
    if (p.href) {
      const a = el('a', 'work-entry-link', 'Visit');
      a.href = p.href;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.setAttribute('aria-label', `Visit ${p.name} (opens in a new tab)`);
      li.append(a);
    } else {
      li.append(el('p', 'work-entry-note', p.note));
    }
    projects.append(li);
  }

  // In-page links scroll the page instead of changing the URL.
  for (const a of root.querySelectorAll('.work-contents a[href^="#"]')) {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      root.querySelector(a.getAttribute('href'))?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
    });
  }
}

/* ---------- A few faint stars behind the page ---------- */

function starfield() {
  const ctx = stars.getContext('2d');
  let points = [];
  let w = 0;
  let h = 0;
  function build() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    w = innerWidth;
    h = innerHeight;
    stars.width = Math.round(w * dpr);
    stars.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    points = Array.from({ length: Math.round((w * h) / 9000) }, () => ({
      x: Math.random() * w,
      y: Math.random() * h * 2,
      r: 0.3 + Math.random() * 0.6,
      a: 0.1 + Math.random() * 0.35,
      depth: 0.03 + Math.random() * 0.12,
    }));
  }
  let lastScroll = -1;
  function draw() {
    const scroll = scroller.scrollTop;
    if (scroll === lastScroll) return;
    lastScroll = scroll;
    ctx.clearRect(0, 0, w, h);
    for (const p of points) {
      const y = (((p.y - scroll * p.depth) % (h * 2)) + h * 2) % (h * 2);
      if (y > h) continue;
      ctx.fillStyle = `rgba(230, 228, 222, ${p.a})`;
      ctx.beginPath();
      ctx.arc(p.x, y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return {
    build() {
      build();
      lastScroll = -1;
    },
    draw,
  };
}

/* ---------- Opening and closing ---------- */

let reducedMotion = false;
let built = false;
let field = null;
let raf = 0;

export function openWork({ reduced = false, onLeave }) {
  reducedMotion = reduced;
  if (!built) {
    render();
    field = starfield();
    built = true;
  }
  field.build();
  root.classList.remove('is-revealed', 'is-leaving');
  root.hidden = false;
  scroller.scrollTop = 0;
  document.body.classList.add('work-open');

  const loop = () => {
    field.draw();
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  const onResize = () => field.build();
  window.addEventListener('resize', onResize);

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    root.classList.add('is-leaving');
    root.classList.remove('is-revealed');
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', onResize);
    onLeave?.();
    setTimeout(
      () => {
        cancelAnimationFrame(raf);
        root.hidden = true;
        root.classList.remove('is-leaving');
        document.body.classList.remove('work-open');
      },
      reduced ? 0 : 600,
    );
  }
  const onKey = (e) => {
    if (e.key === 'Escape') close();
  };
  window.addEventListener('keydown', onKey);
  homeButton.onclick = close;

  return {
    reveal() {
      requestAnimationFrame(() => root.classList.add('is-revealed'));
      root.querySelector('.work-title').focus({ preventScroll: true });
    },
  };
}
