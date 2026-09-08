// Market data layer: fetch, cache, compute stats, render charts.
(() => {
  const C = window.SITE_CONFIG;
  const $ = s => document.querySelector(s);
  const fmtUSD = n => n >= 1000 ? '$' + n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '$' + n.toFixed(2);
  const pct = n => (n >= 0 ? '+' : '') + (n * 100).toFixed(1) + '%';
  const cls = n => n >= 0 ? 'up' : 'down';

  Chart.defaults.color = '#93A0B8';
  Chart.defaults.font.family = "'JetBrains Mono', monospace";
  Chart.defaults.font.size = 11;
  const grid = { color: 'rgba(180,196,224,.08)' };
  const charts = {};

  // Cache in sessionStorage for 10 minutes so reloads don't hammer the APIs.
  async function cached(key, fn) {
    try {
      const hit = JSON.parse(sessionStorage.getItem(key) || 'null');
      if (hit && Date.now() - hit.t < 6e5) return hit.v;
    } catch {}
    const v = await fn();
    try { sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), v })); } catch {}
    return v;
  }

  // Stats
  const returns = p => p.slice(1).map((v, i) => v / p[i] - 1);
  const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
  const std = a => { const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) ** 2))); };
  const corr = (a, b) => { const n = Math.min(a.length, b.length); a = a.slice(-n); b = b.slice(-n); const ma = mean(a), mb = mean(b);
    return a.reduce((s, x, i) => s + (x - ma) * (b[i] - mb), 0) / (n * std(a) * std(b)); };
  const drawdown = p => { let hi = -Infinity; return p.map(v => { hi = Math.max(hi, v); return (v / hi - 1) * 100; }); };
  const indexed = p => p.map(v => v / p[0] * 100);
  const maxDD = p => Math.min(...drawdown(p)) / 100;

  // Deterministic sample series (used only when live data is unavailable).
  function sample(seed, start, drift, vol, n) {
    let s = seed, p = start; const out = [];
    const rnd = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296 - .5; };
    for (let i = 0; i < n; i++) { p *= 1 + drift + rnd() * vol; out.push(p); }
    return out;
  }
  const dates = n => Array.from({ length: n }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (n - 1 - i)); return d.toISOString().slice(5, 10); });

  // Crypto from CoinGecko
  async function fetchCrypto(days) {
    return cached(`cg-${days}`, async () => {
      const out = {};
      for (const c of C.crypto) {
        const r = await fetch(`https://api.coingecko.com/api/v3/coins/${c.id}/market_chart?vs_currency=usd&days=${days}&interval=daily`);
        if (!r.ok) throw new Error('coingecko ' + r.status);
        const j = await r.json();
        out[c.symbol] = j.prices.map(p => p[1]).slice(-days);
      }
      return out;
    });
  }

  // ETFs from Alpha Vantage (needs key), else sample
  async function fetchETF(days) {
    if (!C.alphaVantageKey) return { data: null, live: false };
    return cached(`av-${days}`, async () => {
      const out = {};
      for (const e of C.etfs) {
        const r = await fetch(`https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${e.symbol}&apikey=${C.alphaVantageKey}`);
        const j = await r.json(); const ts = j['Time Series (Daily)'];
        if (!ts) throw new Error('alphavantage limit');
        out[e.symbol] = Object.keys(ts).sort().slice(-days).map(k => +ts[k]['4. close']);
      }
      return { data: out, live: true };
    });
  }

  function lineChart(id, labels, series, opts = {}) {
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart($(id), {
      type: 'line',
      data: { labels, datasets: series.map(s => ({ label: s.label, data: s.data, borderColor: s.color, borderWidth: 1.8, pointRadius: 0, tension: .25,
        fill: s.fill || false, backgroundColor: s.bg || 'transparent' })) },
      options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        plugins: { legend: { display: true, labels: { boxWidth: 10, boxHeight: 2 } }, tooltip: { backgroundColor: 'rgba(11,16,32,.95)', borderColor: 'rgba(180,196,224,.2)', borderWidth: 1,
          callbacks: { label: c => ` ${c.dataset.label}: ${opts.fmt ? opts.fmt(c.parsed.y) : c.parsed.y.toFixed(1)}` } } },
        scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } }, y: { grid, ticks: { callback: v => opts.tick ? opts.tick(v) : v } } } }
    });
  }

  function cards(el, syms, data, colors) {
    el.innerHTML = syms.map((s, i) => {
      const p = data[s], r = returns(p);
      return `<div class="card"><div class="sym">${s}</div><div class="px">${fmtUSD(p.at(-1))}</div>
        <div class="stats"><span class="${cls(p.at(-1)/p[0]-1)}">${pct(p.at(-1)/p[0]-1)} period</span>
        <span>vol ${(std(r)*Math.sqrt(365)*100).toFixed(0)}%</span><span>dd ${(maxDD(p)*100).toFixed(0)}%</span></div></div>`;
    }).join('');
  }

  function histogram(id, data) {
    if (charts[id]) charts[id].destroy();
    const bins = Array.from({ length: 13 }, (_, i) => -6 + i); // -6%..+6%
    const sets = Object.entries(data).map(([sym, r], i) => {
      const counts = bins.map(() => 0);
      r.forEach(x => { const b = Math.min(12, Math.max(0, Math.round(x * 100) + 6)); counts[b]++; });
      return { label: sym, data: counts, backgroundColor: C.crypto[i].color + (i ? 'AA' : '66'), borderRadius: 3 };
    });
    charts[id] = new Chart($(id), { type: 'bar', data: { labels: bins.map(b => b + '%'), datasets: sets },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { boxWidth: 10 } } },
        scales: { x: { grid: { display: false } }, y: { grid, title: { display: true, text: 'days' } } } } });
  }

  function ticker(crypto, etf) {
    const items = [];
    for (const s in crypto) { const p = crypto[s]; const d = p.at(-1) / p.at(-2) - 1; items.push(`<span class="tick"><b>${s}</b> ${fmtUSD(p.at(-1))} <span class="${cls(d)}">${pct(d)}</span></span>`); }
    if (etf) for (const s in etf) { const p = etf[s]; const d = p.at(-1) / p.at(-2) - 1; items.push(`<span class="tick"><b>${s}</b> ${fmtUSD(p.at(-1))} <span class="${cls(d)}">${pct(d)}</span></span>`); }
    const html = items.join('');
    $('#ticker').innerHTML = html + html; // duplicate for seamless loop
  }

  async function render(days) {
    const labels = dates(days);
    let crypto, live = true;
    try { crypto = await fetchCrypto(days); }
    catch (e) { live = false; crypto = { BTC: sample(7, 60000, .0006, .04, days), SOL: sample(11, 140, .0008, .07, days) }; }
    $('#cryptoSrc').textContent = live ? 'crypto: live via CoinGecko' : 'crypto: sample data (API unavailable)';

    const syms = C.crypto.map(c => c.symbol), colors = C.crypto.map(c => c.color);
    cards($('#cryptoCards'), syms, crypto, colors);
    lineChart('#cryptoChart', labels, syms.map((s, i) => ({ label: s, data: indexed(crypto[s]), color: colors[i] })));
    histogram('#volChart', Object.fromEntries(syms.map(s => [s, returns(crypto[s])])));
    lineChart('#ddChart', labels, syms.map((s, i) => ({ label: s, data: drawdown(crypto[s]), color: colors[i], fill: true, bg: colors[i] + '18' })), { tick: v => v + '%', fmt: v => v.toFixed(1) + '%' });

    let etf = null, etfLive = false;
    try { const r = await fetchETF(days); etf = r.data; etfLive = r.live; } catch {}
    if (!etf) etf = { SPY: sample(3, 560, .0004, .009, days), QQQ: sample(5, 490, .0005, .012, days), GLD: sample(9, 250, .0003, .008, days) };
    $('#etfSrc').textContent = etfLive ? 'etf: live via Alpha Vantage' : 'etf: sample data (add a key in js/config.js for live)';
    const esyms = C.etfs.map(e => e.symbol), ecolors = C.etfs.map(e => e.color);
    cards($('#etfCards'), esyms, etf, ecolors);
    lineChart('#etfChart', labels, esyms.map((s, i) => ({ label: s, data: indexed(etf[s]), color: ecolors[i] })));

    const rb = returns(crypto.BTC), rs = returns(crypto.SOL), rq = returns(etf.QQQ), rg = returns(etf.GLD);
    $('#corrBox').innerHTML = `<span>BTC/SOL correlation <b>${corr(rb, rs).toFixed(2)}</b></span>
      <span>BTC/QQQ <b>${corr(rb, rq).toFixed(2)}</b></span><span>BTC/GLD <b>${corr(rb, rg).toFixed(2)}</b></span>
      <span>${days}d window, daily returns</span>`;
    ticker(crypto, etf);
  }

  document.querySelectorAll('.seg button').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('.seg button').forEach(x => x.classList.remove('on')); b.classList.add('on'); render(+b.dataset.days);
  }));
  render(30);
})();
