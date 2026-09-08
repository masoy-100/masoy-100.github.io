// Visual layer: starfield, cursor glow, nav tracking, reveals, tilt, hero pulse, DSS demo, copy email.
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  // Starfield with scroll parallax
  const cv = $('#stars'), cx = cv.getContext('2d');
  let W, H, stars = [], scrollY = 0;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  function seed() {
    W = cv.width = innerWidth * dpr; H = cv.height = innerHeight * dpr;
    const n = Math.min(360, Math.floor(W * H / 8000));
    stars = Array.from({ length: n }, () => ({
      x: Math.random() * W, y: Math.random() * H * 1.4,
      z: Math.random(), // depth: far stars move less
      r: (Math.random() ** 2) * 1.6 * dpr + .3,
      a: .25 + Math.random() * .7, p: Math.random() * 6.28,
    }));
  }
  function draw(t) {
    cx.clearRect(0, 0, W, H);
    for (const s of stars) {
      const py = (s.y - scrollY * dpr * (0.05 + s.z * 0.25)) % (H * 1.4);
      const y = py < 0 ? py + H * 1.4 : py;
      const tw = reduce ? 1 : (.75 + .25 * Math.sin(t * .0012 + s.p));
      cx.globalAlpha = s.a * tw;
      cx.fillStyle = s.r > 1.4 * dpr ? '#DCEBFF' : '#FFFFFF';
      cx.beginPath(); cx.arc(s.x, y, s.r, 0, 6.28); cx.fill();
      if (!reduce) { s.y -= (.02 + s.z * .06) * dpr; }
    }
    cx.globalAlpha = 1;
    if (!reduce) requestAnimationFrame(draw);
  }
  seed(); requestAnimationFrame(draw);
  addEventListener('resize', () => { seed(); if (reduce) draw(0); });
  addEventListener('scroll', () => { scrollY = window.scrollY; if (reduce) draw(0); }, { passive: true });

  // Cursor glow (pointer devices only)
  const glow = $('#cursorGlow');
  if (matchMedia('(pointer:fine)').matches && !reduce) {
    let tx = 0, ty = 0, x = 0, y = 0;
    addEventListener('pointermove', e => { tx = e.clientX; ty = e.clientY; glow.style.opacity = 1; });
    addEventListener('pointerleave', () => glow.style.opacity = 0);
    (function follow() { x += (tx - x) * .12; y += (ty - y) * .12; glow.style.transform = `translate(${x}px,${y}px)`; requestAnimationFrame(follow); })();
  }

  // Active nav link
  const links = $$('.topnav a');
  const io = new IntersectionObserver(es => {
    es.forEach(e => { if (e.isIntersecting) links.forEach(a => a.classList.toggle('active', a.dataset.nav === e.target.id)); });
  }, { rootMargin: '-40% 0px -55% 0px' });
  $$('main section[id]').forEach(s => io.observe(s));

  // Section reveals
  const ro = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); ro.unobserve(e.target); } }), { threshold: .08 });
  $$('.reveal').forEach(el => ro.observe(el));

  // Subtle tilt on project blocks
  if (matchMedia('(pointer:fine)').matches && !reduce) {
    $$('.tilt').forEach(el => {
      el.addEventListener('pointermove', e => {
        const r = el.getBoundingClientRect();
        const dx = (e.clientX - r.left) / r.width - .5, dy = (e.clientY - r.top) / r.height - .5;
        el.style.transform = `perspective(1400px) rotateX(${-dy * 1.2}deg) rotateY(${dx * 1.2}deg)`;
      });
      el.addEventListener('pointerleave', () => el.style.transform = '');
    });
  }

  // Hero pipeline pulse on load, then every 12s
  const nodes = $$('#heroFlow .node');
  function pulse() {
    nodes.forEach((n, i) => {
      setTimeout(() => n.classList.add('on'), i * 170);
      setTimeout(() => n.classList.remove('on'), i * 170 + 750);
    });
  }
  if (!reduce) { setTimeout(pulse, 400); setInterval(pulse, 12000); }

  // DSS scoring demo. Illustrative listings, not live dealer data.
  const listings = [
    { name: '1 oz Maple',  premium: .061, liquidity: .9, dealer: .85 },
    { name: '10 oz bar',   premium: .044, liquidity: .7, dealer: .8 },
    { name: '1 oz Eagle',  premium: .118, liquidity: .95, dealer: .9 },
    { name: '90% junk',    premium: .032, liquidity: .6, dealer: .7 },
    { name: '1 kg bar',    premium: .029, liquidity: .45, dealer: .75 },
  ];
  const out = $('#dssOut');
  function renderDSS() {
    const w = {}; $$('.dss input').forEach(i => w[i.dataset.w] = +i.value / 100);
    const total = (w.premium + w.liquidity + w.dealer) || 1;
    const scored = listings.map(l => ({ ...l, s: (w.premium * (1 - l.premium * 6) + w.liquidity * l.liquidity + w.dealer * l.dealer) / total }))
      .sort((a, b) => b.s - a.s);
    const max = scored[0].s;
    out.innerHTML = scored.map(l =>
      `<span>${l.name}</span><div class="bar"><i style="width:${Math.max(8, l.s / max * 100)}%"></i></div><span class="v">+${(l.premium * 100).toFixed(1)}%</span>`).join('');
  }
  $$('.dss input').forEach(i => i.addEventListener('input', renderDSS));
  renderDSS();

  // Copy email
  const btn = $('#copyBtn');
  btn.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(SITE_CONFIG.email); btn.textContent = 'Copied'; }
    catch { btn.textContent = SITE_CONFIG.email; }
    setTimeout(() => btn.textContent = 'Copy email', 1800);
  });
})();
