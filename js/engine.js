/* The orchestrator: one turn in, UI blocks out.
 *
 *   phone → orchestrator → (Jev ∥ LLM) → safety gate → bank write → read-back → UI composer → phone
 *
 * Every hop is a timed "span" so the inspector can draw it. Latencies are
 * illustrative, randomised inside realistic ranges. */
(function () {
  const D = window.NovaData, { KINDS, HANDOFFS } = window.Jev;

  const bus = { h: {}, on(e, f) { (this.h[e] = this.h[e] || []).push(f); }, off(e, f) { this.h[e] = (this.h[e] || []).filter(x => x !== f); }, emit(e, d) { (this.h[e] || []).forEach(f => f(d)); } };
  const settings = { outage: false, jev: true, llm: true };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const rand = (a, b) => a + Math.random() * (b - a);
  const money = n => '$' + n.toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
  let traceN = 0, idN = 0;
  const log = (msg, level = 'info') => bus.emit('log', { msg, level });

  function newTrace(kind, label, replay, previewOnly) { const t = { id: ++traceN, kind, label, replay: !!replay, previewOnly: !!previewOnly, t0: performance.now() }; bus.emit('trace', t); return t; }

  async function span(trace, node, name, req, work, lat, opt = {}) {
    const from = opt.from || 'orch', start = performance.now() - trace.t0;
    bus.emit('hop', { from, to: node, trace: trace.id });
    await sleep(rand(lat[0], lat[1]));
    const s = { trace: trace.id, node, name, start, dur: performance.now() - trace.t0 - start, req, status: 'ok' };
    if (opt.fail) { s.status = 'timeout'; s.res = { error: opt.fail }; bus.emit('span', s); throw new Error(opt.fail); }
    s.res = work();
    bus.emit('span', s);
    bus.emit('hop', { from: node, to: from, trace: trace.id });
    return s.res;
  }

  const ctxOf = ctx => ({ screen: ctx.cardId ? 'CARD_DETAIL' : 'HOME', cardId: ctx.cardId || null });
  const visible = () => D.cards.filter(c => !c.archived && c.state !== 'CLOSED');

  // ── eligibility & card resolution ────────────────────────────────────────
  function eligible(kind, c) {
    const s = c.state;
    switch (kind) {
      case 'FREEZE': return c.frozen ? 'Already frozen' : s !== 'ACTIVE' ? (s === 'REPORTED' ? 'Reported lost' : 'Not active yet') : null;
      case 'UNFREEZE': return s === 'REPORTED' ? 'Reported lost — can’t be unfrozen' : c.frozen ? null : 'Not frozen';
      case 'ACTIVATE_CARD': return s === 'PENDING_ACTIVATION' ? null : 'Already active';
      case 'REPORT_LOST': return s === 'REPORTED' ? 'Already reported' : null;
      case 'BLOCK_ATM': return !c.atm ? 'ATM already off' : s !== 'ACTIVE' ? 'Not active yet' : null;
      default: return s === 'ACTIVE' ? null : s === 'REPORTED' ? 'Reported lost' : 'Activate it first';
    }
  }

  // Cheapest correct signal first: what the person picked, what they named,
  // the transaction or card on screen, the only card — and only then ask.
  // Scores may order the picker; they never remove a card from it.
  function resolveCard(item, ctx) {
    const p = item.params, one = (c, source) => {
      const why = eligible(item.kind, c);
      return why ? { source, error: `${D.tag(c)}: ${why}` } : { source, cards: [c] };
    };
    if (item.cardOverride) return one(D.card(item.cardOverride), 'PICKED');
    if (p.allCards) {
      const ok = visible().filter(c => !eligible(item.kind, c));
      const skipped = visible().filter(c => eligible(item.kind, c)).map(c => `${D.tag(c)} (${eligible(item.kind, c)})`);
      return ok.length ? { source: 'ALL_CARDS', cards: ok, allCards: true, skipped } : { source: 'ALL_CARDS', error: 'None of your cards can do that right now' };
    }
    if (p.cardId) return one(D.card(p.cardId), 'NAMED');
    if (item.kind === 'RAISE_DISPUTE' && p.txn) return one(D.card(p.txn.cardId), 'CONTEXT_TRANSACTION');
    if (ctx.cardId) return one(D.card(ctx.cardId), 'CONTEXT_CARD');
    if (item.carried) return one(D.card(item.carried), 'CARRIED_FROM_EARLIER_PART');
    if (D.cards.length === 1) return one(D.cards[0], 'SINGLE_CARD');
    // Archived / closed cards are omitted (nothing can act on them). Cards merely
    // ineligible for THIS action stay listed, dimmed, with their reason.
    return { source: 'NEEDS_PICK', options: visible().map(c => ({ card: c, reason: eligible(item.kind, c) })) };
  }

  // The LLM may propose values; only values from known sets or sane ranges pass.
  function sanitize(kind, s) {
    const p = { cardId: s.cardId, allCards: s.allCards };
    if (s.amount != null && s.amount >= 1 && s.amount <= 100000) p.amount = s.amount;
    if (s.merchant && D.merchants.includes(s.merchant)) p.merchant = s.merchant;
    if (s.country && D.countries.includes(s.country)) p.country = s.country;
    if (s.dates && s.dates.start <= s.dates.end) p.dates = s.dates;
    if (kind === 'RAISE_DISPUTE' && p.merchant) p.txn = D.txns.find(t => t.merchant === p.merchant);
    return p;
  }

  function nextNeed(item, ctx) {
    const K = KINDS[item.kind];
    for (const s of K.slots || []) if (item.params[s] == null) return { need: 'slot', slot: s };
    if (!item.res || item.res.source === 'NEEDS_PICK') item.res = resolveCard(item, ctx);
    if (item.res.error) return { need: 'fail', reason: item.res.error };
    if (item.res.source === 'NEEDS_PICK') return { need: 'card' };
    if ((!K.reversible || item.res.allCards) && !item.confirmed) return { need: 'confirm' };
    return { need: null };
  }

  // ── simulated bank ───────────────────────────────────────────────────────
  const Bank = {
    write(op, ids, p) {
      for (const id of ids) {
        const c = D.card(id);
        switch (op) {
          case 'FREEZE': c.frozen = true; break;
          case 'UNFREEZE': c.frozen = false; break;
          case 'SET_LIMIT': c.limit = p.amount; break;
          case 'REMOVE_LIMIT': c.limit = null; break;
          case 'BLOCK_MERCHANT': if (!c.blocked.includes(p.merchant)) c.blocked.push(p.merchant); break;
          case 'UNBLOCK_MERCHANT': c.blocked = c.blocked.filter(m => m !== p.merchant); break;
          case 'ALLOW_COUNTRY': c.allow.push({ country: p.country, window: p.dates || null }); break;
          case 'RESTRICT_TO_ALLOW_LIST': c.intlRestricted = true; break;
          case 'CLEAR_INTERNATIONAL': c.allow = c.allow.filter(a => a.country !== p.country); c.intlRestricted = c.allow.length > 0; break;
          case 'BLOCK_ATM': c.atm = false; break;
          case 'ALLOW_ATM': c.atm = true; break;
          case 'ACTIVATE_CARD': c.state = 'ACTIVE'; break;
          case 'REPORT_LOST': c.state = 'REPORTED'; c.frozen = true; break;
          case 'RAISE_DISPUTE': c.disputes.push(p.txn.id); break;
        }
      }
      return { accepted: true, ref: 'op_' + Math.random().toString(36).slice(2, 8) };
    },
    read: ids => ids.map(id => JSON.parse(JSON.stringify(D.card(id)))),
    verify(op, snap, p) {
      return snap.every(c => ({
        FREEZE: c.frozen, UNFREEZE: !c.frozen, SET_LIMIT: c.limit === p.amount, REMOVE_LIMIT: c.limit == null,
        BLOCK_MERCHANT: c.blocked.includes(p.merchant), UNBLOCK_MERCHANT: !c.blocked.includes(p.merchant),
        SET_INTERNATIONAL: c.intlRestricted && c.allow.some(a => a.country === p.country && JSON.stringify(a.window) === JSON.stringify(p.dates || null)),
        CLEAR_INTERNATIONAL: !c.allow.some(a => a.country === p.country), BLOCK_ATM: !c.atm, ALLOW_ATM: c.atm,
        ACTIVATE_CARD: c.state === 'ACTIVE', REPORT_LOST: c.state === 'REPORTED', RAISE_DISPUTE: c.disputes.includes(p.txn && p.txn.id),
      })[op]);
    },
  };

  // ── turn state ───────────────────────────────────────────────────────────
  const queue = [];   // items waiting on the person: a value, a card, or a confirm
  const undoable = {}; // actionId → { item, at }
  const UNDO_MS = 30 * 60 * 1000;

  async function execute(trace, item) {
    const ids = item.res.cards.map(c => c.id), p = item.params;
    const write = op => span(trace, 'bank', `Bank · ${op} · timing simulated`, { op, cards: ids, params: pub(p) }, () => Bank.write(op, ids, p), [110, 240], { from: 'safety' });
    if (item.kind === 'SET_INTERNATIONAL') {
      log('international: allow the country FIRST, then restrict — the reverse order could strand a card at home if step 2 failed');
      await write('ALLOW_COUNTRY'); await write('RESTRICT_TO_ALLOW_LIST');
    } else await write(item.kind);
    const snap = await span(trace, 'bank', 'Bank · read-back · timing simulated', { cards: ids }, () => Bank.read(ids), [60, 140], { from: 'safety' });
    if (!Bank.verify(item.kind, snap, p)) { log('read-back did not confirm the write → shown as failed, never ✓', 'warn'); return { t: 'failed', item, reason: 'The bank didn’t confirm the change, so it isn’t shown as done.' }; }
    log(`read-back confirms ${item.kind} on ${ids.length} card(s) → ✓`, 'ok');
    const out = { t: 'done', item };
    bus.emit('activity', { item, title: title(item, true) });
    if (KINDS[item.kind].reversible) { out.actionId = 'a' + ++idN; undoable[out.actionId] = { item, at: Date.now() }; }
    return out;
  }

  async function advance(trace, item, ctx) {
    const n = nextNeed(item, ctx);
    const i = queue.indexOf(item);
    if (n.need === 'fail') { if (i >= 0) queue.splice(i, 1); log(`not substituted: ${n.reason}`, 'warn'); return { t: 'failed', item, reason: n.reason }; }
    if (n.need) {
      item.waiting = n; if (i < 0) queue.push(item);
      log(`${item.kind}: waiting for ${n.need === 'slot' ? n.slot : n.need}${n.need === 'confirm' ? ' (irreversible or many cards — always asks)' : ''}`);
      return { t: 'ask', item };
    }
    if (i >= 0) queue.splice(i, 1);
    return execute(trace, item);
  }

  const pub = p => { const o = {}; for (const k in p) if (p[k] != null && k !== 'txn') o[k] = p[k]; if (p.txn) o.txn = p.txn.id; return o; };

  function splitParts(text) {
    const parts = text.split(/\s*(?:,\s*)?\b(?:and then|and also|then|and)\b\s*|\s*;\s*/i).map(s => s.trim()).filter(Boolean);
    if (parts.length < 2 || !parts.every(p => Jev.strength(p) >= 2.5)) return [text];
    // Only a request that changes something is split; "food by month and by card" is one question.
    const acts = parts.filter(p => { const d = Jev.decide(p, { strict: true }); return d.top && KINDS[d.top.id] && !KINDS[d.top.id].read; });
    return acts.length ? parts : [text];
  }

  // ── insights: a warm in-memory snapshot + a pure chart builder ─────────
  // The snapshot is loaded when the sheet opens, fresh for 120 s, and a stale
  // copy may be served for up to 30 min while one background refresh runs.
  // Concurrent readers share ONE bank read (single flight).
  const SNAP = { at: 0, inflight: null, FRESH: 120e3, STALE: 30 * 60e3 };
  function loadSnapshot(trace, why) {
    if (SNAP.inflight) { log('snapshot: joined the read already in flight — no second bank call', 'dim'); return SNAP.inflight; }
    const t = trace || newTrace('background', why);
    SNAP.inflight = span(t, 'bank', 'Bank · read 6 months', { window: '6 months', why }, () => ({ transactions: D.txns.length }), [60, 75], { from: 'insight' })
      .then(r => { SNAP.at = Date.now(); SNAP.inflight = null; log(`snapshot loaded: ${r.transactions} transactions, 1 bank read (${why})`, 'ok'); return r; });
    return SNAP.inflight;
  }
  async function snapshot(trace) {
    const age = Date.now() - SNAP.at;
    if (SNAP.at && age < SNAP.FRESH) return { cache: 'hit', age };
    if (SNAP.at && age < SNAP.STALE) { loadSnapshot(null, 'refresh in background'); return { cache: 'stale-served', age }; }
    await loadSnapshot(trace, 'cold start'); return { cache: 'miss' };
  }
  const SPENDY = /\b(spend|spent|spending|how much|money|merch\w*|merhc\w*|where did|breakdown|subscriptions?|recurring|unusual|strange|suspicious|limit left|left to spend|how often|which days?|weekday|weekend|compare|vs|versus|top|biggest|trend|per (week|month)|changed|usual|normal|a lot|on track|pace|by card|declined?|declines|rejected|calendar|break down)\b/i;
  const chartCache = new Map(); // text|card → { panel, at }, kept 60 s so the sent answer reuses the typed numbers
  async function insight(trace, text, ctx, typing) {
    if (!settings.jev || settings.outage) return { panel: null, reason: 'Jev unavailable → no chart' };
    return Promise.resolve().then(async () => {
      if (!SPENDY.test(text)) return { panel: null, reason: 'not a spending question' };
      const key = text.trim().toLowerCase() + '|' + (ctx.cardId || '*'), hit = chartCache.get(key);
      if (!typing && hit && Date.now() - hit.at < 60e3) { log(`chart reused from the typing cache (${Math.round((Date.now() - hit.at) / 1000)} s old) — same numbers you saw while typing`, 'ok'); return { panel: hit.panel, cache: 'typing-cache', ms: 'typed' }; }
      const [snap, read] = await Promise.all([snapshot(trace),
        span(trace, 'insight', `Jev · which chart? · ${typing ? 'keystroke' : 'turn'}`, { text, ask: 'subjects · period · split · by' }, () => Insights.read(text), jevLat())]);
      const t0 = performance.now();
      const panel = await span(trace, 'insight', 'Insights · code draws the chart', { read, snapshot: snap.cache }, () => { const ps = Insights.buildAll(text, ctx); Object.defineProperty(ps[0], 'pages', { value: ps, enumerable: false }); return ps[0]; }, [3, 11]);
      chartCache.set(key, { panel, at: Date.now() });
      return { panel, cache: snap.cache, ms: Math.round(performance.now() - t0) };
    });
  }

  // Jev answers in one batched call: the action AND its values (amount, merchant, dates, card).
  // Measured warm: p50 ≈ 450 ms, p95 ≈ 0.6–1.1 s; the first call of a session also opens the connection.
  let jevWarm = false;
  function jevLat() {
    const cold = !jevWarm; jevWarm = true;
    return cold ? [650, 800] : Math.random() < 0.08 ? [880, 1150] : [390, 560];
  }
  async function decideAll(trace, parts, text, ctx) {
    const { jev, outage } = settings;
    const tag = trace.replay ? 'recorded' : 'live';
    const insightP = parts.length === 1 ? insight(trace, text, ctx) : Promise.resolve({ panel: null });
    const req = { source: trace.replay ? 'recorded fixture' : 'live call', parts, questions: '≈ 44 per part, one batch', catalogue: Object.keys(KINDS).length + ' actions + ' + Object.keys(HANDOFFS).length + ' screens' };
    try {
      if (!jev) await span(trace, 'jev', 'Jev · unavailable', req, null, [20, 40], { fail: 'no connection' });
      if (outage) {
        try { await span(trace, 'jev', `Jev · ${tag} · attempt 1`, req, null, [4950, 5050], { fail: 'timeout · 5.0 s' }); }
        catch (e) { log('Jev: attempt 1 timed out after 5.0 s → one retry after 0.25 s (2.0 s kept in reserve)', 'warn'); await sleep(250); }
        await span(trace, 'jev', `Jev · ${tag} · retry`, req, null, [1700, 1750], { fail: 'timeout · 7.0 s budget spent' });
      }
      const [j, ins] = await Promise.all([
        span(trace, 'jev', `Jev · ${tag} · decide + values`, req, () => ({ decisions: parts.map(p => Jev.decide(p)), slots: parts.map(p => Slots.extract(p)) }), jevLat()),
        insightP]);
      return { ...j, insight: ins };
    } catch (e) {
      // There is no second decider: say so plainly and link to the screen that can do it.
      log('Jev unavailable → no fallback decider: the phone says so and links to the screen that can do it', 'warn');
      await span(trace, 'rules', 'Fallback · link to the right screen', { reason: e.message }, () => ({ reply: 'outage', link: 'Card settings' }), [3, 8]);
      return { outage: true };
    }
  }

  // ── rate limit: a token bucket per visitor, the way a real gateway would ──
  const bucket = (cap, perMin) => ({ cap, tokens: cap, rate: perMin / 60000, at: performance.now(),
    take() { const now = performance.now(); this.tokens = Math.min(this.cap, this.tokens + (now - this.at) * this.rate); this.at = now; if (this.tokens < 1) return false; this.tokens -= 1; return true; },
    wait() { return Math.ceil((1 - this.tokens) / this.rate / 1000); } });
  const LIMITS = { turn: bucket(20, 20), keystroke: bucket(90, 90) };

  // ── public: a full turn ──────────────────────────────────────────────────
  async function message(turn, ctx) {
    const trace = newTrace('turn', turn.display || turn.text, turn.replay);
    settings.replay = trace.replay;
    bus.emit('mode', { replay: trace.replay });
    if (!trace.replay && !LIMITS.turn.take()) {
      try { await span(trace, 'orch', 'gateway · 429 rate limited', { limit: '20 turns / min / visitor' }, null, [2, 5], { from: 'phone', fail: `429 · retry in ${LIMITS.turn.wait()} s` }); } catch (e) { /* expected */ }
      log(`rate limited: 20 turns / min per visitor → 429, nothing reached Jev (retry in ${LIMITS.turn.wait()} s)`, 'warn');
      return [{ type: 'ANSWER', text: `You’re going a bit fast — try again in ${LIMITS.turn.wait()} seconds.` }];
    }
    await span(trace, 'orch', 'receive turn', { ...turn, context: ctxOf(ctx) }, () => ({ accepted: true }), [3, 9], { from: 'phone' });
    let results;
    if (turn.confirm || turn.cancel) results = await onConfirm(trace, turn, ctx);
    else if (turn.undo) results = await onUndo(trace, turn.undo);
    else results = await onText(trace, turn, ctx);
    const head = queue[0];
    if (head && !results.some(r => r.item === head)) results.push({ t: 'ask', item: head, followUp: true });
    const blocks = await span(trace, 'composer', 'UI composer', { results: results.map(r => ({ t: r.t, kind: r.item && r.item.kind, visual: r.panel && r.panel.visual })) }, () => compose(results), [4, 14]);
    const used = results.find(r => r.t === 'done' && r.item.res && r.item.res.cards && r.item.res.cards.length === 1);
    if (used) blocks.usesCard = '••' + used.item.res.cards[0].last4;
    bus.emit('turnDone', { trace: trace.id });
    return blocks;
  }

  async function onText(trace, turn, ctx) {
    const head = queue[0];
    if (head && turn.pick && head.waiting.need === 'card') {
      head.cardOverride = turn.cardOverride; head.res = null;
      log(`card picked by the person: ${D.tag(D.card(turn.cardOverride))}`);
      return [await advance(trace, head, ctx)];
    }
    if (head && head.waiting.need === 'slot') {
      const s = await span(trace, 'jev', 'Jev · read the waiting value', { text: turn.text, want: head.waiting.slot }, () => Slots.extract(turn.text), jevLat());
      const v = sanitize(head.kind, s)[head.waiting.slot];
      if (v != null) {
        head.params[head.waiting.slot] = v; if (head.kind === 'RAISE_DISPUTE') head.params.txn = sanitize(head.kind, s).txn;
        log(`pending plan resumed: ${head.waiting.slot} = ${v}`);
        return [await advance(trace, head, ctx)];
      }
      log('reply did not fill the waiting value → treated as a new request; pending plan dropped', 'warn');
    }
    queue.length = 0;

    const parts = splitParts(turn.text);
    if (parts.length > 1) log(`split into ${parts.length} parts — each gets its own row, in the order asked`);
    const decided = await decideAll(trace, parts, turn.text, ctx);
    if (decided.outage) { bus.emit('scores', { outage: true }); return [{ t: 'outage' }]; }
    const { decisions, slots, insight: ins } = decided;
    bus.emit('scores', { decisions, parts });

    const items = await span(trace, 'safety', 'Safety gate', { proposals: decisions.map((d, i) => ({ verdict: d.verdict, choice: d.top && d.top.id, p: d.top && d.top.p, slots: slots[i] })) }, () => {
      let carried = turn.cardOverride || null;
      return decisions.map((d, i) => {
        const it = { id: 'i' + ++idN, text: parts[i], d };
        if (d.verdict !== 'ACTION') return it;
        if (!KINDS[d.top.id]) { it.d = { ...d, verdict: 'UNSUPPORTED' }; return it; }
        it.kind = d.top.id; it.params = sanitize(it.kind, slots[i]);
        if (turn.cardOverride && !it.params.cardId) it.cardOverride = turn.cardOverride;
        else if (carried && !it.params.cardId && !it.params.allCards && i > 0) it.carried = carried;
        if (it.params.cardId) carried = it.params.cardId;
        return it;
      });
    }, [1, 4]);

    const results = [];
    for (const it of items) {
      const v = it.d.verdict;
      log(`${v}: ${it.d.reason}`, v === 'ACTION' ? 'ok' : 'info');
      if (v === 'ACTION' && KINDS[it.kind].read) {
        if (ins.panel) { log(`composer: ${ins.panel.visual} — ${ins.panel.why}`); ins.panel.ladder.forEach(x => log('fallback ladder · ' + x, 'dim')); results.push({ t: 'insight', panel: ins.panel, built: ins.ms }); }
        else results.push({ t: 'none', item: it, d: it.d });
      } else if (v === 'ACTION') {
        if (it.carried) log(`${it.kind}: card carried from the earlier part of the same message`);
        const r = await advance(trace, it, ctx);
        if (r.t === 'ask' && results.some(x => x.t === 'ask')) r.t = 'waiting';
        results.push(r);
      } else results.push({ t: v.toLowerCase(), item: it, d: it.d });
    }
    // The LLM only ever writes words: an answer's headline, then Jev checks it. Never decides, never on writes.
    const answer = results.find(r => r.t === 'insight');
    if (answer) {
      if (!settings.llm) log('LLM off → the templated headline is used; nothing else changes', 'dim');
      else {
        try {
          const head = await span(trace, 'llm', 'LLM · word the headline', { facts: answer.panel.takeaway, rule: 'numbers only as {fN} placeholders' }, () => ({ headline: answer.panel.takeaway }), [600, 900], { fail: settings.outage && 'no words within 1.5 s' });
          await span(trace, 'jev', 'Jev · check the wording', { headline: head.headline }, () => ({ keep: true }), jevLat());
        } catch (e) { log('LLM: no words within the 1.5 s cap → templated headline, the answer is not held up', 'warn'); }
      }
    }
    return results;
  }

  async function onConfirm(trace, turn, ctx) {
    const item = queue.find(x => x.id === (turn.confirm || turn.cancel));
    if (!item) return [{ t: 'failed', reason: 'That request has expired — ask again.' }];
    if (turn.cancel) { queue.splice(queue.indexOf(item), 1); log('cancelled by the person — nothing written'); return [{ t: 'cancelled', item }]; }
    await span(trace, 'safety', 'Safety gate · confirm token', { item: item.id, kind: item.kind }, () => ({ valid: true }), [1, 3]);
    item.confirmed = true;
    return [await advance(trace, item, ctx)];
  }

  async function onUndo(trace, actionId) {
    const rec = undoable[actionId];
    if (!rec || Date.now() - rec.at > UNDO_MS) return [{ t: 'failed', reason: 'The undo window for that change has passed.' }];
    delete undoable[actionId];
    const { item } = rec, op = KINDS[item.kind].undo, ids = item.res.cards.map(c => c.id);
    await span(trace, 'safety', 'Safety gate · undo', { actionId, reverse: op }, () => ({ allowed: true }), [1, 3]);
    await span(trace, 'bank', `Bank · ${op} · timing simulated`, { op, cards: ids }, () => Bank.write(op, ids, item.params), [110, 220], { from: 'safety' });
    const snap = await span(trace, 'bank', 'Bank · read-back · timing simulated', { cards: ids }, () => Bank.read(ids), [60, 130], { from: 'safety' });
    return Bank.verify(op, snap, item.params) ? [{ t: 'undone', item }] : [{ t: 'failed', item, reason: 'The bank didn’t confirm the undo.' }];
  }

  // ── public: a keystroke (only Jev answers: one call for the tray, one for the chart; no LLM, no writes) ──
  async function intent(text, ctx, replay) {
    const trace = newTrace('typing', text, replay);
    if (!settings.jev) return { outage: true, off: true };
    if (!replay && !LIMITS.keystroke.take()) { log('keystroke rate limit (90 / min) → skipped, no tray', 'dim'); return { outage: true, off: true, limited: true }; }
    if (settings.outage) {
      try { await span(trace, 'jev', 'Jev · keystroke', { text }, null, [2450, 2550], { fail: 'no answer within 2.5 s → tray stays empty' }); } catch (e) { /* expected */ }
      return { outage: true };
    }
    const [d, ins] = await Promise.all([
      span(trace, 'jev', `Jev · ${replay ? 'recorded' : 'live'} · keystroke`, { source: replay ? 'recorded fixture' : 'live call', text, context: ctxOf(ctx) }, () => Jev.decide(text), jevLat()),
      insight(trace, text, ctx, true),
    ]);
    const pres = present(d, text, ctx);
    if (pres.type === 'READ') pres.panel = ins.panel;
    return { decision: d, presentation: pres };
  }

  function present(d, text, ctx) {
    if (d.verdict === 'CANDIDATES') return { type: 'CANDIDATES', items: d.candidates.map(c => ({ label: c.label, icon: c.icon, p: c.p })), oneTapAllowed: false };
    if (d.verdict === 'HANDOFF') return { type: 'HANDOFF', ...HANDOFFS[d.top.id], p: d.top.p };
    if (d.verdict !== 'ACTION') return { type: 'NONE', reason: d.reason };
    const K = KINDS[d.top.id];
    if (K.read) return { type: 'READ', label: K.label, icon: K.icon, p: d.top.p };
    const s = Slots.extract(text);
    const item = { kind: d.top.id, params: { cardId: s.cardId, allCards: s.allCards } };
    const res = resolveCard(item, ctx);
    return { type: 'ACTION', kind: item.kind, label: K.label, icon: K.icon, pattern: K.pattern, p: d.top.p, cardSource: res.source, res,
      needsCardPick: res.source === 'NEEDS_PICK', requiresFullConfirm: !K.reversible || !!res.allCards,
      oneTapAllowed: K.reversible && !res.allCards && !!res.cards && !(K.slots || []).length };
  }

  // ── UI composer: results → blocks the phone knows how to draw ────────────
  function title(item, past) {
    const c = item.res && item.res.cards, p = item.params;
    const named = !c && (item.cardOverride || p.cardId || item.carried);
    const who = p.allCards ? (c ? `all ${c.length} eligible card${c.length > 1 ? 's' : ''}` : 'all your cards') : c ? D.tag(c[0]) : named ? D.tag(D.card(named)) : 'your card';
    return {
      FREEZE: [`Freeze ${who}?`, `Froze ${who}`], UNFREEZE: [`Unfreeze ${who}?`, `Unfroze ${who}`],
      SET_LIMIT: [`Limit ${who}`, `${who} limit set to ${p.amount && money(p.amount)}`],
      BLOCK_MERCHANT: [`Block ${p.merchant || 'a merchant'} on ${who}`, `Blocked ${p.merchant} on ${who}`],
      SET_INTERNATIONAL: [`Use ${who} in ${p.country || 'another country'}`, `${who} works in ${p.country}${p.dates ? ' ' + p.dates.label : ''}`],
      BLOCK_ATM: [`Turn off ATM on ${who}?`, `ATM withdrawals off on ${who}`],
      ACTIVATE_CARD: [`Activate ${who}?`, `${who} is active`],
      REPORT_LOST: [`Report ${who} lost or stolen?`, `${who} reported — replacement on its way`],
      RAISE_DISPUTE: [`Dispute ${p.merchant || 'a'} charge${p.txn ? ' of ' + money(p.txn.amount) : ''}?`, `Dispute opened for ${p.merchant} ${p.txn ? money(p.txn.amount) : ''}`],
    }[item.kind][past ? 1 : 0];
  }

  const CHIPS = {
    amount: ['$200', '$500', '$1,000'].map(v => ({ label: v, turn: { text: v } })),
    merchant: () => [...new Set(D.txns.slice(0, 12).map(t => t.merchant))].slice(0, 4).map(m => ({ label: m, turn: { text: m } })),
    country: ['Japan', 'France', 'Mexico'].map(v => ({ label: v, turn: { text: v } })),
  };
  const QUESTION = { amount: 'What should the limit be?', merchant: 'Which merchant?', country: 'Which country are you going to?' };

  function interaction(r) {
    const it = r.item, w = it.waiting;
    if (w.need === 'slot') {
      const chips = typeof CHIPS[w.slot] === 'function' ? CHIPS[w.slot]() : CHIPS[w.slot];
      return { type: 'CHIPS', question: it.kind === 'RAISE_DISPUTE' ? 'Which charge do you want to dispute?' : QUESTION[w.slot], chips };
    }
    if (w.need === 'card') return { type: 'CHIPS', question: `${KINDS[it.kind].label} — which card?`,
      chips: it.res.options.map(o => ({ label: D.tag(o.card), disabled: !!o.reason, reason: o.reason, turn: { pick: true, cardOverride: o.card.id, display: D.tag(o.card) } })) };
    return null;
  }

  function row(r) {
    const it = r.item;
    switch (r.t) {
      case 'done': return { state: 'DONE', title: title(it, true), detail: 'Confirmed by the bank just now' + (r.actionId ? ' · undo for 30 min' : ''),
        actions: r.actionId ? [{ label: 'Undo', turn: { undo: r.actionId, display: 'Undo' } }] : [] };
      case 'undone': return { state: 'UNDONE', title: 'Undone: ' + title(it, true), detail: 'Reverted and confirmed by the bank' };
      case 'failed': {
        // Name what didn't happen, then why — never a question on a failed row.
        const m = /^(.+?): (.+)$/.exec(r.reason || '');
        return { state: 'FAILED', title: it && it.kind ? `${KINDS[it.kind].label} · not done` : 'Couldn’t do that', detail: m ? `${m[1]} — ${m[2].charAt(0).toLowerCase()}${m[2].slice(1)}` : r.reason };
      }
      case 'cancelled': return { state: 'UNSUPPORTED', title: 'Cancelled', detail: 'Nothing was changed' };
      case 'waiting': return { state: 'WAITING', title: it.kind ? title(it) : it.text, detail: 'Next, after the step above' };
      case 'ask': {
        const w = it.waiting;
        if (w.need === 'confirm') return { state: 'NEEDS_CONFIRM', title: title(it),
          detail: it.res.allCards ? `Acts on ${it.res.cards.length} card(s) at once${it.res.skipped.length ? ' · skipping ' + it.res.skipped.join(', ') : ''}` : (KINDS[it.kind].reversible ? '' : 'This can’t be undone.'),
          actions: [{ label: 'Confirm', primary: true, turn: { confirm: it.id, display: 'Confirm' } }, { label: 'Cancel', turn: { cancel: it.id, display: 'Cancel' } }] };
        return { state: 'NEEDS_INPUT', title: title(it), detail: w.need === 'card' ? 'Pick a card below' : 'Needs ' + w.slot };
      }
      case 'handoff': return { state: 'UNSUPPORTED', title: `Can’t do “${it.text}” here`, detail: `${HANDOFFS[it.d.top.id].screen} can` };
      default: return { state: 'UNSUPPORTED', title: `Can’t do “${it.text}”`, detail: 'Not something Nova can change' };
    }
  }

  const FOLLOW = {
    V1: ['Show it by week', 'Is that a lot?'], V3: ['Where did it go?', 'Which days do I spend most?'], V7: ['What changed this month?', 'Show it by card'],
    V8: ['Top merchants', 'What changed this month?'], V10: ['What changed this month?', 'Where did my money go?'], V11: ['How does this month compare with last month?'],
    V12: ['How often do I go to Brewline?'], V14: ['Anything unusual?'], V21: ['Show my subscriptions'], V2: ['Food spending by week'], V18: ['Food spending by week'], V13: ['Top merchants'], V5: ['Where did my money go?'], V9: ['What changed this month?'],
    V4: ['What changed since last month by category?'], V15: ['Break down my spending by category'], V16: ['Anything unusual?'], V17: ['Show my spending calendar'],
    V19: ['Which days do I spend most?'], V20: ['What changed since last month by category?'],
  };

  function compose(results) {
    const out = [];
    const single = results.length === 1 || (results.length === 2 && results[1].followUp);
    if (!single) {
      out.push({ type: 'ANSWER', text: 'Here’s where each part stands:' });
      out.push({ type: 'STATUS', rows: results.filter(r => !r.followUp).map(row) });
      const ask = results.find(r => r.t === 'ask');
      const inter = ask && interaction(ask);
      if (inter) out.push(inter);
      return out;
    }
    for (const r of results) {
      if (r.followUp) out.push({ type: 'ANSWER', text: 'Next up:' });
      switch (r.t) {
        case 'insight': {
          out.push({ type: 'CHART', panel: r.panel, built: r.built });
          const f = FOLLOW[r.panel.visual]; if (f) out.push({ type: 'FOLLOW', chips: f.map(l => ({ label: l, turn: { text: l } })) });
          break;
        }
        case 'outage': out.push({ type: 'ANSWER', text: 'I can’t understand requests right now. You can still do it yourself:' }); out.push({ type: 'CTA', label: 'Open card settings', screen: 'Card settings' }); break;
        case 'handoff': { const h = HANDOFFS[r.d.top.id];
          out.push({ type: 'ANSWER', text: `I can’t do that here, but **${h.screen}** can.` });
          out.push({ type: 'CTA', label: h.label, screen: h.screen }); break; }
        case 'candidates': out.push({ type: 'CHIPS', question: 'Did you mean…', chips: r.d.candidates.map(c => ({ label: c.label, turn: { text: c.label } })) }); break;
        case 'ambiguous': out.push({ type: 'CHIPS', question: 'Do you want to…', chips: ['Turn off ATM withdrawals', 'Find an ATM near me'].map(l => ({ label: l, turn: { text: l } })) }); break;
        case 'unsupported': out.push({ type: 'ANSWER', text: 'That’s not something I can do. I can freeze or unfreeze cards, set limits, block merchants, set up travel, dispute charges and show your spending.' }); break;
        case 'none': out.push({ type: 'CHIPS', question: r.d && r.d.greeting ? 'Hi! Ask about your spending or tell me what to change on a card — for example:' : 'I didn’t catch that. Try one of these:', chips: ['How much did I spend this month?', 'Freeze my card', 'Set a limit'].map(l => ({ label: l, turn: { text: l } })) }); break;
        case 'ask': { const inter = interaction(r); if (inter) out.push(inter); else out.push({ type: 'STATUS', rows: [row(r)] }); break; }
        default: out.push({ type: 'STATUS', rows: [row(r)] });
      }
    }
    return out;
  }

  const resetState = () => { NovaData.reset(); queue.length = 0; for (const k in undoable) delete undoable[k]; chartCache.clear(); log('state reset → a clean run (cards back to their starting state)', 'dim'); };
  window.Engine = { bus, settings, message, intent, log, resetState, splitParts,
    preview: async (text, ctx) => { if (!SPENDY.test(text)) return null; const t = newTrace('typing', text, false, true); log('keystroke → one Jev call reads which chart; the action waits for send (On send)', 'dim'); return (await insight(t, text, ctx, true)).panel; }, prewarm: () => loadSnapshot(null, 'sheet opened → prewarm') };
})();
