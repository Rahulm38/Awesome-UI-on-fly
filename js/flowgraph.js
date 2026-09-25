/* The pipeline graph — one drawing shared by the live demo and the architecture page.
   Wide containers get a left-to-right pipeline; narrow ones (phones) stack it top to bottom.
   Every stage has one connector in and one out, so lines never share a path. */
(function () {
  const NS = 'http://www.w3.org/2000/svg';
  const META = {
    phone:    { t: 'CLIENT', s: 'POST /v1/turn', c: '#9ca3af', stage: '01 Request', id: 'EDGE-00' },
    orch:     { t: 'ORCHESTRATOR', s: 'turn router', c: '#38bdf8', stage: '02 Route', id: 'SVC-01' },
    jev:      { t: 'JEV', s: 'decision model', c: '#c084fc', row: true },
    llm:      { t: 'LLM', s: 'slot extraction', c: '#f472b6', row: true },
    insight:  { t: 'INSIGHTS', s: 'snapshot cache', c: '#22d3ee', row: true },
    rules:    { t: 'RULES', s: 'failover', c: '#facc15', row: true, fallback: true },
    safety:   { t: 'SAFETY GATE', s: 'deterministic', c: '#4ade80', stage: '04 Guard', id: 'SVC-02' },
    bank:     { t: 'CORE BANKING', s: 'write · read-back', c: '#60a5fa', stage: '05 Execute', id: 'EXT-01' },
    composer: { t: 'UI COMPOSER', s: 'results → blocks', c: '#e879f9', stage: '06 Compose', id: 'SVC-03' },
    render:   { t: 'CLIENT', s: 'renders blocks', c: '#9ca3af', stage: '07 Render', id: 'EDGE-00' },
  };
  const ROWS = ['jev', 'llm', 'insight', 'rules'];
  // Plain-language narration of what the request is doing right now.
  const SAY = {
    orch: '02 Route → orchestrator receives the turn and fans out',
    jev: '03 Decide → Jev scores the closed catalogue of actions',
    llm: '03 Decide → LLM pulls out amounts, merchants, dates',
    insight: '03 Decide → Insights read the warm snapshot and pick a chart',
    rules: '03 Decide → models unavailable · rules decide instead',
    safety: '04 Guard → safety gate: card · eligibility · values · lane',
    bank: '05 Execute → write to core banking, then read it back',
    composer: '06 Compose → results become UI blocks',
    render: '07 Render → the phone draws what it was sent',
    snap: '03 Decide → snapshot refresh · one read from core banking, shared',
    preview: 'Keystroke → Insights only draws a chart preview · Jev is NOT called (On send)',
  };
  const SAMPLE = ['phone-orch', 'orch-group', 'in-jev', 'out-jev', 'group-safety', 'safety-bank', 'bank-composer', 'composer-render'];
  const VERTICAL_BELOW = 640;   // container px: under this the wide drawing's text drops below ~7px

  const brackets = (x, y, w, h, k) => `M${x},${y + k}V${y}H${x + k}M${x + w - k},${y}H${x + w}V${y + k}M${x + w},${y + h - k}V${y + h}H${x + w - k}M${x + k},${y + h}H${x}V${y + h - k}`;
  const fan = (x1, y1, x2, y2) => `M${x1},${y1} C${(x1 + x2) / 2},${y1} ${(x1 + x2) / 2},${y2} ${x2},${y2}`;

  // ── left → right: stages along one line, the parallel calls grouped in the middle ──
  function horizontal() {
    const W = 108, H = 52, Y = 128, GAP = 30, GW = 150, GY = 22, GH = 206, RH = 36;
    const X = []; { let x = 0; [W, W, GW, W, W, W, W].forEach(w => { X.push(x); x += w + GAP; }); }
    const GX = X[2], RW = GW - 20, RX = GX + 10, END = X[6] + W;
    const rowY = { jev: 54, llm: 100, insight: 146, rules: 198 };
    const box = {};
    ['phone', 'orch', null, 'safety', 'bank', 'composer', 'render'].forEach((id, i) => { if (id) box[id] = { x: X[i], y: Y - H / 2, w: W, h: H }; });
    ROWS.forEach(id => (box[id] = { x: RX, y: rowY[id] - RH / 2, w: RW, h: RH }));
    const seg = (a, b) => `M${a},${Y}H${b}`;
    const edges = {
      'phone-orch': seg(X[0] + W, X[1]), 'orch-group': seg(X[1] + W, GX), 'group-safety': seg(GX + GW, X[3]),
      'safety-bank': seg(X[3] + W, X[4]), 'bank-composer': seg(X[4] + W, X[5]), 'composer-render': seg(X[5] + W, X[6]),
    };
    ROWS.forEach(id => { edges['in-' + id] = fan(GX, Y, RX, rowY[id]); edges['out-' + id] = fan(RX + RW, rowY[id], GX + GW, Y); });
    return { view: [-10, -4, END + 20, 244], box, edges, group: { x: GX, y: GY, w: GW, h: GH }, div: [GX + 10, GX + GW - 10, 174],
      text: { id: 12, t: 27, s: 40 }, stageDy: 9 };
  }

  // ── top → bottom (phones): one column; each parallel call has its own rail in and out,
  //    nested so no two connectors cross ──
  function vertical() {
    const cx = 150, NX = 50, NW = 200, H = 44, GAP = 26, RH = 36, GX = 14, GW = 272, RX = 58, RW = 184;
    const box = {}, edges = {};
    let y = 18;
    const put = id => { box[id] = { x: NX, y, w: NW, h: H }; y += H + GAP; };
    put('phone'); put('orch');
    const GT = y + 4;
    const rowY = { jev: GT + 36, llm: GT + 78, insight: GT + 120, rules: GT + 170 };
    ROWS.forEach(id => (box[id] = { x: RX, y: rowY[id] - RH / 2, w: RW, h: RH }));
    const GB = rowY.rules + RH / 2 + 26;
    y = GB + GAP;
    ['safety', 'bank', 'composer', 'render'].forEach(put);
    const down = (a, b) => `M${cx},${a}V${b}`;
    edges['phone-orch'] = down(box.phone.y + H, box.orch.y);
    edges['orch-group'] = down(box.orch.y + H, GT);
    edges['group-safety'] = down(GB, box.safety.y);
    edges['safety-bank'] = down(box.safety.y + H, box.bank.y);
    edges['bank-composer'] = down(box.bank.y + H, box.composer.y);
    edges['composer-render'] = down(box.composer.y + H, box.render.y);
    ROWS.forEach((id, i) => {
      const ry = rowY[id], a = RX - 10 - 7 * i, b = RX + RW + 10 + 7 * (3 - i);
      edges['in-' + id] = `M${cx},${GT}C${cx},${GT + 12} ${a},${GT + 4} ${a},${GT + 16}V${ry - 6}Q${a},${ry} ${a + 6},${ry}H${RX}`;
      edges['out-' + id] = `M${RX + RW},${ry}H${b - 6}Q${b},${ry} ${b},${ry + 6}V${GB - 16}C${b},${GB - 4} ${cx},${GB - 12} ${cx},${GB}`;
    });
    return { view: [0, 0, 300, y - GAP + 10], box, edges, group: { x: GX, y: GT, w: GW, h: GB - GT }, div: [RX, RX + RW, (rowY.insight + rowY.rules) / 2],
      text: { id: 12, t: 26, s: 38 }, stageDy: 7 };
  }

  function FlowGraph(svg, opts = {}) {
    const off = opts.off || (() => false), switchable = opts.switchable || [];
    const g = { NODES: {}, paths: {}, flows: {}, nodeEl: {}, vertical: null };
    for (const id in META) g.NODES[id] = Object.assign({}, META[id]);
    const state = {};
    let lit = [], pk = null;
    const mk = (tag, a, p = svg) => { const e = document.createElementNS(NS, tag); for (const k in a) e.setAttribute(k, a[k]); p.appendChild(e); return e; };

    g.cls = (id, st) => {
      state[id] = st;
      g.nodeEl[id].setAttribute('class', ['node', g.NODES[id].row && 'row', g.NODES[id].fallback && 'fb', switchable.includes(id) && 'switchable', off(id) && 'off', st].filter(Boolean).join(' '));
    };
    g.showFlows = list => { lit = list; Object.entries(g.flows).forEach(([k, f]) => f.classList.toggle('on', list.includes(k))); };

    function build(vert) {
      // Keep what the nodes are showing across a rebuild.
      const keep = {};
      for (const [id, n] of Object.entries(g.NODES)) if (n.ms) keep[id] = [n.ms.textContent, n.sub.textContent];
      svg.textContent = ''; g.paths = {}; g.flows = {}; g.nodeEl = {}; g.vertical = vert;
      svg.classList.add('flow-svg'); svg.classList.toggle('vert', vert);
      const L = vert ? vertical() : horizontal(), [vx, vy, vw, vh] = L.view;
      svg.setAttribute('viewBox', L.view.join(' '));
      mk('defs', {}).innerHTML = '<pattern id="grid" width="16" height="16" patternUnits="userSpaceOnUse"><path d="M16 0H0V16" fill="none" stroke="#22d3ee0d" stroke-width=".6"/></pattern>' +
        '<filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>';
      mk('rect', { x: vx, y: vy, width: vw, height: vh, fill: 'url(#grid)' });
      const G = L.group;
      mk('rect', { x: G.x, y: G.y, width: G.w, height: G.h, class: 'group' });
      mk('path', { d: brackets(G.x, G.y, G.w, G.h, 10), class: 'group-br' });
      mk('text', { x: G.x, y: G.y - 8, class: 'stage-t' }).textContent = '03 Decide · fan-out ×3';
      mk('line', { x1: L.div[0], x2: L.div[1], y1: L.div[2], y2: L.div[2], class: 'group-div' });
      for (const [k, d] of Object.entries(L.edges)) {
        const main = !k.startsWith('in-') && !k.startsWith('out-');
        g.paths[k] = mk('path', { d, class: 'edge' + (k.includes('rules') ? ' fallback' : '') + (main ? ' main' : '') });
        g.flows[k] = mk('path', { d, class: 'flowline' });
      }
      for (const [id, n] of Object.entries(g.NODES)) {
        const b = L.box[id], row = n.row, el = mk('g', { style: `--nc:${n.c}` });
        if (n.stage) mk('text', { x: b.x, y: b.y - L.stageDy, class: 'stage-t' }, el).textContent = n.stage;
        mk('rect', { class: 'bg', x: b.x, y: b.y, width: b.w, height: b.h }, el);
        mk('rect', { class: 'scan', x: b.x + 1, y: b.y + 1, width: b.w - 2, height: 2 }, el);
        mk('path', { class: 'br', d: brackets(b.x, b.y, b.w, b.h, 6) }, el);
        mk('circle', { class: 'led', cx: b.x + b.w - 9, cy: b.y + 9, r: 2.4 }, el);
        if (n.id) mk('text', { class: 'id', x: b.x + 8, y: b.y + L.text.id }, el).textContent = n.id;
        mk('text', { class: 't', x: b.x + 8, y: b.y + (row ? 15 : L.text.t) }, el).textContent = n.t;
        n.sub = mk('text', { class: 's', x: b.x + 8, y: b.y + (row ? 28 : L.text.s) }, el);
        n.ms = mk('text', { class: 'ms', x: b.x + b.w - 16, y: b.y + (row ? 15 : 12), 'text-anchor': 'end' }, el);
        [n.ms.textContent, n.sub.textContent] = keep[id] || ['', n.s];
        if (switchable.includes(id) && opts.onNodeClick) el.addEventListener('click', () => opts.onNodeClick(id));
        g.nodeEl[id] = el;
        g.cls(id, state[id]);
      }
      pk = mk('g', {});
      g.showFlows(lit);
    }

    // A packet is a short comet of light travelling along the connector.
    g.packet = (key, color, T, ghost) => {
      const p = g.paths[key]; if (!p || !pk) return Promise.resolve();
      const L = p.getTotalLength(), tail = Math.min(ghost ? 18 : 26, L * .8);
      const c = mk('path', { d: p.getAttribute('d'), class: 'comet' + (ghost ? ' ghost' : ''), stroke: color, 'stroke-dasharray': `${tail} ${L + tail}`, 'stroke-dashoffset': tail }, pk);
      const t0 = performance.now(), dur = T || Math.max(160, L * 3.4);
      p.classList.add('hot'); clearTimeout(p._t);
      return new Promise(res => (function step(now) {
        const k = Math.min(1, (now - t0) / dur), e = ghost ? k : 1 - Math.pow(1 - k, 2);
        c.setAttribute('stroke-dashoffset', tail - e * (L + tail));
        if (k < 1) requestAnimationFrame(step); else { c.remove(); p._t = setTimeout(() => p.classList.remove('hot'), 500); res(); }
      })(t0));
    };

    const pick = () => (svg.parentElement.clientWidth || innerWidth) < VERTICAL_BELOW;
    build(pick());
    if (window.ResizeObserver) new ResizeObserver(() => { const v = pick(); if (v !== g.vertical) build(v); }).observe(svg.parentElement);
    return g;
  }

  // A self-running sample turn, for pages without the engine (the architecture page).
  FlowGraph.autoplay = function (g, sayEl) {
    const N = g.NODES, wait = ms => new Promise(r => setTimeout(r, ms));
    const say = id => { if (!sayEl) return; sayEl.textContent = SAY[id]; sayEl.parentElement.style.setProperty('--sc', N[id].c); sayEl.classList.remove('in'); void sayEl.offsetWidth; sayEl.classList.add('in'); };
    const done = (id, ms) => { g.cls(id, 'done'); N[id].ms.textContent = ms; };
    const reset = () => Object.keys(N).forEach(id => { g.cls(id, id === 'phone' ? 'done' : 'idle'); N[id].ms.textContent = ''; });
    g.showFlows(SAMPLE);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      reset(); [['orch', '3ms'], ['jev', '46ms'], ['llm', '612ms'], ['insight', '11ms'], ['safety', '4ms'], ['bank', '88ms'], ['composer', '2ms'], ['render', '✓']].forEach(([id, ms]) => done(id, ms));
      if (sayEl) sayEl.textContent = 'a sample turn · Jev ∥ LLM ∥ Insights, then gate → bank → composer → phone';
      return;
    }
    const go = async (keys, id, color) => { for (const k of keys) await g.packet(k, color || N[id].c); g.cls(id, 'active'); say(id); };
    (async function loop() {
      for (;;) {
        while (document.hidden) await wait(500);
        reset(); await wait(600);
        await go(['phone-orch'], 'orch'); await wait(250); done('orch', '3ms');
        await g.packet('orch-group', N.orch.c);
        await Promise.all([go(['in-jev'], 'jev'), go(['in-llm'], 'llm'), go(['in-insight'], 'insight')]);
        say('jev'); await wait(500); done('jev', '46ms');
        say('insight'); await wait(400); done('insight', '11ms');
        say('llm'); await wait(900); done('llm', '612ms');
        await g.packet('out-jev', N.safety.c); await go(['group-safety'], 'safety'); await wait(500); done('safety', '4ms');
        await go(['safety-bank'], 'bank'); await wait(800); done('bank', '88ms');
        await go(['bank-composer'], 'composer'); await wait(500); done('composer', '2ms');
        await go(['composer-render'], 'render'); await wait(300); done('render', '✓');
        await wait(3200);
      }
    })();
  };
  FlowGraph.SAY = SAY;
  FlowGraph.SAMPLE = SAMPLE;
  window.FlowGraph = FlowGraph;
})();
