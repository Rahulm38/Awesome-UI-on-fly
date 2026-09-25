/* Draws insight panels the way the app does: a white card — title, the chart,
 * one sentence, a quiet footer. It only draws: every money string arrives
 * formatted, and colour comes from the panel's colour slot.
 *   Charts.render(panel)          one card
 *   Charts.renderDeck(panels)     1–3 pages in one card, with dots
 *   Charts.logo(name, size)       a merchant's monogram logo              */
(function () {
  const D = window.NovaData;
  const ACCENT = '#015b7e', CAT = ['#0b78ae', '#d9622b', '#7b61d1', '#2e9e6e'], GREY = '#d3d3d3', INK2 = '#646464', INK3 = '#919191', GRID = '#e6e6e6';
  const color = s => (s === -1 ? GREY : s === 0 || s == null ? ACCENT : CAT[(s - 1) % 4]);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const W = 300;
  let uid = 0;

  // A logo mark per merchant: a simple drawn glyph on the brand's colour, like an app's merchant avatars.
  const G = {
    cup: 'M5 8h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5zM16 9h1.5a2.5 2.5 0 0 1 0 5H16M8 3.5v2M11 3.5v2',
    leaf: 'M5 19c0-8 6-13.5 14-14 0 9-5.5 14-13 14zM5 19l7.5-7.5',
    taco: 'M3 16a9 9 0 0 1 18 0zM7.5 12.5l1 1.5M12 10.5v2M16.5 12.5l-1 1.5',
    moon: 'M19 14.5A7.5 7.5 0 1 1 9.5 5a6 6 0 0 0 9.5 9.5z',
    car: 'M4 16v-3.5L6.5 7h11l2.5 5.5V16zM4 16v2.5M20 16v2.5M7.5 13h.01M16.5 13h.01',
    fuel: 'M5 20V5.5A1.5 1.5 0 0 1 6.5 4h5A1.5 1.5 0 0 1 13 5.5V20M4 20h10M13 9.5h2.5l2 2V17a1.5 1.5 0 0 0 3 0V9.5l-3-3M7 8h4',
    tram: 'M7 3.5h10a1 1 0 0 1 1 1V15a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4.5a1 1 0 0 1 1-1zM6 11h12M9 17l-2 3.5M15 17l2 3.5M9.5 14h.01M14.5 14h.01',
    cart: 'M3 4h2.5l2 10.5h10l2-7.5H6.2M9 19.5h.01M16.5 19.5h.01',
    basket: 'M4 9.5h16l-2 9.5H6zM8.5 9.5 12 4.5l3.5 5M9.5 13v3M14.5 13v3',
    box: 'M3.5 7.5 12 3.5l8.5 4v9L12 20.5l-8.5-4zM3.5 7.5 12 11.5l8.5-4M12 11.5v9',
    bag: 'M5 8h14l-1.2 12H6.2zM9 8a3 3 0 0 1 6 0',
    shirt: 'M8.5 3.5 3.5 6.5l2 4 2.5-1V20h8V9.5l2.5 1 2-4-5-3a3.5 3.5 0 0 1-7 0z',
    plane: 'M10.5 20.5 12 15l6.5-2.5a1.8 1.8 0 0 0-1.2-3.4L11 11.5 6 4.5 4 5.2l3 7.3-3.5 1.3-1.5-1.8-1.5.6 1.5 3.7 12-4.3',
    film: 'M4 5h16v14H4zM4 9h16M4 15h16M8.5 5v14M15.5 5v14',
    game: 'M7 9h10a4 4 0 0 1 0 8c-1.3 0-2-.8-2.6-1.5h-4.8C9 16.2 8.3 17 7 17a4 4 0 0 1 0-8zM8.5 11.5v3M7 13h3M15.5 12h.01M17 14h.01',
    plus: 'M12 5.5v13M5.5 12h13',
    home: 'M3.5 11 12 4l8.5 7M6 9.5V20h12V9.5M10 20v-5h4v5',
    sparkle: 'M12 3.5c.6 4.3 3.2 6.9 7.5 7.5-4.3.6-6.9 3.2-7.5 7.5-.6-4.3-3.2-6.9-7.5-7.5 4.3-.6 6.9-3.2 7.5-7.5z',
    paw: 'M12 20c-2.8 0-5-1.6-5-3.8C7 13.8 9.3 12 12 12s5 1.8 5 4.2c0 2.2-2.2 3.8-5 3.8zM6 10.5a1.8 1.8 0 1 0 0-.01M10 6.5a1.8 1.8 0 1 0 0-.01M14 6.5a1.8 1.8 0 1 0 0-.01M18 10.5a1.8 1.8 0 1 0 0-.01',
    flower: 'M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 1 0 0-5M12 4a2.5 2.5 0 0 1 0 5.5M12 14.5a2.5 2.5 0 0 1 0 5.5M17.5 12a2.5 2.5 0 0 1-5.5 0M6.5 12a2.5 2.5 0 0 1 5.5 0',
    play: 'M8.5 5.5v13l10-6.5z',
    music: 'M9 17.5V6l10.5-2v11.5M9 17.5a2.3 2.3 0 1 1-4.6 0 2.3 2.3 0 0 1 4.6 0zM19.5 15.5a2.3 2.3 0 1 1-4.6 0 2.3 2.3 0 0 1 4.6 0z',
    cloud: 'M7 18.5a4.5 4.5 0 0 1-.4-9A6 6 0 0 1 18 9.5a4.5 4.5 0 0 1 .5 9z',
    dumbbell: 'M3.5 9.5v5M6.5 7v10M17.5 7v10M20.5 9.5v5M6.5 12h11',
    bolt: 'M13 2.5 4.5 13.5h7l-1 8 8.5-11h-7z',
    wifi: 'M4.5 11.5a10.5 10.5 0 0 1 15 0M8 15a5.5 5.5 0 0 1 8 0M12 18.5h.01M1.5 8a15 15 0 0 1 21 0',
    phone: 'M8 2.5h8a1.5 1.5 0 0 1 1.5 1.5v16a1.5 1.5 0 0 1-1.5 1.5H8A1.5 1.5 0 0 1 6.5 20V4A1.5 1.5 0 0 1 8 2.5zM11 18h2',
    book: 'M4.5 5.5A2 2 0 0 1 6.5 3.5H19v15H6.5a2 2 0 0 0-2 2zM4.5 20.5v-15M8 7.5h7',
  };
  const MARK = {
    'Brewline Coffee': 'cup', 'Greenleaf Bowls': 'leaf', 'Casa Taco': 'taco', 'Night Owl Diner': 'moon', 'Zipride': 'car', 'Fuelstop': 'fuel',
    'MetroPass Transit': 'tram', 'Harvest Market': 'cart', 'Corner Grocer': 'basket', 'Parcelhub': 'box', 'Northwind Store': 'bag',
    'Threadline Apparel': 'shirt', 'Skyline Air': 'plane', 'Starlight Cinemas': 'film', 'Arcade Nine': 'game', 'CareWell Pharmacy': 'plus',
    'Homestead Supply': 'home', 'Glow Studio': 'sparkle', 'Pawsome Pets': 'paw', 'Petal & Stem': 'flower', 'Streamly': 'play', 'Tuneloop': 'music',
    'CloudVault': 'cloud', 'Pulse Gym': 'dumbbell', 'Voltline Energy': 'bolt', 'Linkwave Internet': 'wifi', 'Tellio Mobile': 'phone', 'Brightpath Courses': 'book',
  };
  const logo = (name, size = 28) => {
    const l = D.logos[name] || { bg: '#eef2f4', fg: ACCENT }, g = G[MARK[name]];
    const mark = g ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="${g}"/></svg>` : esc((name || '?')[0]);
    return `<span class="logo" title="${esc(name)}" style="--s:${size}px;background:${l.bg};color:${l.fg}">${mark}</span>`;
  };
  // Columns are rounded at the data end only.
  const col = (x, y, w, h, r = 4) => h <= 0 ? '' : `M${x},${y + h}V${y + Math.min(r, h)}Q${x},${y} ${x + Math.min(r, w / 2)},${y}H${x + w - Math.min(r, w / 2)}Q${x + w},${y} ${x + w},${y + Math.min(r, h)}V${y + h}Z`;
  const hatch = (id, c) => `<pattern id="${id}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="${c}" opacity=".45"/><line x1="0" y1="0" x2="0" y2="6" stroke="#fff" stroke-width="1.5" opacity=".63"/></pattern>`;
  const legend = (items, cls = '') => `<div class="ic-legend ${cls}">${items.map(x => `<span><i style="background:${color(x.colorSlot)}"></i>${esc(x.label)}${x.value ? `<b>${esc(x.value)}</b>` : ''}</span>`).join('')}</div>`;

  const R = {
    // One number on the left, its recent path on the right.
    V1(p) {
      const v = p.series[0].points.map(x => x.amount), max = Math.max(...v, 1), w = 130, h = 64;
      const xy = v.map((a, i) => [4 + i * ((w - 8) / (v.length - 1)), 6 + (h - 14) * (1 - a / max)]);
      const d = xy.map((q, i) => (i ? 'L' : 'M') + q[0].toFixed(1) + ',' + q[1].toFixed(1)).join('');
      const [lx, ly] = xy[xy.length - 1];
      return `<div class="ic-v1"><b class="ic-hero">${esc(p.hero.display)}</b>
        <svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><line x1="4" x2="${w - 4}" y1="${h - 2}" y2="${h - 2}" stroke="${GRID}"/>
        <path class="draw" d="${d}" fill="none" stroke="${ACCENT}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${lx}" cy="${ly}" r="4" fill="${ACCENT}"/></svg></div>`;
    },
    // Ranked rows: label · bar · value right after the bar. Leader in the accent, the rest grey.
    V7(p) {
      const all = p.series[0].points, other = all.find(x => x.other), pts = all.filter(x => !x.other);
      const max = Math.max(...pts.map(x => x.amount), 1), anyLogo = pts.some(x => x.logo);
      return `<div class="ic-rank">${pts.map((x, i) => `<button class="ic-row${x.inside && x.inside.length ? ' tap' : ''}" data-i="${i}" ${x.inside && x.inside.length ? '' : 'disabled'}>
          <span class="ic-lab">${anyLogo ? logo(x.label, 22) : ''}<em>${esc(x.label)}</em></span>
          <span class="ic-track"><i class="grow-x" style="width:calc((100% - 70px) * ${Math.max(0.02, x.amount / max)});background:${color(x.colorSlot)};animation-delay:${i * 30}ms"></i><b>${esc(x.display)}</b></span>
        </button><div class="ic-inside" hidden>${(x.inside || []).map(t => `<div class="ic-tx">${logo(t.label, 26)}<div><b>${esc(t.label)}</b><small>${esc(t.when)}</small></div><strong>${esc(t.display)}</strong></div>`).join('')}</div>`).join('')}${other ? `<div class="ic-other">+ ${other.count || 'the'} other${other.count === 1 ? '' : 's'} <b>${esc(other.display)}</b></div>` : ''}</div>`;
    },
    // Face-off: two bars from a shared axis; a period still in progress is hatched.
    V2(p) {
      const pts = p.series[0].points, max = Math.max(...pts.map(x => x.amount), 1);
      return `<div class="ic-face${p.partial ? ' partial' : ''}">${pts.map((x, i) => `<div class="ic-frow"><em>${esc(x.label)}</em>
        <span class="ic-track"><i class="grow-x" style="width:calc((100% - 70px) * ${Math.max(0.02, x.amount / max)});--c:${x.colorSlot === -1 ? GREY : ACCENT};animation-delay:${i * 60}ms"></i><b>${esc(x.display)}</b></span></div>`).join('')}</div>`;
    },
    // Columns: only the latest labelled; the period in progress hatched; a usual line when there's history.
    V3(p) {
      const pts = p.series[0].points, H = 120, top = 20, gut = p.band ? 34 : 0, n = pts.length, id = 'h' + ++uid;
      const max = Math.max(...pts.map(x => x.amount), p.band ? p.band.high : 0, 1) * 1.06, y = v => top + (H - top) * (1 - v / max);
      const cw = (W - gut) / n, bw = Math.min(40, cw * 0.72), every = n > 7 ? 2 : 1;
      let s = `<svg viewBox="0 0 ${W} ${H + 20}"><defs>${hatch(id, ACCENT)}</defs><line x1="0" x2="${W - gut}" y1="${H}" y2="${H}" stroke="${GRID}"/>`;
      if (p.band) {
        if (y(p.band.low) - y(p.band.high) > 2) s += `<rect x="0" width="${W - gut}" y="${y(p.band.high)}" height="${y(p.band.low) - y(p.band.high)}" fill="${ACCENT}" opacity=".07"/>`;
        s += `<line x1="0" x2="${W - gut + 2}" y1="${y(p.band.median)}" y2="${y(p.band.median)}" stroke="${INK3}" stroke-opacity=".6"/><text x="${W - gut + 5}" y="${y(p.band.median) + 3.5}" font-size="10" fill="${INK3}">usual</text>`;
      }
      pts.forEach((x, i) => {
        const cx = i * cw + (cw - bw) / 2, h = x.amount > 0 ? Math.max(2, H - y(x.amount)) : 0, last = i === n - 1;
        s += `<path class="grow" style="animation-delay:${i * 22}ms" d="${col(cx, H - h, bw, h)}" fill="${x.partial ? `url(#${id})` : ACCENT}"/>`;
        if (last && x.amount > 0) s += `<text x="${cx + bw / 2}" y="${H - h - 6}" font-size="12" font-weight="600" fill="#222" text-anchor="middle">${esc(x.display)}</text>`;
        if (i % every === (n - 1) % every) s += `<text x="${cx + bw / 2}" y="${H + 15}" font-size="11" fill="${INK2}" text-anchor="middle">${esc(x.label)}</text>`;
      });
      return s + '</svg>';
    },
    // One 100% bar split by card or by debit/credit.
    V5(p) {
      const pts = p.series[0].points;
      return `<div class="ic-split">${pts.map((x, i) => `<i class="grow-x" style="flex:${Math.max(x.share, .02)};background:${color(x.colorSlot)};animation-delay:${i * 60}ms"></i>`).join('')}</div>
        ${legend(pts.map(x => ({ label: x.label, value: x.display, colorSlot: x.colorSlot })), 'row')}`;
    },
    // Stacked columns over time, one colour per card (or per debit/credit), legend on the right.
    V6(p) {
      const S = p.series, n = S[0] ? S[0].points.length : 0, H = 120, top = 8, legendW = 92, cw = (W - legendW) / Math.max(n, 1), bw = Math.min(34, cw * 0.62);
      const tot = i => S.reduce((a, s) => a + s.points[i].amount, 0), max = Math.max(...Array.from({ length: n }, (_, i) => tot(i)), 1) * 1.04;
      let defs = '', s = '';
      S.forEach((ser, k) => { defs += hatch('h' + ++uid, color(ser.colorSlot)); ser.hid = 'h' + uid; });
      for (let i = 0; i < n; i++) {
        let yb = H; const cx = i * cw + (cw - bw) / 2;
        S.forEach((ser, k) => {
          const a = ser.points[i].amount; if (a <= 0) return;
          const h = Math.max(2, (H - top) * a / max), isTop = S.slice(k + 1).every(o => o.points[i].amount <= 0);
          s += `<path class="grow" style="animation-delay:${i * 40 + k * 20}ms" d="${isTop ? col(cx, yb - h, bw, h - 1) : `M${cx},${yb - h}h${bw}v${h - 1.5}h${-bw}Z`}" fill="${ser.points[i].partial ? `url(#${ser.hid})` : color(ser.colorSlot)}"/>`;
          yb -= h;
        });
        s += `<text x="${cx + bw / 2}" y="${H + 15}" font-size="11" fill="${INK2}" text-anchor="middle">${esc(S[0].points[i].label)}</text>`;
      }
      return `<div class="ic-v6"><svg viewBox="0 0 ${W - legendW} ${H + 20}"><defs>${defs}</defs><line x1="0" x2="${W - legendW}" y1="${H}" y2="${H}" stroke="${GRID}"/>${s}</svg>
        ${legend([...S].reverse().map(x => ({ label: x.label, colorSlot: x.colorSlot })), 'col')}</div>`;
    },
    // Donut with the total inside; legend with shares.
    V8(p) {
      const pts = p.series[0].points, tot = pts.reduce((n, x) => n + x.amount, 0) || 1, r = 44, C = 2 * Math.PI * r;
      let off = 0, arcs = '';
      pts.forEach((x, i) => { const len = x.amount / tot * C; arcs += `<circle r="${r}" cx="60" cy="60" fill="none" stroke="${color(x.colorSlot)}" stroke-width="20" stroke-dasharray="${Math.max(0, len - 2)} ${C}" stroke-dashoffset="${-off}" transform="rotate(-90 60 60)" class="arc" style="animation-delay:${i * 60}ms"/>`; off += len; });
      return `<div class="ic-donut"><svg viewBox="0 0 120 120" width="112" height="112">${arcs}<text x="60" y="65" font-size="14" font-weight="600" fill="#222" text-anchor="middle">${esc(p.hero.display)}</text></svg>
        <div class="ic-legend col">${pts.map(x => `<span class="${x.label === p.focus ? 'focus' : ''}"><i style="background:${color(x.colorSlot)}"></i>${esc(x.label)}<b>${esc(x.pct || x.display)}</b></span>`).join('')}</div></div>`;
    },
    V9(p) {
      const m = p.meter, f = Math.min(1, m.spent / m.limit);
      return `<b class="ic-hero">${esc(p.hero.display)}</b><div class="ic-meter"><i class="grow-x" style="width:${f * 100}%"></i><b style="left:${m.pace * 100}%" title="even pace today"></b></div>
        <div class="ic-meter-l"><span>${esc(m.spentDisplay)} spent</span><span>${esc(m.limitDisplay)} limit</span></div><div class="ic-note">${esc(p.perDay)}</div>`;
    },
    V10(p) {
      const [last, cur] = p.series, H = 110, max = Math.max(...last.points.map(x => x.amount), ...cur.points.map(x => x.amount), 1) * 1.08;
      const x = i => 2 + i * ((W - 40) / (p.days - 1)), y = v => 6 + (H - 6) * (1 - v / max);
      const path = s => s.points.map((q, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(q.amount).toFixed(1)).join('');
      const li = cur.points.length - 1;
      return `<b class="ic-hero">${esc(p.hero.display)}</b><svg viewBox="0 0 ${W} ${H + 18}"><line x1="0" x2="${W - 36}" y1="${H}" y2="${H}" stroke="${GRID}"/>
        <path d="${path(last)}" fill="none" stroke="${GREY}" stroke-width="2"/><path class="draw" d="${path(cur)}" fill="none" stroke="${ACCENT}" stroke-width="2" stroke-linejoin="round"/>
        <circle cx="${x(li)}" cy="${y(cur.points[li].amount)}" r="4" fill="${ACCENT}"/>
        <text x="${W - 32}" y="${y(last.points[last.points.length - 1].amount) + 4}" font-size="11" fill="${INK3}">${esc(last.label)}</text>
        <text x="${x(li) + 8}" y="${y(cur.points[li].amount) - 6}" font-size="11" font-weight="600" fill="${ACCENT}">${esc(cur.label)}</text>
        <text x="2" y="${H + 15}" font-size="11" fill="${INK2}">1</text><text x="${x(14)}" y="${H + 15}" font-size="11" fill="${INK2}" text-anchor="middle">15</text><text x="${x(p.days - 1)}" y="${H + 15}" font-size="11" fill="${INK2}" text-anchor="end">${p.days}</text></svg>`;
    },
    V11(p) {
      const pts = p.series[0].points, max = Math.max(...pts.map(x => Math.abs(x.amount)), 1);
      return `<div class="ic-rank">${pts.map((x, i) => `<div class="ic-row"><span class="ic-lab"><em>${esc(x.label)}</em></span>
        <span class="ic-track"><i class="grow-x" style="width:calc((100% - 70px) * ${Math.max(0.02, Math.abs(x.amount) / max)});background:${x.amount >= 0 ? ACCENT : GREY};animation-delay:${i * 30}ms"></i><b>${esc(x.display)}</b></span></div>`).join('')}</div>`;
    },
    V12(p) {
      const pts = p.series[0].points, max = Math.max(...pts.map(x => x.amount), 1);
      return `<div class="ic-wk">${pts.map((x, i) => `<div><em>${x.amount === max ? esc(x.display) : ''}</em><i style="opacity:${(0.14 + 0.86 * x.amount / max).toFixed(2)};animation-delay:${i * 30}ms"></i><span>${x.label}</span></div>`).join('')}</div>`;
    },
    V13(p) {
      const pts = p.series[0].points, max = Math.max(...pts.map(x => x.amount), 1);
      return `<div class="ic-visits">${logo(p.title, 44)}<div><b class="ic-hero">${esc(p.hero.display)}</b><div class="ic-dots">${pts.map((x, i) => `<i style="--d:${6 + 12 * x.amount / max}px;opacity:${x.amount ? 1 : .2};animation-delay:${i * 30}ms"></i>`).join('')}</div></div></div>`;
    },
    V14(p) {
      return `<b class="ic-hero">${esc(p.hero.display)}</b>` + p.series[0].points.map(x => `<div class="ic-tx">${logo(x.label, 30)}<div><b>${esc(x.label)}</b><small>next ${esc(x.next)}</small></div><strong>${esc(x.display)}</strong></div>`).join('');
    },
    V18(p) {
      const b = p.band, pos = v => Math.min(100, v / p.max * 100);
      return `<div class="ic-v18"><b class="ic-hero">${esc(p.hero.display)}</b><span class="ic-chip">${esc(p.verdict.glyph)} ${esc(p.verdict.label)}</span></div>
        <div class="ic-gauge"><span class="band" style="left:${pos(b.low)}%;width:${pos(b.high) - pos(b.low)}%"></span><span class="med" style="left:${pos(b.median)}%"></span><span class="mk" style="left:${pos(p.marker)}%"></span></div>
        <div class="ic-gauge-l"><span style="left:${pos(b.low)}%">${esc(b.lowDisplay)}</span><span style="left:${pos(b.high)}%">${esc(b.highDisplay)}</span></div>`;
    },
    V21(p) {
      const pts = p.series[0].points;
      if (!pts.length) return `<div class="ic-calm"><span>✓</span>${esc(p.takeaway)}</div>`;
      return pts.map(x => `<div class="ic-tx">${logo(x.label, 30)}<div><b>${esc(x.label)}</b><small>${esc(x.when)} · <span class="ic-pill">! ${esc(x.reason)}</span></small></div><strong>${esc(x.display)}</strong></div>`).join('');
    },
  };

  function page(p) {
    const calm = p.visual === 'V21' && !p.series[0].points.length;
    return `<div class="ic-page"><div class="ic-title">${esc(p.title)}</div><div class="ic-body">${R[p.visual] ? R[p.visual](p) : ''}</div>
      ${calm ? '' : `<p class="ic-take">${esc(p.takeaway)}</p>`}<p class="ic-foot">${esc(p.footer)}</p></div>`;
  }
  function wire(card) {
    // Tap a merchant (or category) row to see what's inside it.
    card.querySelectorAll('.ic-row.tap').forEach(b => b.addEventListener('click', () => {
      const box = b.nextElementSibling, open = box.hidden;
      card.querySelectorAll('.ic-inside').forEach(x => (x.hidden = true)); card.querySelectorAll('.ic-row').forEach(x => x.classList.remove('open'));
      box.hidden = !open; b.classList.toggle('open', open);
    }));
    return card;
  }
  function renderDeck(panels, compact) {
    const card = document.createElement('div');
    card.className = 'ins' + (compact ? ' compact' : '');
    if (panels.length === 1) { card.innerHTML = page(panels[0]); return wire(card); }
    card.innerHTML = `<div class="ic-track-x">${panels.map(page).join('')}</div><div class="ic-pager">${panels.map((_, i) => `<button aria-label="Page ${i + 1}" class="${i ? '' : 'on'}"></button>`).join('')}</div>`;
    const track = card.querySelector('.ic-track-x'), dots = [...card.querySelectorAll('.ic-pager button')];
    track.addEventListener('scroll', () => { const i = Math.round(track.scrollLeft / track.clientWidth); dots.forEach((d, k) => d.classList.toggle('on', k === i)); }, { passive: true });
    dots.forEach((d, i) => d.addEventListener('click', () => track.scrollTo({ left: i * track.clientWidth, behavior: 'smooth' })));
    return wire(card);
  }
  const render = (p, compact) => renderDeck([p], compact);

  window.Charts = { render, renderDeck, logo };
})();
