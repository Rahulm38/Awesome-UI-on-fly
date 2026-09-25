/* Draws an insight panel. It only draws: every number and money string
 * arrives already formatted, and colour comes from the panel's colour slot. */
(function () {
  const D = window.NovaData;
  const ACCENT = '#015b7e', CAT = ['#0b78ae', '#d9622b', '#7b61d1', '#2e9e6e'], GREY = '#d3d3d3';
  const color = s => (s === -1 ? GREY : s === 0 || s == null ? ACCENT : CAT[(s - 1) % 4]);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const el = (cls, html) => { const e = document.createElement('div'); e.className = cls; e.innerHTML = html; return e; };
  const W = 250;
  let uid = 0;

  const logo = (name, size = 28) => {
    const l = D.logos[name];
    return l ? `<span class="logo" style="--s:${size}px;background:${l.bg};color:${l.fg}">${esc(l.t)}</span>` : `<span class="logo" style="--s:${size}px;background:#eef2f4;color:${ACCENT}">${esc(name[0])}</span>`;
  };

  // Rounded at the data end only.
  const col = (x, y, w, h, r = 4) => h <= 0 ? '' : `M${x},${y + h}V${y + Math.min(r, h)}Q${x},${y} ${x + Math.min(r, w / 2)},${y}H${x + w - Math.min(r, w / 2)}Q${x + w},${y} ${x + w},${y + Math.min(r, h)}V${y + h}Z`;

  const R = {
    V1(p) {
      const pts = p.series[0].points.map(x => x.amount), max = Math.max(...pts, 1), H = 44;
      const xy = pts.map((v, i) => [8 + i * ((W - 16) / (pts.length - 1)), 6 + (H - 12) * (1 - v / max)]);
      const line = xy.map((q, i) => (i ? 'L' : 'M') + q[0].toFixed(1) + ',' + q[1].toFixed(1)).join('');
      const [lx, ly] = xy[xy.length - 1];
      return `<svg viewBox="0 0 ${W} ${H + 14}"><path d="${line}L${lx},${H}L8,${H}Z" fill="${ACCENT}" opacity=".07"/>
        <path class="draw" d="${line}" fill="none" stroke="${ACCENT}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
        <circle cx="${lx}" cy="${ly}" r="4" fill="${ACCENT}"/>
        ${p.series[0].points.map((x, i) => `<text x="${xy[i][0]}" y="${H + 12}" font-size="10" fill="#737373" text-anchor="middle">${esc(x.label)}</text>`).join('')}</svg>`;
    },
    V2(p) {
      const pts = p.series[0].points, max = Math.max(...pts.map(x => x.amount), 1);
      return pts.map(x => `<div class="hb"><div class="hb-l"><span>${esc(x.label)}</span><b>${esc(x.display)}</b></div>
        <div class="hb-t"><i class="grow-x" style="width:${Math.max(1, x.amount / max * 100)}%;background:${color(x.colorSlot)}"></i></div></div>`).join('');
    },
    V3(p) {
      const pts = p.series[0].points, H = 120, top = 18, gut = 34, n = pts.length;
      const max = Math.max(...pts.map(x => x.amount), p.band ? p.band.high : 0, 1) * 1.08;
      const cw = (W - gut) / n, bw = Math.min(24, cw - 5), y = v => top + (H - top) * (1 - v / max), id = 'h' + ++uid;
      const every = n > 5 ? 2 : 1;
      let s = `<svg viewBox="0 0 ${W} ${H + 18}"><defs><pattern id="${id}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="${ACCENT}" opacity=".45"/><line x1="0" y1="0" x2="0" y2="6" stroke="#fff" stroke-width="1.5" opacity=".63"/></pattern></defs>`;
      s += `<line x1="0" x2="${W - gut}" y1="${H}" y2="${H}" stroke="#e6e6e6"/>`;
      if (p.band) {
        if (y(p.band.low) - y(p.band.high) > 2) s += `<rect x="0" width="${W - gut}" y="${y(p.band.high)}" height="${y(p.band.low) - y(p.band.high)}" fill="${ACCENT}" opacity=".07"/>`;
        s += `<line x1="0" x2="${W - gut + 2}" y1="${y(p.band.median)}" y2="${y(p.band.median)}" stroke="#919191" stroke-opacity=".6"/><text x="${W - gut + 5}" y="${y(p.band.median) + 3.5}" font-size="10" fill="#737373">usual</text>`;
      }
      pts.forEach((x, i) => {
        const cx = i * cw + (cw - bw) / 2, h = x.amount > 0 ? Math.max(2, H - y(x.amount)) : 0, last = i === n - 1;
        s += `<path class="grow" style="animation-delay:${i * 18}ms" d="${col(cx, H - h, bw, h)}" fill="${x.partial ? `url(#${id})` : last ? ACCENT : '#7fa9bd'}"/>`;
        if (last && x.amount > 0) s += `<text x="${cx + bw / 2}" y="${H - h - 5}" font-size="11" font-weight="600" fill="#222" text-anchor="middle">${esc(x.display)}</text>`;
        if (i % every === (n - 1) % every) s += `<text x="${cx + bw / 2}" y="${H + 13}" font-size="10" fill="#737373" text-anchor="middle">${esc(x.label)}</text>`;
      });
      return s + '</svg>';
    },
    V5(p) {
      const pts = p.series[0].points;
      return `<div class="split">${pts.map(x => `<i class="grow-x" style="width:${x.share * 100}%;background:${color(x.colorSlot)}"></i>`).join('')}</div>
        <div class="legend-p">${pts.map(x => `<span><i style="background:${color(x.colorSlot)}"></i>${esc(x.label)}<b>${esc(x.display)}</b></span>`).join('')}</div>`;
    },
    V7(p) {
      const pts = p.series[0].points, max = Math.max(...pts.map(x => x.amount), 1);
      return pts.map((x, i) => `<div class="rk" style="animation-delay:${i * 30}ms">${x.colorSlot === -1 ? '<span class="logo" style="--s:28px;background:#f0f0f0;color:#919191">…</span>' : logo(x.label)}
        <div class="rk-m"><div class="rk-l"><span>${esc(x.label)}</span><b>${esc(x.display)}</b></div>
        <div class="hb-t thin"><i class="grow-x" style="width:${x.amount / max * 100}%;background:${color(x.colorSlot)}"></i></div></div></div>`).join('');
    },
    V8(p) {
      const pts = p.series[0].points, tot = pts.reduce((n, x) => n + x.amount, 0), r = 46, C = 2 * Math.PI * r;
      let off = 0, arcs = '';
      pts.forEach((x, i) => { const len = x.amount / tot * C; arcs += `<circle r="${r}" cx="60" cy="60" fill="none" stroke="${color(x.colorSlot)}" stroke-width="16" stroke-dasharray="${Math.max(0, len - 2)} ${C}" stroke-dashoffset="${-off}" transform="rotate(-90 60 60)" class="arc" style="animation-delay:${i * 60}ms"/>`; off += len; });
      return `<div class="donut"><svg viewBox="0 0 120 120" width="120" height="120">${arcs}<text x="60" y="57" font-size="10" fill="#737373" text-anchor="middle">Total</text><text x="60" y="72" font-size="14" font-weight="700" fill="#222" text-anchor="middle">${esc(p.hero.display)}</text></svg>
        <div class="legend-p one">${pts.map(x => `<span><i style="background:${color(x.colorSlot)}"></i>${esc(x.label)}<b>${esc(x.display)}</b></span>`).join('')}</div></div>`;
    },
    V9(p) {
      const m = p.meter, f = Math.min(1, m.spent / m.limit);
      return `<div class="meter"><i class="grow-x" style="width:${f * 100}%"></i><b style="left:${m.pace * 100}%" title="even pace today"></b></div>
        <div class="meter-l"><span>${esc(m.spentDisplay)} spent</span><span>even pace today ▲</span><span>${esc(m.limitDisplay)}</span></div>
        <div class="perday">${esc(p.perDay)}</div>`;
    },
    V10(p) {
      const [last, cur] = p.series, H = 110, max = Math.max(...last.points.map(x => x.amount), ...cur.points.map(x => x.amount), 1) * 1.1;
      const x = i => 4 + i * ((W - 40) / (p.days - 1)), y = v => 8 + (H - 8) * (1 - v / max);
      const path = s => s.points.map((q, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(q.amount).toFixed(1)).join('');
      const li = cur.points.length - 1;
      return `<svg viewBox="0 0 ${W} ${H + 18}"><line x1="0" x2="${W - 36}" y1="${H}" y2="${H}" stroke="#e6e6e6"/>
        <path d="${path(last)}" fill="none" stroke="${GREY}" stroke-width="2"/>
        <path class="draw" d="${path(cur)}" fill="none" stroke="${ACCENT}" stroke-width="2" stroke-linejoin="round"/>
        <circle cx="${x(li)}" cy="${y(cur.points[li].amount)}" r="4" fill="${ACCENT}"/>
        <text x="${W - 32}" y="${y(last.points[last.points.length - 1].amount) + 4}" font-size="10" fill="#737373">${esc(last.label)}</text>
        <text x="${x(li) + 7}" y="${y(cur.points[li].amount) - 6}" font-size="10" font-weight="600" fill="${ACCENT}">${esc(cur.label)}</text>
        <text x="4" y="${H + 13}" font-size="10" fill="#737373">1</text><text x="${x(14)}" y="${H + 13}" font-size="10" fill="#737373" text-anchor="middle">15</text><text x="${x(p.days - 1)}" y="${H + 13}" font-size="10" fill="#737373" text-anchor="end">${p.days}</text></svg>`;
    },
    V11(p) {
      const pts = p.series[0].points, max = Math.max(...pts.map(x => Math.abs(x.amount)), 1);
      return pts.map((x, i) => `<div class="chg" style="animation-delay:${i * 30}ms"><span>${esc(x.label)}</span>
        <div class="chg-t"><i class="${x.amount >= 0 ? 'up' : 'dn'} grow-x" style="width:${Math.abs(x.amount) / max * 50}%"></i></div><b>${esc(x.display)}</b></div>`).join('');
    },
    V12(p) {
      const pts = p.series[0].points, max = Math.max(...pts.map(x => x.amount), 1);
      return `<div class="wk">${pts.map((x, i) => `<div><em>${x.amount === max ? esc(x.display) : ''}</em><i style="background:${ACCENT};opacity:${(0.12 + 0.88 * x.amount / max).toFixed(2)};animation-delay:${i * 30}ms"></i><span>${x.label}</span></div>`).join('')}</div>`;
    },
    V13(p) {
      const pts = p.series[0].points, max = Math.max(...pts.map(x => x.amount), 1);
      return `<div class="visits">${logo(p.title, 40)}<div class="dots">${pts.map((x, i) => `<div title="${esc(x.label)}"><i style="--d:${6 + 14 * x.amount / max}px;opacity:${x.amount ? 1 : .25};animation-delay:${i * 30}ms"></i><span>${i === pts.length - 1 ? 'now' : ''}</span></div>`).join('')}</div></div>`;
    },
    V14(p) {
      return p.series[0].points.map((x, i) => `<div class="li" style="animation-delay:${i * 30}ms">${logo(x.label)}<div><b>${esc(x.label)}</b><small>next ${esc(x.next)}</small></div><strong>${esc(x.display)}</strong></div>`).join('');
    },
    V18(p) {
      const b = p.band, pos = v => Math.min(100, v / p.max * 100);
      return `<div class="gauge"><span class="band" style="left:${pos(b.low)}%;width:${pos(b.high) - pos(b.low)}%"></span><span class="med" style="left:${pos(b.median)}%"></span><span class="mk" style="left:${pos(p.marker)}%"></span></div>
        <div class="gauge-l"><span style="left:${pos(b.low)}%">${esc(b.lowDisplay)}</span><span style="left:${pos(b.high)}%">${esc(b.highDisplay)}</span></div>
        <div class="verdict-chip">${esc(p.verdict.glyph)} ${esc(p.verdict.label)}</div>`;
    },
    V21(p) {
      const pts = p.series[0].points;
      if (!pts.length) return `<div class="calm"><span>✓</span>${esc(p.takeaway)}</div>`;
      return pts.map(x => `<div class="li warn">${logo(x.label)}<div><b>${esc(x.label)}</b><small>${esc(x.when)} · <span class="pill">! ${esc(x.reason)}</span></small></div><strong>${esc(x.display)}</strong></div>`).join('');
    },
  };

  function render(p, compact, noTake) {
    const box = el('ins' + (compact ? ' compact' : ''), '');
    const hero = p.hero ? `<div class="ins-hero"><b>${esc(p.hero.display)}</b>${p.hero.delta ? `<span class="delta">${esc(p.hero.delta)}</span>` : ''}</div>` : '';
    box.innerHTML = `<div class="ins-title"><span>${esc(p.title)}</span><span class="vid" title="${esc(p.why)}">${p.visual}</span></div>${p.visual === 'V8' ? '' : hero}
      <div class="ins-body">${R[p.visual](p)}</div>${noTake || (p.visual === 'V21' && !p.series[0].points.length) ? '' : `<div class="take">${esc(p.takeaway)}</div>`}
      <div class="foot-l">${esc(p.footer)}</div>`;
    return box;
  }

  window.Charts = { render, logo };
})();
