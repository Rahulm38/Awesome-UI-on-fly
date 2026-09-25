/* The right-hand side: what the system is doing while the phone talks. */
(function () {
  const { bus } = window.Engine;
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ── flow graph (js/flowgraph.js): the same drawing as the architecture page ──
  const svg = $('#flow');
  const graph = FlowGraph(svg, { off: id => Engine.settings[id] === false, switchable: ['jev', 'llm'], onNodeClick: id => setModel(id, !Engine.settings[id]) });
  const { NODES, cls, packet } = graph;
  // A logical hop → the connectors it travels along. Returns to the orchestrator aren't drawn.
  const ROUTES = {
    'phone-orch': ['phone-orch'],
    'orch-jev': ['orch-group', 'in-jev'], 'orch-llm': ['orch-group', 'in-llm'], 'orch-insight': ['orch-group', 'in-insight'], 'orch-rules': ['orch-group', 'in-rules'],
    'orch-safety': () => [(Engine.settings.jev ? 'out-jev' : Engine.settings.llm ? 'out-llm' : 'out-rules'), 'group-safety'],
    'safety-bank': ['safety-bank'], 'orch-composer': ['bank-composer'], 'composer-phone': ['composer-render'],
  };

  const segs = (from, to) => { const r = ROUTES[`${from}-${to}`]; return typeof r === 'function' ? r() : r || null; };
  let lastHop = 0, recorded = [], recording = [];
  // Plain-language narration of what the request is doing right now.
  const SAY = FlowGraph.SAY;
  let sayT = 0;
  function say(id) {
    const txt = SAY[id]; if (!txt) return;
    const el = $('#flow-say span'); if (el.textContent === txt) return;
    clearTimeout(sayT);
    el.classList.remove('in'); void el.offsetWidth; el.textContent = txt; el.classList.add('in');
    A11y.announce(txt, { channel: 'flow', delay: 1200 });   // hops come fast; read out only the stage it settles on
    $('#flow-say').style.setProperty('--sc', (NODES[id] || (id === 'preview' ? NODES.insight : NODES.bank)).c);
    sayT = setTimeout(() => { el.classList.remove('in'); el.textContent = recorded.length ? 'idle · replaying the last request' : 'idle · the pipeline replays softly until something happens'; $('#flow-say').style.removeProperty('--sc'); }, 6000);
  }
  async function hop(from, to) {
    const target = to === 'phone' ? 'render' : to;
    if (from === 'insight' && to === 'bank') { say('snap'); activate('bank'); return; }
    if (to !== 'orch' || from === 'phone') say(target);
    const list = segs(from, to); if (!list) return;
    lastHop = performance.now();
    recording.push(...list);
    for (const k of list) await packet(k, NODES[target].c);
    activate(target);
  }
  function activate(id) { const g = graph.nodeEl[id]; if (g && !/\b(done|bad|off)\b/.test(g.getAttribute('class'))) cls(id, 'active'); }

  // ── Jev / LLM switches: in the header and on the rows themselves ─────────
  // A model is either up, simulated down (not called), or timing out (outage on).
  const subFor = id => Engine.settings[id] === false ? 'simulated down' : (Engine.settings.outage && (id === 'jev' || id === 'llm')) ? 'timing out' : NODES[id].s;
  bus.on('outage', () => ['jev', 'llm'].forEach(id => { NODES[id].sub.textContent = subFor(id); }));
  function setModel(id, on) {
    Engine.settings[id] = on;
    const n = NODES[id];
    cls(id); n.sub.textContent = subFor(id);
    document.querySelectorAll(`[data-model="${id}"]`).forEach(x => (x.checked = on));
    Engine.log(`simulation: ${n.t} ${on ? 'back up' : 'down'}${on ? '' : id === 'jev' ? ' → the LLM decides actions, the typing tray goes quiet' : ' → rules extract values'}`, on ? 'ok' : 'warn');
  }
  document.querySelectorAll('[data-model]').forEach(x => x.onchange = () => setModel(x.dataset.model, x.checked));

  // ── ambient motion: a sample run before anything happens; afterwards the
  //    last real request keeps replaying softly while the page is idle ──────
  const SAMPLE = FlowGraph.SAMPLE, showFlows = graph.showFlows;
  showFlows(SAMPLE);
  (async function ambient() {
    for (;;) {
      await new Promise(r => setTimeout(r, 1200));
      if (performance.now() - lastHop < 3500 || document.hidden) continue;
      for (const k of (recorded.length ? recorded : SAMPLE)) {
        if (performance.now() - lastHop < 3500) break;
        await packet(k, '#22d3ee', Math.max(320, graph.paths[k].getTotalLength() * 8), true);
      }
    }
  })();

  // ── current trace ────────────────────────────────────────────────────────
  let trace = null, spans = [];
  const bg = new Set();
  bus.on('trace', t => {
    if (t.kind === 'background') { bg.add(t.id); return; }
    if (recording.length > 3) { recorded = recording; showFlows(recorded); }
    recording = [];
    trace = t; spans = [];
    $('#live').className = 'live on'; $('#live').lastChild.textContent = t.previewOnly ? 'keystroke · insights only · Jev not called' : (t.replay ? 'recorded' : 'live') + (t.kind === 'typing' ? ' · keystroke' : ' · turn');
    if (t.previewOnly) setTimeout(() => say('preview'), 30);
    for (const [id, n] of Object.entries(NODES)) { cls(id, id === 'phone' ? 'done' : 'idle'); n.ms.textContent = ''; n.sub.textContent = subFor(id); }
    $('#trace-label').textContent = `${t.kind === 'typing' ? 'keystroke' : 'turn'} · “${t.label.slice(0, 48)}”`;
    drawWF(); drawSummary();
  });
  bus.on('hop', ({ from, to, trace: tid }) => { if (bg.has(tid) || (tid && trace && tid !== trace.id)) return; hop(from, to); });
  bus.on('span', s => {
    if (!trace || s.trace !== trace.id) return;
    spans.push(s);
    const n = NODES[s.node];
    if (n) {
      const tot = spans.filter(x => x.node === s.node).reduce((a, x) => a + x.dur, 0);
      n.ms.textContent = s.status === 'ok' ? `${Math.round(tot)}ms` : 'TIMEOUT';
      cls(s.node, s.status === 'ok' ? 'done' : 'bad');
      if (s.node === 'insight' && s.res && s.res.visual) n.sub.textContent = `${s.res.visual} · ${s.req.snapshot || 'cached'}`;
    }
    drawWF(); drawSummary();
    if (s.node !== 'orch') showJson(s);
  });
  bus.on('turnDone', () => { hop('composer', 'phone').then(() => { cls('render', 'done'); NODES.render.ms.textContent = '✓'; }); setTimeout(() => { recorded = recording.slice(); showFlows(recorded); $('#live').className = 'live'; $('#live').lastChild.textContent = 'replaying last request'; }, 500); });

  function drawSummary() {
    if (!spans.length) { $('#summary').innerHTML = '<span>Waiting for the first request</span>'; return; }
    const end = Math.max(...spans.map(s => s.start + s.dur));
    const by = id => spans.filter(s => s.node === id).reduce((a, s) => a + s.dur, 0);
    const ins = spans.find(s => s.node === 'insight' && s.req && s.req.snapshot);
    const items = [['Total', `${Math.round(end)} ms`, 'tot']];
    [['Jev', 'jev'], ['LLM', 'llm'], ['Rules', 'rules'], ['Insights', 'insight'], ['Gate', 'safety'], ['Bank', 'bank']].forEach(([l, id]) => { const v = by(id); if (v) items.push([l, `${Math.round(v)} ms`]); });
    if (ins) items.push(['Snapshot', ins.req.snapshot]);
    if (spans.some(s => s.node === 'jev') && spans.some(s => s.node === 'llm')) items.push(['Jev ∥ LLM ∥ Insights', 'parallel']);
    $('#summary').innerHTML = items.map(([l, v, c]) => `<span class="${c || ''}">${l}<b>${esc(v)}</b></span>`).join('');
  }

  // ── latency waterfall ────────────────────────────────────────────────────
  const wf = $('#waterfall');
  let selected = null;
  function drawWF() {
    if (!spans.length) { wf.innerHTML = '<p class="hud-empty">awaiting first request<i>_</i></p>'; return; }
    const end = Math.max(100, ...spans.map(s => s.start + s.dur));
    wf.innerHTML = '';
    spans.forEach(s => {
      const r = document.createElement('button');
      r.className = 'wf-row' + (s.status !== 'ok' ? ' bad' : '') + (s === selected ? ' sel' : '');
      r.style.setProperty('--nc', NODES[s.node] ? NODES[s.node].c : '#888');
      r.innerHTML = `<span class="wf-name">${esc(s.name)}</span><span class="wf-track"><i style="left:${(s.start / end) * 100}%;width:${Math.max(0.6, (s.dur / end) * 100)}%"></i></span><span class="wf-ms">${Math.round(s.dur)} ms</span>`;
      r.onclick = () => { selected = s; showJson(s); drawWF(); document.querySelector('[data-tab="payload"]').click(); };
      wf.appendChild(r);
    });
    const ax = document.createElement('div'); ax.className = 'wf-axis';
    ax.innerHTML = `<span>${spans.length} spans</span><span><span>0</span><span>${Math.round(end / 2)} ms</span><span>${Math.round(end)} ms</span></span><span></span>`;
    wf.appendChild(ax);
  }

  // ── tabs ─────────────────────────────────────────────────────────────────
  let unread = 0;
  document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => {
    document.querySelectorAll('[data-tab]').forEach(x => x.classList.toggle('on', x === b));
    document.querySelectorAll('[data-pane]').forEach(x => x.classList.toggle('on', x.dataset.pane === b.dataset.tab));
    if (b.dataset.tab === 'log') { unread = 0; $('#log-count').textContent = ''; }
  });
  A11y.roving($('.tabbar'));
  A11y.roving($('#score-tabs'));
  A11y.roving($('#side-tabs'));

  // ── payloads ─────────────────────────────────────────────────────────────
  let side = 'res', shown = null;
  document.querySelectorAll('[data-side]').forEach(b => b.onclick = () => { side = b.dataset.side; document.querySelectorAll('[data-side]').forEach(x => x.classList.toggle('on', x === b)); showJson(shown); });
  function showJson(s) {
    shown = s; if (!s) return;
    $('#json-title').textContent = `${s.name} · ${Math.round(s.dur)} ms`;
    const body = side === 'req' ? s.req : s.res;
    const txt = JSON.stringify(body, (k, v) => (k === 'features' || k === 'ladder' ? undefined : v), 2) || 'null';
    $('#json').innerHTML = esc(txt.length > 6000 ? txt.slice(0, 6000) + '\n…' : txt).replace(/(&quot;(?:(?!&quot;).)*?&quot;)(\s*:)?|\b(true|false|null)\b|(-?\d+\.?\d*)/g,
      (m, str, colon, lit, num) => str ? `<span class="${colon ? 'k' : 's'}">${str}</span>${colon || ''}` : lit ? `<span class="l">${lit}</span>` : `<span class="n">${num}</span>`);
  }

  // ── decision ─────────────────────────────────────────────────────────────
  const T = window.Jev.T;
  const PATTERN = { A: 'A · card → done', B: 'B · card → value chips', C: 'C · card → merchant', D: 'D · hand off to a screen', E: 'E · full confirm', F: 'F · navigate only', G: 'G · multi-step plan', H: 'H · nothing', R: 'Read · chart' };
  let decisions = [], part = 0, pres = null, lastPanel = null;
  bus.on('scores', ({ decisions: ds, parts }) => { decisions = ds.map((d, i) => ({ d, text: parts[i] })); part = 0; pres = lastPanel && trace && lastPanel.trace === trace.id ? { panel: lastPanel.panel } : null; drawScores(); });
  bus.on('span', s => { if (s.node === 'insight' && s.res && s.res.visual && trace && s.trace === trace.id && trace.kind === 'turn') { lastPanel = { trace: s.trace, panel: s.res }; pres = Object.assign(pres || {}, { panel: s.res }); drawScores(); } });
  Engine.showDecision = (d, text, p) => { decisions = [{ d, text }]; part = 0; pres = p || null; drawScores(); };

  const compact = o => '{\n' + Object.entries(o).map(([k, v]) => `  "${k}": ${JSON.stringify(v).replace(/,"/g, ', "').replace(/","/g, '", "')}`).join(',\n') + '\n}';
  const chip = (k, v, c) => v == null ? '' : `<span class="kc${c ? ' ' + c : ''}"><i>${k}</i>${esc(v)}</span>`;
  function drawScores() {
    const box = $('#scores'), tabs = $('#score-tabs');
    tabs.innerHTML = decisions.length > 1 ? decisions.map((x, i) => `<button role="tab" class="${i === part ? 'on' : ''}" data-i="${i}">Part ${i + 1}</button>`).join('') : '';
    tabs.querySelectorAll('button').forEach(b => b.onclick = () => { part = +b.dataset.i; drawScores(); });
    const cur = decisions[part];
    if (!cur) { box.innerHTML = '<p class="hud-empty">awaiting first request<i>_</i></p>'; return; }
    const { d } = cur, top = d.top;
    const barOf = s => (s.type === 'handoff' ? T.handoff : s.highStakes ? T.highStakes : T.act);
    const rows = d.scores.slice(0, 5).map(s => {
      const bar = barOf(s), chosen = top && top.id === s.id, cand = d.candidates.some(c => c.id === s.id);
      return `<div class="sr${chosen ? ' chosen' : ''}${cand ? ' cand' : ''}" title="${s.type === 'handoff' ? 'opens a screen · ' : ''}${s.highStakes ? 'high stakes · ' : ''}bar ${bar}">
        <span class="sr-l">${esc(s.label)}${s.highStakes ? '<em>▲</em>' : ''}${s.type === 'handoff' ? '<em>↗</em>' : ''}</span>
        <span class="sr-t"><i style="width:${s.p * 100}%" class="${s.p >= bar ? 'pass' : ''}"></i><b style="left:${bar * 100}%"></b></span>
        <span class="sr-v">${s.p.toFixed(2)}</span></div>`;
    }).join('');
    const head = `<div class="vline v-${d.verdict.toLowerCase()}"><b>${d.verdict}</b>${top ? `<span>${top.id}</span><span>${top.p.toFixed(2)} ≥ ${barOf(top).toFixed(2)}</span>` : `<span>${esc(d.reason)}</span>`}
      <span class="route-m">IN <i style="--w:${d.route.IN_SCOPE * 100}%"></i>${d.route.IN_SCOPE.toFixed(2)} · OUT <i style="--w:${d.route.OUT_OF_SCOPE * 100}%"></i>${d.route.OUT_OF_SCOPE.toFixed(2)}${d.source === 'rules' ? ' · RULES' : ''}</span></div>`;
    let told = '';
    if (pres && pres.type === 'ACTION') told = chip('pattern', pres.pattern) + chip('card', pres.cardSource) + chip('taps', pres.oneTapAllowed ? '1' : '≥ 2') + chip('confirm', pres.requiresFullConfirm ? 'yes' : 'no', pres.requiresFullConfirm ? 'warn' : '');
    else if (pres && pres.type === 'CANDIDATES') told = chip('ui', 'did you mean') + chip('taps', '≥ 2');
    else if (pres && pres.type === 'HANDOFF') told = chip('ui', 'handoff') + chip('screen', pres.screen);
    if (pres && pres.panel) told += chip('chart', pres.panel.visual) + chip('read', `${pres.panel.read.intent} · ${pres.panel.read.period}`) + (pres.panel.ladder || []).map(l => chip('fell back', l.split(':')[0], 'warn')).join('');
    // ── the Jev call itself: endpoint, latency, request → response, and how the choice was made
    const js = spans.filter(x => x.node === 'jev' || x.node === 'rules').pop();
    const src = d.source === 'rules' ? 'rules' : d.source === 'llm' ? 'llm' : 'jev';
    const ranked = d.scores.filter(x => !top || x.id !== top.id);
    const best = top || d.scores.find(x => x.type === 'kind'), runner = ranked[0];
    const lead = best && runner ? +(best.p - runner.p).toFixed(2) : null;
    let si = 0;
    const ok = (c, text) => `<li class="${c ? 'y' : 'n'}" style="animation-delay:${(si++) * 160}ms"><i>${c ? '✓' : '✕'}</i>${text}</li>`;
    const steps = [
      ok(d.route.IN_SCOPE >= d.route.OUT_OF_SCOPE, `route · in ${d.route.IN_SCOPE.toFixed(2)} ${d.route.IN_SCOPE >= d.route.OUT_OF_SCOPE ? '≥' : '<'} out ${d.route.OUT_OF_SCOPE.toFixed(2)}`),
      best ? ok(best.p >= barOf(best), `${best.id} ${best.p.toFixed(2)} ${best.p >= barOf(best) ? '≥' : '<'} bar ${barOf(best).toFixed(2)}${best.highStakes ? ' (high stakes)' : ''}`) : '',
      best && lead != null ? ok(lead >= T.margin || !(runner.p >= T.candidateFloor), `lead ${lead.toFixed(2)} over ${runner.id} ${lead >= T.margin || runner.p < T.candidateFloor ? '≥' : '<'} margin ${T.margin}`) : '',
      d.verdict === 'CANDIDATES' ? ok(true, `${d.candidates.length} readings ≥ floor ${T.candidateFloor} → offer choices`) : '',
      d.verdict === 'AMBIGUOUS' ? ok(false, 'ambiguous word · no direction/locate') : '',
    ].join('');
    const choice = top ? top.id : null;
    const req = { text: cur.text, context: pres && pres.cardSource ? { cardSource: pres.cardSource } : { screen: 'HOME' }, catalogue: `${Object.keys(Jev.KINDS).length} actions + ${Object.keys(Jev.HANDOFFS).length} screens`, mode: trace && trace.kind === 'typing' ? 'keystroke' : 'turn', source: trace && trace.replay ? 'recorded fixture' : 'live call' };
    const res = { choice, verdict: d.verdict, top3: d.scores.slice(0, 3).map(x => `${x.id} ${x.p.toFixed(2)}`), candidates: d.candidates.map(x => x.id) };
    const call = `<div class="call">
      <div class="call-h"><span class="verb">POST</span><span>/v1/${src === 'jev' ? 'jev/decide' : src === 'llm' ? 'llm/decide' : 'rules/decide'}</span><span class="mode ${trace && trace.replay ? 'rec' : 'live'}">${trace && trace.replay ? 'RECORDED' : 'LIVE'}</span>
        <span class="st ${js && js.status !== 'ok' ? 'bad' : ''}">${js ? (js.status === 'ok' ? '200' : '504') : '200'}</span><span class="lat">${js ? Math.round(js.dur) + ' ms' : '—'}</span></div>
      <div class="call-b"><div><small>request</small><pre>${esc(compact(req))}</pre></div><div><small>response</small><pre>${esc(compact(res))}</pre></div></div>
      <div class="sel"><small>selection</small><ol>${steps}</ol><div class="choice-line" style="animation-delay:${si * 160 + 80}ms">choice → <b class="${choice ? '' : 'null'}">${choice || 'null'}</b>${choice ? '' : ` <em>· ${d.verdict.toLowerCase()}</em>`}</div></div>
    </div>`;
    box.innerHTML = head + `<div class="srs">${rows}</div>` + call + (told ? `<div class="told-row"><small>phone told</small>${told}</div>` : '');
    $('#scores-text').textContent = `“${cur.text.slice(0, 60)}”`;
  }

  // ── log ──────────────────────────────────────────────────────────────────
  const logEl = $('#log'), t0 = performance.now();
  bus.on('log', ({ msg, level }) => {
    const li = document.createElement('li');
    li.className = level;
    li.innerHTML = `<time>${((performance.now() - t0) / 1000).toFixed(1)}s</time><span>${esc(msg)}</span>`;
    logEl.prepend(li);
    while (logEl.children.length > 120) logEl.lastChild.remove();
    if (!document.querySelector('[data-tab="log"]').classList.contains('on')) $('#log-count').textContent = ++unread;
  });
})();
