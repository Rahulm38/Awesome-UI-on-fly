/* "Inside a Jev call" on the architecture page: three looping question-type cards
 * and a step-by-step walkthrough of one call. Every number in the walkthrough is
 * derived from the simulated Jev (Jev.decide), so it matches the live demo; the
 * rule constants shown are the real ones. */
(function () {
  const D = window.NovaData, J = window.Jev, Icon = window.Icon;
  const root = document.getElementById('jx');
  if (!root || !D || !J || !Icon) return;

  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (sel, el = root) => el.querySelector(sel);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const f2 = n => (Math.round(n * 100) / 100).toFixed(2);

  // Only animate while the section is on screen and the tab is visible.
  let visible = !('IntersectionObserver' in window), onShow = null;
  if (!visible) new IntersectionObserver(es => {
    const was = visible; visible = es[es.length - 1].isIntersecting; root.classList.toggle('off', !visible);
    if (visible && !was && onShow) onShow();
  }, { rootMargin: '80px' }).observe(root);
  const live = () => visible && !document.hidden;

  // Real decision constants (the simulated Jev on this page has its own T).
  const R = { act: 0.50, high: 0.70, highRoute: 0.80, tie: 0.10, none: 0.70, oos: 0.55, oosNoul: 0.60,
    handoff: 0.50, dym: 0.25, lane: 0.85, laneUnfreeze: 0.90, confirm: 0.60 };

  /* ── 1. three question types ─────────────────────────────────────────── */
  function loop(card, sets, build, apply, every, delay) {
    const el = document.getElementById(card);
    if (!el) return;
    const viz = $('.jx-viz', el), q = $('.jx-query q', el), got = $('.jx-got span', el);
    viz.innerHTML = build();
    let i = 0;
    const show = s => { q.textContent = s.q; got.textContent = s.a; apply(viz, s); };
    if (reduce) { show(sets[0]); return; }
    apply(viz, null);
    setTimeout(() => {
      show(sets[0]);
      setInterval(() => {
        if (!live()) return;
        i = (i + 1) % sets.length;
        el.classList.add('swap'); apply(viz, null);
        setTimeout(() => { el.classList.remove('swap'); show(sets[i]); }, 420);
      }, every);
    }, delay);
  }

  const OPTS = ['FREEZE', 'UNFREEZE', 'SET_LIMIT', 'BLOCK_ATM', 'NONE'];
  const choiceSets = [
    ['freeze my card', [.89, .04, .03, .02, .02]],
    ['turn my card back on', [.05, .86, .02, .02, .05]],
    ['cap it at 200 a day', [.03, .02, .84, .04, .07]],
    ['hmm', [.04, .03, .02, .03, .88]],
  ].map(([q, p]) => {
    const w = p.indexOf(Math.max(...p));
    const probs = OPTS.map((o, k) => `"${o}":${p[k]}`).join(',');
    return { q, p, w, a: `{"type":"choice","choice":"${OPTS[w]}","confidence":${p[w]},"probabilities":{${probs}}}` };
  });
  loop('jx-choice', choiceSets,
    () => OPTS.map(o => `<div class="jx-brow"><span>${o}</span><i><b></b></i><em></em></div>`).join(''),
    (viz, s) => viz.querySelectorAll('.jx-brow').forEach((r, k) => {
      r.classList.toggle('win', !!s && k === s.w);
      r.querySelector('b').style.transform = `scaleX(${s ? s.p[k] : 0})`;
      r.querySelector('em').textContent = s ? f2(s.p[k]) : '';
    }), 4200, 300);

  const noulSets = [['freeze my card', .82], ['block Parcelhub', .31], ['lock it for now', .74], ['what did I spend', .03]]
    .map(([q, v]) => ({ q, v, a: `{"type":"noul","noul":${v}}` }));
  loop('jx-noul', noulSets,
    () => `<div class="jx-meter"><i><b></b></i><u title="0.50"></u></div>
      <div class="jx-mscale"><span>0</span><span>0.50</span><span>1</span></div>
      <div class="jx-verdict"><em></em><span></span></div>`,
    (viz, s) => {
      viz.querySelector('.jx-meter b').style.transform = `scaleX(${s ? s.v : 0})`;
      const v = viz.querySelector('.jx-verdict'), pass = s && s.v >= R.act;
      v.className = 'jx-verdict' + (s ? (pass ? ' yes' : ' no') : '');
      v.querySelector('em').textContent = s ? f2(s.v) : '';
      v.querySelector('span').innerHTML = s ? (pass ? Icon('check', 12) + 'passes' : Icon('x', 12) + 'doesn’t pass') : '';
    }, 3700, 1400);

  const LEVELS = ['lookup', 'aggregation', 'comparison'];
  const scoreSets = [
    ['last coffee charge?', .02, .98, { 0: .99, 1: .01 }],
    ['food spend this month', .51, .93, { 0: .02, 1: .96, 2: .02 }],
    ['food this month vs last', .97, .95, { 1: .05, 2: .95 }],
  ].map(([q, v, c, pr]) => ({ q, v, lvl: Math.round(v * 2),
    a: `{"type":"score","score":${v},"confidence":${c},"probabilities":{${Object.entries(pr).map(([k, x]) => `"${k}":${x}`).join(',')}}}` }));
  loop('jx-score', scoreSets,
    () => `<div class="jx-scale"><i></i>${LEVELS.map((_, k) => `<u style="left:${k * 50}%"></u>`).join('')}<b></b></div>
      <div class="jx-slabels">${LEVELS.map(l => `<span>${l}</span>`).join('')}</div>
      <div class="jx-verdict"><em></em><span></span></div>`,
    (viz, s) => {
      const m = viz.querySelector('.jx-scale b');
      m.style.left = `${(s ? s.v : 0.5) * 100}%`;
      m.classList.toggle('dim', !s);
      viz.querySelectorAll('.jx-slabels span').forEach((l, k) => l.classList.toggle('on', !!s && k === s.lvl));
      viz.querySelector('.jx-verdict em').textContent = s ? f2(s.v) : '';
      viz.querySelector('.jx-verdict span').textContent = s ? `query_complexity · ${LEVELS[s.lvl]}` : '';
    }, 4600, 2400);

  /* ── 2. one call, step by step ──────────────────────────────────────── */
  const EXAMPLES = ['freeze my card', 'forgot', 'atm', 'find an atm near me', 'change my mailing address', 'I think my card was stolen'];
  const CARDS = ['c1', 'c2', 'c5'].map(id => D.card(id)).filter(Boolean);
  const TOTAL_Q = 85;

  const actId = id => 'act_' + (id === 'REPORT_LOST' ? 'report_lost_stolen' : id.toLowerCase());
  const routeId = id => ({ REPORT_LOST: 'REPORT_LOST_STOLEN', SPEND_INSIGHT: 'QUERY_SPEND' }[id] || id);
  const screenId = s => s;   // the demo's screen names; the real option ids aren't shown here
  // Real instruction text where the project shows it; the rest is elided rather than made up.
  const NOUL_Q = { FREEZE: 'Does the user want a whole card frozen, locked, paused or blocked …' };


  // Normalise a {option: weight} map into probabilities rounded to 2 places, largest first.
  function dist(w) {
    const tot = Object.values(w).reduce((a, b) => a + b, 0) || 1;
    return Object.entries(w).map(([k, v]) => [k, Math.round(v / tot * 100) / 100]).sort((a, b) => b[1] - a[1]);
  }

  function explain(text) {
    const d = J.decide(text); // the same verdict the live demo shows
    const kinds = d.scores.filter(s => s.type === 'kind'), hands = d.scores.filter(s => s.type === 'handoff');
    const acts = kinds.filter(s => s.id !== 'SPEND_INSIGHT').slice(0, 4).map(s => ({ qid: actId(s.id), id: s.id, p: s.p, s }));

    // route: IN_SCOPE spread over the kinds (sharpened), OUT_OF_SCOPE, and NONE for what's left.
    const IN = d.route.IN_SCOPE, OOS = d.route.OUT_OF_SCOPE, sharp = kinds.reduce((a, s) => a + s.p ** 4, 0) || 1;
    const rw = {};
    kinds.forEach(s => (rw[routeId(s.id)] = IN * s.p ** 4 / sharp));
    rw.OUT_OF_SCOPE = OOS; rw.NONE = Math.max(0.02, 1 - IN - OOS);
    const route = dist(rw), rp = Object.fromEntries(route);

    // handoff_screen: each screen by its score, NONE for the rest.
    const hw = {};
    hands.forEach(h => (hw[screenId(J.HANDOFFS[h.id].screen)] = h.p ** 2));
    hw['no screen'] = Math.max(0.02, 1 - Math.max(...hands.map(h => h.p)));
    const handoff = dist(hw);

    // card_any: a named card, "all", else NO_MATCH (the screen's card still wins below).
    const t = text.toLowerCase(), named = CARDS.find(c => t.includes(c.name.toLowerCase()));
    const cw = {}; CARDS.forEach(c => (cw[c.id] = 0.03)); cw['*ALL*'] = /\b(all|every|both)\b/.test(t) ? 0.9 : 0.04; cw.NO_MATCH = 0.84;
    if (named) { cw[named.id] = 0.96; cw.NO_MATCH = 0.02; }
    if (cw['*ALL*'] > 0.5) cw.NO_MATCH = 0.03;
    const card = dist(cw);

    const pick = named ? D.tag(named) + ' · named' : cw['*ALL*'] > 0.5 ? 'all cards · *ALL*' : CARDS.length === 1 ? D.tag(CARDS[0]) + ' · only card' : `ask · ${CARDS.length} cards, none named`;
    return { text, d, acts, route, rp, handoff, card, pick, oosNoul: OOS, kinds };
  }

  /* request JSON as highlighted lines */
  const K = k => `<span class="k">"${esc(k)}"</span>`, S = s => `<span class="s">"${esc(s)}"</span>`;
  const N = n => `<span class="n">${n}</span>`, P = p => `<span class="p">${p}</span>`, C = c => `<span class="c">${esc(c)}</span>`;
  const kv = (k, v) => `${K(k)}${P(':')} ${v}`;
  const obj = pairs => `${P('{')}${pairs.join(P(', '))}${P('}')}`;

  function requestLines(x) {
    const today = new Date(); today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
    const L = [];
    const add = (i, h) => L.push({ i, h });
    add(0, P('{'));
    add(1, kv('model', S('jev-1.13.0')) + P(','));
    add(1, kv('state', P('{')));
    add(2, kv('query', S(x.text)) + P(','));
    add(2, kv('screen', S('HOME')) + P(','));
    add(2, kv('cards', P('[')));
    CARDS.forEach((c, k) => add(3, obj([kv('cardId', S(c.id)), kv('displayName', S(c.name)), kv('last4', S(c.last4)), kv('isFreezed', N(!!c.frozen))]) + (k < CARDS.length - 1 ? P(',') : '')));
    add(2, P('],'));
    add(2, kv('selected_card_id', N('null')) + P(','));
    add(2, kv('locale', S('en-US')) + P(','));
    add(2, kv('today', S(today.toISOString().slice(0, 10))));
    add(1, P('},'));
    add(1, kv('questions', P('{')));
    add(2, kv('route', obj([kv('type', S('choice')), kv('instructions', S('Which single option best describes the user’s primary request? …')),
      kv('criteria', obj([kv('FREEZE', S('Freeze, lock or block a whole card.')), C('… 16 more'), kv('NONE', S("None of the other options describe the user's request."))]))])) + P(','));
    x.acts.forEach(a => add(2, kv(a.qid, obj([kv('type', S('noul')), kv('instructions', NOUL_Q[a.id] ? S(NOUL_Q[a.id]) : C('…'))])) + P(',')));
    add(2, kv('card_any', obj([kv('type', S('choice')), kv('instructions', S('Which of the user’s cards is this request about? NO_MATCH when the message names none.')), kv('criteria', obj([...CARDS.map(c => kv(c.id, S(D.tag(c)))), kv('*ALL*', S('All of the user’s cards at once …')), kv('NO_MATCH', S('No specific card is identifiable from the message.'))]))])) + P(','));
    add(2, kv('out_of_scope', obj([kv('type', S('noul')), kv('instructions', C('…'))])) + P(','));
    add(2, kv('handoff_screen', obj([kv('type', S('choice')), kv('criteria', C('{ one option per app screen … }'))])) + P(','));
    add(2, kv('query_complexity', obj([kv('type', S('score')), kv('criteria', `${P('[')}${S('a single lookup')}${P(', ')}${S('an aggregation')}${P(', ')}${S('a comparison')}${P(']')}`)])) + P(','));
    const shown = 5 + x.acts.length;
    add(2, C(`… ${TOTAL_Q - shown} more questions`));
    add(1, P('}'));
    add(0, P('}'));
    return L;
  }

  /* answers as rows: id · type · mini bar · value */
  function answerRows(x) {
    const bar = (v, tick) => `<i class="jx-mini">${tick != null ? `<u style="left:${tick * 100}%"></u>` : ''}<b data-v="${v}"></b></i>`;
    const rows = [];
    const top = x.route[0];
    const routeOpts = x.route.slice(0, 3).concat(x.route.filter(([k]) => (k === 'OUT_OF_SCOPE' || k === 'NONE') && !x.route.slice(0, 3).some(r => r[0] === k)));
    rows.push(`<div class="jx-arow jx-route"><code>route</code><span class="t">choice</span><em>${esc(top[0])} ${f2(top[1])}</em>
      <div class="jx-opts">${routeOpts.map(([k, v], n) => `<div class="jx-brow sm${n === 0 ? ' win' : ''}"><span>${esc(k)}</span><i><b data-v="${v}"></b></i><em>${f2(v)}</em></div>`).join('')}</div></div>`);
    x.acts.forEach(a => rows.push(`<div class="jx-arow${a.p >= R.act ? ' hi' : ''}"><code>${a.qid}</code><span class="t">noul</span>${bar(a.p, R.act)}<em>${f2(a.p)}</em></div>`));
    const c = x.card[0];
    rows.push(`<div class="jx-arow"><code>card_any</code><span class="t">choice</span>${bar(c[1])}<em>${esc(c[0])} ${f2(c[1])}</em></div>`);
    rows.push(`<div class="jx-arow${x.oosNoul >= R.oosNoul ? ' hi' : ''}"><code>out_of_scope</code><span class="t">noul</span>${bar(x.oosNoul, R.oosNoul)}<em>${f2(x.oosNoul)}</em></div>`);
    const h = x.handoff[0];
    rows.push(`<div class="jx-arow"><code>handoff_screen</code><span class="t">choice</span>${bar(h[1], R.handoff)}<em>${esc(h[0])} ${f2(h[1])}</em></div>`);
    const qc = x.kinds[0] && x.kinds[0].id === 'SPEND_INSIGHT' ? 0.5 : 0.02;
    rows.push(`<div class="jx-arow"><code>query_complexity</code><span class="t">score</span>${bar(qc)}<em>${f2(qc)}</em></div>`);
    return rows;
  }

  /* decision checks, in order, with the real constants; pass/fail follows the simulated verdict */
  function checks(x) {
    const d = x.d, v = d.verdict, act = v === 'ACTION', top = act ? d.top : x.acts[0] && x.acts[0].s;
    const none = x.rp.NONE || 0, oos = x.rp.OUT_OF_SCOPE || 0;
    const L = [];
    const add = (state, rule, val) => L.push({ state, rule, val });
    add(none >= R.none || v === 'AMBIGUOUS' ? 'yes' : 'no', `route NONE ≥ ${f2(R.none)} → veto`, `NONE ${f2(none)}`);
    add(act ? 'yes' : 'no', `act_* ≥ ${f2(R.act)} passes`, top ? `${actId(top.id)} ${f2(top.p)}` : '—');
    if (act && top.highStakes) add('yes', `high stakes · ≥ ${f2(R.high)} or route ≥ ${f2(R.highRoute)}`, `${f2(top.p)} · route ${f2(x.rp[routeId(top.id)] || 0)}`);
    else add('skip', `high stakes · ≥ ${f2(R.high)} or route ≥ ${f2(R.highRoute)}`, top && top.highStakes ? 'nothing passed' : 'not high stakes');
    const gap = x.acts.length > 1 ? x.acts[0].p - x.acts[1].p : 1;
    if (x.acts[0].p < R.dym) add('skip', `two within ${f2(R.tie)} → route breaks tie`, 'no act_* near the bar');
    else add(gap < R.tie ? 'yes' : 'no', `two within ${f2(R.tie)} → route breaks tie`, `gap ${f2(gap)}`);
    const out = v === 'HANDOFF' || v === 'UNSUPPORTED';
    add(out ? 'yes' : 'no', `OUT_OF_SCOPE ≥ ${f2(R.oos)} · out_of_scope ≥ ${f2(R.oosNoul)}`, `${f2(oos)} · ${f2(x.oosNoul)}`);
    const h = x.handoff[0];
    if (out) add(v === 'HANDOFF' ? 'yes' : 'no', `handoff_screen ≥ ${f2(R.handoff)} names a screen`, v === 'HANDOFF' ? `${J.HANDOFFS[d.top.id].screen} ${f2(h[1])}` : `${h[0]} ${f2(h[1])}`);
    else add('skip', `handoff_screen ≥ ${f2(R.handoff)} names a screen`, 'not out of scope');
    if (act || out) add('skip', `did you mean · 2–3 options ≥ ${f2(R.dym)}`, 'already decided');
    else add(v === 'CANDIDATES' ? 'yes' : 'no', `did you mean · 2–3 options ≥ ${f2(R.dym)}`,
      v === 'CANDIDATES' ? d.candidates.map(c => `${c.label} ${f2(c.p)}`).join(' · ') : `${x.acts.filter(a => a.p >= R.dym).length} options`);
    if (act) {
      add('yes', 'card · screen → named ≥ 0.95 → only → *ALL* ≥ 0.60 → ask', x.pick);
      const K = J.KINDS[top.id], bar = top.id === 'UNFREEZE' ? R.laneUnfreeze : R.lane;
      const lane = K.reversible === false ? 'confirm · irreversible' : top.p >= bar ? 'act' : top.p >= R.confirm ? 'confirm' : 'ask';
      add('yes', `gate lane · act ≥ ${f2(R.lane)} (unfreeze ${f2(R.laneUnfreeze)}) · confirm ≥ ${f2(R.confirm)}`, `${f2(top.p)} → ${lane}`);
      x.lane = lane;
    } else {
      add('skip', 'card · screen → named → only → all → ask', 'no action');
      add('skip', `gate lane · act ≥ ${f2(R.lane)} · confirm ≥ ${f2(R.confirm)}`, 'no action');
    }
    return L;
  }

  function outcome(x) {
    const d = x.d;
    switch (d.verdict) {
      case 'ACTION': return { cls: 'act', code: `choice → ${routeId(d.top.id)}`, sub: `${d.top.label} · card: ${x.pick} · lane ${x.lane}` };
      case 'CANDIDATES': return { cls: 'dym', code: `did you mean: ${d.candidates.map(c => c.label).join(' · ')}`, sub: 'no clear winner · the person chooses' };
      case 'HANDOFF': return { cls: 'hand', code: `handoff → ${J.HANDOFFS[d.top.id].screen}`, sub: 'can’t do that here · button to the screen that can' };
      case 'UNSUPPORTED': return { cls: 'oos', code: 'out of scope → “can’t do that here”', sub: 'no screen fits · nothing substituted' };
      default: return { cls: 'null', code: 'choice → null · the phone asserts nothing', sub: d.verdict === 'AMBIGUOUS' ? 'route says NONE · no tray, no guess' : 'nothing passed · no guess' };
    }
  }

  /* ── walkthrough player ── */
  const walk = document.getElementById('jx-walk');
  const tabs = $('.jx-tabs', walk), pre = $('.jx-req pre', walk), rowsEl = $('.jx-rows', walk), checksEl = $('.jx-checks', walk);
  const outEl = $('.jx-out', walk), steps = [...walk.querySelectorAll('.jx-steps li')], replay = $('.jx-replay', walk);
  const CYCLE = 9000;
  let cur = 0, auto = !reduce, timers = [], elapsed = 0;

  replay.innerHTML = Icon('play', 11) + '<span>replay</span>';
  tabs.innerHTML = EXAMPLES.map((t, k) => `<button type="button" role="tab" id="jx-tab-${k}" aria-selected="false" tabindex="-1">${esc(t)}<i></i></button>`).join('');
  const tabBtns = [...tabs.querySelectorAll('button')];
  walk.classList.toggle('auto', auto);

  const later = (fn, ms) => timers.push(setTimeout(fn, reduce ? 0 : ms));
  const reveal = el => { el.classList.remove('jx-hide'); el.querySelectorAll('b[data-v]').forEach(b => (b.style.transform = `scaleX(${b.dataset.v})`)); };
  const step = n => steps.forEach((s, k) => { s.classList.toggle('on', k === n); s.classList.toggle('done', k < n); });

  function play(k) {
    timers.forEach(clearTimeout); timers = []; elapsed = 0;
    cur = k;
    tabBtns.forEach((b, n) => {
      const on = n === k; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1;
      if (on) { const i = b.querySelector('i'); i.replaceWith(i.cloneNode()); }
    });
    const x = explain(EXAMPLES[k]);
    const hide = reduce ? '' : ' jx-hide';

    pre.innerHTML = requestLines(x).map(l => `<span class="ln${hide}" style="--i:${l.i}">${l.h}</span>`).join('');
    rowsEl.innerHTML = answerRows(x).map(r => r.replace('class="jx-arow', `class="jx-arow${hide}`)).join('');
    checksEl.innerHTML = checks(x).map(c => `<li class="${c.state}${hide}"><span class="ic">${Icon(c.state === 'yes' ? 'check' : c.state === 'no' ? 'x' : 'minus', 12)}</span><b>${esc(c.rule)}</b><em>${esc(c.val)}</em></li>`).join('');
    const o = outcome(x);
    outEl.className = 'jx-out ' + o.cls + hide;
    outEl.querySelector('code').textContent = o.code;
    outEl.querySelector('small').textContent = o.sub;

    if (reduce) { walk.querySelectorAll('b[data-v]').forEach(b => (b.style.transform = `scaleX(${b.dataset.v})`)); step(4); return; }
    step(0);
    const lines = [...pre.querySelectorAll('.ln')];
    lines.forEach((l, n) => later(() => reveal(l), 60 + n * 42));
    const t1 = 200 + lines.length * 42;
    later(() => step(1), t1);
    const rows = [...rowsEl.children];
    rows.forEach((r, n) => later(() => reveal(r), t1 + 150 + n * 110));
    const t2 = t1 + 300 + rows.length * 110;
    later(() => step(2), t2);
    const cs = [...checksEl.children];
    cs.forEach((c, n) => later(() => reveal(c), t2 + 150 + n * 300));
    const t3 = t2 + 350 + cs.length * 300;
    later(() => { step(3); reveal(outEl); }, t3);
  }

  function select(k, user) {
    if (user && auto) { auto = false; walk.classList.remove('auto'); }
    play(k);
  }
  tabBtns.forEach((b, k) => b.addEventListener('click', () => select(k, true)));
  tabs.addEventListener('keydown', e => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const k = (cur + d + EXAMPLES.length) % EXAMPLES.length;
    select(k, true); tabBtns[k].focus();
  });
  replay.addEventListener('click', () => select(cur, true));

  // Autoplay: cycle every ~9 s of on-screen time until the visitor picks one.
  if (!reduce) setInterval(() => {
    if (!auto || !live()) return;
    elapsed += 250;
    if (elapsed >= CYCLE) play((cur + 1) % EXAMPLES.length);
  }, 250);

  // The first example replays the first time the walkthrough scrolls into view.
  let shown = false;
  onShow = () => { if (!shown && auto) { shown = true; play(cur); } };
  play(0);
})();
