// BTC / SOL regime model: fetch, compute, classify, chart.
(() => {
  const C = window.SITE_CONFIG, R = C.regime;
  const $ = s => document.querySelector(s);
  const fmtUSD = n => n >= 1000 ? '$' + n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '$' + n.toFixed(2);
  const pct = n => (n >= 0 ? '+' : '') + (n * 100).toFixed(1) + '%';
  const cls = n => n >= 0 ? 'up' : 'down';

  Chart.defaults.color = '#93A0B8'; Chart.defaults.font.family = "'JetBrains Mono', monospace"; Chart.defaults.font.size = 11;
  const grid = { color: 'rgba(180,196,224,.08)' }, charts = {};

  async function cached(key, fn) {
    try { const h = JSON.parse(sessionStorage.getItem(key) || 'null'); if (h && Date.now() - h.t < 6e5) return h.v; } catch {}
    const v = await fn(); try { sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), v })); } catch {} return v;
  }
  const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
  const std = a => { const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) ** 2))); };
  const median = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  const rets = p => p.slice(1).map((v, i) => Math.log(v / p[i]));
  const corr = (a, b) => { const n = Math.min(a.length, b.length); a = a.slice(-n); b = b.slice(-n); const ma = mean(a), mb = mean(b);
    return a.reduce((s, x, i) => s + (x - ma) * (b[i] - mb), 0) / (n * std(a) * std(b)); };
  const drawdown = p => { let hi = -Infinity; return p.map(v => { hi = Math.max(hi, v); return (v / hi - 1) * 100; }); };
  const indexed = p => p.map(v => v / p[0] * 100);
  const rollVol = (r, w) => r.map((_, i) => i + 1 < w ? null : std(r.slice(i + 1 - w, i + 1)) * Math.sqrt(365) * 100);

  function regime(p) {
    const r = rets(p), vol = rollVol(r, R.volWindow).filter(v => v != null);
    const v = vol.at(-1), vmed = median(vol);
    const mom = p.at(-1) / p.at(-1 - R.momentumDays) - 1;
    const dd = drawdown(p).at(-1) / 100;
    let tag = 'chop';
    if (dd < -R.stressDrawdown && v > vmed) tag = 'stress';
    else if (mom > 0 && v <= vmed) tag = 'trend';
    return { tag, mom, vol: v, dd, vmed };
  }

  function sample(seed, start, drift, vol, n) { let s = seed, p = start; const o = [];
    const rnd = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296 - .5; };
    for (let i = 0; i < n; i++) { p *= 1 + drift + rnd() * vol; o.push(p); } return o; }
  const dates = n => Array.from({ length: n }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (n - 1 - i)); return d.toISOString().slice(5, 10); });

  async function fetchCrypto(days) {
    return cached(`cg-${days}`, async () => {
      const out = {};
      for (const c of C.crypto) {
        const r = await fetch(`https://api.coingecko.com/api/v3/coins/${c.id}/market_chart?vs_currency=usd&days=${days}&interval=daily`);
        if (!r.ok) throw new Error(r.status);
        out[c.symbol] = (await r.json()).prices.map(p => p[1]).slice(-days);
      }
      return out;
    });
  }

  function line(id, labels, series, opts = {}) {
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart($(id), { type: 'line',
      data: { labels, datasets: series.map(s => ({ label: s.label, data: s.data, borderColor: s.color, borderWidth: 1.7, pointRadius: 0, tension: .3, spanGaps: true, fill: !!s.fill, backgroundColor: s.fill ? s.color + '18' : 'transparent' })) },
      options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        plugins: { legend: { labels: { boxWidth: 10, boxHeight: 2 } }, tooltip: { backgroundColor: 'rgba(4,7,14,.95)', borderColor: 'rgba(180,196,224,.2)', borderWidth: 1,
          callbacks: { label: c => ` ${c.dataset.label}: ${c.parsed.y.toFixed(1)}${opts.unit || ''}` } } },
        scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } }, y: { grid, ticks: { callback: v => v + (opts.unit || '') } } } } });
  }

  async function render(days) {
    const labels = dates(days);
    let data, live = true;
    try { data = await fetchCrypto(days + R.volWindow); }
    catch { live = false; data = { BTC: sample(7, 60000, .0006, .04, days + R.volWindow), SOL: sample(11, 140, .0008, .07, days + R.volWindow) }; }
    $('#src').textContent = live ? 'live via CoinGecko, cached 10 min' : 'sample data (API unavailable)';
    const syms = C.crypto.map(c => c.symbol), colors = C.crypto.map(c => c.color);
    const win = Object.fromEntries(syms.map(s => [s, data[s].slice(-days)]));

    $('#regimes').innerHTML = syms.map(s => { const p = data[s], g = regime(p), per = win[s].at(-1) / win[s][0] - 1;
      return `<div class="reg"><div class="sym">${s}</div><div class="px chrome">${fmtUSD(p.at(-1))}</div>
        <span class="tag ${g.tag}">${g.tag}</span>
        <div class="stats"><span class="${cls(per)}">${pct(per)} ${days}d</span><span>mom ${pct(g.mom)}</span><span>vol ${g.vol.toFixed(0)}%</span><span>dd ${(g.dd * 100).toFixed(0)}%</span></div></div>`; }).join('');

    line('#idxChart', labels, syms.map((s, i) => ({ label: s, data: indexed(win[s]), color: colors[i] })));
    line('#volChart', labels, syms.map((s, i) => ({ label: s, data: rollVol(rets(data[s]), R.volWindow).slice(-days), color: colors[i] })), { unit: '%' });
    line('#ddChart', labels, syms.map((s, i) => ({ label: s, data: drawdown(win[s]), color: colors[i], fill: true })), { unit: '%' });

    const rb = rets(win.BTC), rs = rets(win.SOL);
    $('#corr').innerHTML = `BTC / SOL daily return correlation <b>${corr(rb, rs).toFixed(2)}</b><br>SOL beta to BTC <b>${(corr(rb, rs) * std(rs) / std(rb)).toFixed(2)}</b><br>window <b>${days} days</b>`;
  }
  document.querySelectorAll('.seg button').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('.seg button').forEach(x => x.classList.remove('on')); b.classList.add('on'); render(+b.dataset.days); }));
  render(30);
})();
