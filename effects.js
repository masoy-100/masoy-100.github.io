// Visual layer: stars, mountain parallax, water, stream charts, reveals, DSS demo.
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const dpr = Math.min(devicePixelRatio || 1, 2);

  // Stars
  const sc = $('#stars'), sx = sc.getContext('2d');
  let W, H, stars = [];
  function seed() {
    W = sc.width = innerWidth * dpr; H = sc.height = innerHeight * dpr;
    stars = Array.from({ length: Math.min(340, Math.floor(W * H / 8500)) }, () => ({
      x: Math.random() * W, y: Math.random() * H, z: Math.random(),
      r: (Math.random() ** 2) * 1.5 * dpr + .3, a: .2 + Math.random() * .7, p: Math.random() * 6.28 }));
  }
  function drawStars(t) {
    sx.clearRect(0, 0, W, H);
    const sy = scrollY * dpr;
    for (const s of stars) {
      let y = (s.y - sy * (0.04 + s.z * .2)) % H; if (y < 0) y += H;
      sx.globalAlpha = s.a * (reduce ? 1 : .75 + .25 * Math.sin(t * .0012 + s.p));
      sx.fillStyle = s.r > 1.3 * dpr ? '#DCEBFF' : '#fff';
      sx.beginPath(); sx.arc(s.x, y, s.r, 0, 6.28); sx.fill();
    }
    sx.globalAlpha = 1;
  }

  // Water: layered sine waves with star-like glints, drawn at the hero base
  const wc = $('#water'), wx = wc.getContext('2d');
  let WW, WH;
  function sizeWater() { WW = wc.width = wc.offsetWidth * dpr; WH = wc.height = wc.offsetHeight * dpr; }
  const layers = [
    { amp: 6, len: 420, speed: .00035, y: .18, col: 'rgba(59,130,196,.28)' },
    { amp: 9, len: 300, speed: .00055, y: .30, col: 'rgba(59,130,196,.36)' },
    { amp: 7, len: 210, speed: .0008, y: .44, col: 'rgba(30,70,120,.55)' },
    { amp: 5, len: 150, speed: .0011, y: .60, col: 'rgba(10,25,50,.85)' },
  ];
  function drawWater(t) {
    wx.clearRect(0, 0, WW, WH);
    const g = wx.createLinearGradient(0, 0, 0, WH); g.addColorStop(0, 'rgba(125,211,252,.10)'); g.addColorStop(1, 'rgba(4,7,14,1)');
    wx.fillStyle = g; wx.fillRect(0, 0, WW, WH);
    layers.forEach((L, i) => {
      wx.beginPath(); wx.moveTo(0, WH);
      for (let x = 0; x <= WW; x += 4 * dpr) {
        const y = WH * L.y + Math.sin(x / (L.len * dpr) * 6.28 + t * L.speed * (i % 2 ? -1 : 1)) * L.amp * dpr
                + Math.sin(x / (L.len * .37 * dpr) * 6.28 - t * L.speed * 1.7) * L.amp * .4 * dpr;
        wx.lineTo(x, y);
      }
      wx.lineTo(WW, WH); wx.closePath(); wx.fillStyle = L.col; wx.fill();
    });
    // glints
    wx.fillStyle = 'rgba(255,255,255,.35)';
    for (let i = 0; i < 26; i++) {
      const x = ((i * 137.5 + t * .02 * (i % 3 + 1)) % WW), y = WH * (.2 + ((i * 53) % 40) / 100);
      const a = .5 + .5 * Math.sin(t * .002 + i);
      wx.globalAlpha = a * .5; wx.fillRect(x, y, 6 * dpr, 1 * dpr);
    }
    wx.globalAlpha = 1;
  }

  // Mountain parallax
  const far = $('.mtn.far'), mid = $('.mtn.mid'), near = $('.mtn.near');
  function parallax() {
    const y = Math.min(scrollY, innerHeight);
    far.style.transform = `translateY(${y * .28}px)`;
    mid.style.transform = `translateY(${y * .16}px)`;
    near.style.transform = `translateY(${y * .06}px)`;
  }

  function frame(t) { drawStars(t); drawWater(t); if (!reduce) requestAnimationFrame(frame); }
  function init() { seed(); sizeWater(); parallax(); frame(0); if (!reduce) requestAnimationFrame(frame); }
  init();
  addEventListener('resize', () => { seed(); sizeWater(); buildStreams(); if (reduce) frame(0); });
  addEventListener('scroll', () => { if (!reduce) parallax(); }, { passive: true });

  // Streams: a winding river with stones for each stage and particles flowing downstream
  function buildStreams() {
    $$('.project').forEach(p => {
      const stages = p.dataset.stream.split('|').map(s => { const [a, b] = s.split(':'); return { a, b }; });
      const mobile = innerWidth < 640, n = stages.length;
      const Wd = mobile ? 360 : 1000, Hd = mobile ? n * 100 : 190;
      const pts = stages.map((s, i) => mobile
        ? { x: 180 + Math.sin(i * 1.9) * 70, y: 50 + i * 100 }
        : { x: 70 + i * ((Wd - 140) / (n - 1)), y: 95 + Math.sin(i * 1.7) * 42 });
      let d = `M ${mobile ? pts[0].x : -20} ${mobile ? -20 : pts[0].y}`;
      const all = mobile ? [{ x: pts[0].x, y: -20 }, ...pts, { x: pts[n - 1].x, y: Hd + 20 }] : [{ x: -20, y: pts[0].y }, ...pts, { x: Wd + 20, y: pts[n - 1].y }];
      for (let i = 0; i < all.length - 1; i++) {
        const a = all[i], b = all[i + 1];
        d += mobile ? ` C ${a.x} ${(a.y + b.y) / 2}, ${b.x} ${(a.y + b.y) / 2}, ${b.x} ${b.y}` : ` C ${(a.x + b.x) / 2} ${a.y}, ${(a.x + b.x) / 2} ${b.y}, ${b.x} ${b.y}`;
      }
      const particles = reduce ? '' : [0, .33, .66].map((o, i) =>
        `<circle class="p" r="${2.6 - i * .4}"><animateMotion dur="${7 + i * 1.5}s" begin="${-o * 7}s" repeatCount="indefinite" path="${d}"/></circle>`).join('');
      const stones = pts.map((q, i) => {
        const up = mobile ? false : Math.sin(i * 1.7) < 0;
        const ty = mobile ? q.y - 4 : (up ? q.y - 34 : q.y + 44), sy = ty + 14;
        const tx = mobile ? q.x + 22 : q.x, anchor = mobile ? 'start' : 'middle';
        return `<circle class="stone" cx="${q.x}" cy="${q.y}" r="7"/><circle cx="${q.x}" cy="${q.y}" r="2.2" fill="#7DD3FC"/>
          <text class="lbl" x="${tx}" y="${ty}" text-anchor="${anchor}">${stages[i].a}</text><text class="sub" x="${tx}" y="${sy}" text-anchor="${anchor}">${stages[i].b}</text>`;
      }).join('');
      $('.stream', p).innerHTML = `<svg viewBox="0 0 ${Wd} ${Hd}" aria-label="Architecture: ${stages.map(s => s.a).join(', ')}">
        <defs><linearGradient id="chromeStroke" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset=".5" stop-color="#7E8BA3"/><stop offset="1" stop-color="#F4F7FC"/></linearGradient></defs>
        <path class="bed" d="${d}"/><path class="bank" d="${d}"/><path class="cur" d="${d}"/><path class="cur2" d="${d}"/>${particles}${stones}</svg>`;
    });
  }
  buildStreams();

  // Reveal
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .06 });
  $$('.project').forEach(el => io.observe(el));

  // DSS demo (illustrative listings)
  const listings = [
    { name: '1 oz Maple', premium: .061, liquidity: .9, dealer: .85 },
    { name: '10 oz bar', premium: .044, liquidity: .7, dealer: .8 },
    { name: '1 oz Eagle', premium: .118, liquidity: .95, dealer: .9 },
    { name: '90% junk', premium: .032, liquidity: .6, dealer: .7 },
    { name: '1 kg bar', premium: .029, liquidity: .45, dealer: .75 },
  ];
  const out = $('#dssOut');
  function renderDSS() {
    const w = {}; $$('.dss input').forEach(i => w[i.dataset.w] = +i.value / 100);
    const tot = (w.premium + w.liquidity + w.dealer) || 1;
    const sc = listings.map(l => ({ ...l, s: (w.premium * (1 - l.premium * 6) + w.liquidity * l.liquidity + w.dealer * l.dealer) / tot })).sort((a, b) => b.s - a.s);
    out.innerHTML = sc.map(l => `<span>${l.name}</span><div class="bar"><i style="width:${Math.max(8, l.s / sc[0].s * 100)}%"></i></div><span class="v">+${(l.premium * 100).toFixed(1)}%</span>`).join('');
  }
  $$('.dss input').forEach(i => i.addEventListener('input', renderDSS));
  renderDSS();
})();
