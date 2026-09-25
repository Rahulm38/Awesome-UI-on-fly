/* Jev — the decision model (simulated in the browser).
 *
 * Jev picks from a CLOSED catalogue and returns a score per choice. It cannot
 * invent an action, a card or a merchant; open values (amounts, names, dates)
 * are the LLM's job. The scores here come from weighted features plus a small
 * deterministic jitter, so they look and behave like a calibrated classifier. */
(function () {
  const D = window.NovaData;

  const KINDS = {
    FREEZE:            { label: 'Freeze card', icon: 'snowflake', reversible: true, undo: 'UNFREEZE', pattern: 'A' },
    UNFREEZE:          { label: 'Unfreeze card', icon: 'sun', reversible: true, undo: 'FREEZE', pattern: 'A' },
    SET_LIMIT:         { label: 'Set a spending limit', icon: 'gauge', reversible: true, undo: 'REMOVE_LIMIT', pattern: 'B', slots: ['amount'] },
    BLOCK_MERCHANT:    { label: 'Block a merchant', icon: 'ban', reversible: true, undo: 'UNBLOCK_MERCHANT', pattern: 'C', slots: ['merchant'] },
    SET_INTERNATIONAL: { label: 'Allow use abroad', icon: 'plane', reversible: true, undo: 'CLEAR_INTERNATIONAL', pattern: 'B', slots: ['country'] },
    BLOCK_ATM:         { label: 'Turn off ATM withdrawals', icon: 'atm', reversible: true, undo: 'ALLOW_ATM', pattern: 'A' },
    ACTIVATE_CARD:     { label: 'Activate card', icon: 'badge-check', reversible: false, pattern: 'E' },
    REPORT_LOST:       { label: 'Report lost or stolen', icon: 'shield', reversible: false, highStakes: true, pattern: 'E' },
    RAISE_DISPUTE:     { label: 'Dispute a charge', icon: 'scale', reversible: false, highStakes: true, pattern: 'E', slots: ['merchant'] },
    SPEND_INSIGHT:     { label: 'Show my spending', icon: 'chart', read: true, pattern: 'R' },
  };

  // Things Nova cannot do, but can point to the screen that can.
  const HANDOFFS = {
    FIND_ATM:          { label: 'Find an ATM', screen: 'ATM locator', icon: 'map-pin' },
    CHANGE_PIN:        { label: 'Change your PIN', screen: 'Security settings', icon: 'key' },
    VIEW_TRANSACTIONS: { label: 'See your transactions', screen: 'Transactions', icon: 'list' },
    VIEW_REWARDS:      { label: 'See your rewards', screen: 'Rewards', icon: 'gift' },
  };

  const T = { act: 0.50, highStakes: 0.70, handoff: 0.50, candidateFloor: 0.25, margin: 0.10 };   // the real adapter's constants

  const words = list => new RegExp('\\b(' + list.map(s => s.toLowerCase()).join('|') + ')\\b');
  const MERCH = words([...D.merchants, ...D.merchants.map(m => m.split(' ')[0])]), COUNTRY = words(D.countries);

  // [choice, pattern, weight]
  const FEATURES = [
    ['FREEZE', /\b(freeze|lock|pause|suspend)\b/, 3],
    ['FREEZE', /\bblock\s+(?:(?:my|the|this|all|both)\s+)?(?:\w+\s+)?cards?\b/, 3],
    ['UNFREEZE', /\b(unfreeze|unlock|unpause)\b|\bunblock\b.*\bcards?\b|\bcards?\b.*\bback on\b/, 4],
    ['SET_LIMIT', /\b(limit|cap|maximum)\b/, 3],
    ['SPEND_INSIGHT', /\blimit\b/, -2],
    ['BLOCK_MERCHANT', /\b(block|stop|ban)\b.*\b(merchants?|payments? to|charges? from)\b/, 3.2],
    ['BLOCK_MERCHANT', new RegExp('\\b(block|stop|ban)\\b.*' + MERCH.source), 3.2],
    ['SET_INTERNATIONAL', /\b(abroad|international|overseas|travel\w*|trip|vacation|holiday)\b/, 3],
    ['SET_INTERNATIONAL', COUNTRY, 1],
    ['ACTIVATE_CARD', /\bactivat\w*\b/, 3.2],
    ['REPORT_LOST', /\b(lost|stolen|missing)\b|can'?t find my card/, 3.2],
    ['REPORT_LOST', /\bforgot\b/, 1.55],
    ['CHANGE_PIN', /\bpin\b/, 3],
    ['CHANGE_PIN', /\bforgot\b/, 1.55],
    ['RAISE_DISPUTE', /\b(dispute|fraud\w*|unauthori[sz]ed)\b|didn'?t (make|buy|order)|don'?t recogni[sz]e|charged twice|wrong (charge|amount)/, 3.2],
    ['SPEND_INSIGHT', /\b(spend|spent|spending|expenses?|breakdown)\b|how much|money (go|went)/, 3],
    ['SPEND_INSIGHT', /\b(subscriptions?|recurring|unusual|suspicious|strange|how often|which days?|weekdays?|top merchants|biggest|trend|what changed|on track|by card|by week|by month)\b|is (that|this|it) a lot|compare|\bvs\b/, 3.2],
    ['SPEND_INSIGHT', /\bsplit\b|\bby merchants?\b|\bmerchants?\b|\bby (card|category|categories|type)\b/, 3],
    // Declined attempts, the spending calendar and "left today" are all reads, never card actions.
    ['SPEND_INSIGHT', /\b(declined?|declines|rejected|bounced)\b|didn'?t go through|\bcalendar\b|\bheat ?map\b|\bday by day\b|\bcan i (still )?spend\b|\bbreak (it )?down\b/, 3.2],
    ['SPEND_INSIGHT', /\b(food|dining|groceries|grocery|transport|fuel|petrol|gas|shopping|entertainment|health|pharmacy|utilities|bills|household|salon|education|pets?|gifts?|coffee|flights?)\b.*\b(last|this|past)\s+(\d+\s+|one |two |three |six )?(week|month|day|year)s?\b/, 3],
    ['SPEND_INSIGHT', /\b(block|unblock|stop|ban)\b/, -3],
    ['SPEND_INSIGHT', /\blimit\b.*\b(left|remaining|used)\b|\b(left|remaining)\b.*\blimit\b|left to spend/, 5],
    ['SET_LIMIT', /\blimit\b.*\b(left|remaining|used)\b|\b(left|remaining)\b.*\blimit\b/, -3],
    ['SPEND_INSIGHT', /\b(food|dining|eating|groceries|grocery|transport|rides|shopping|entertainment|streaming|health|pharmacy|utilities|bills|household|salon|education|pets?|gifts?)\b/, 0.4],
    ['VIEW_TRANSACTIONS', /\b(transactions?|statements?|history|purchases)\b/, 2.6],
    ['VIEW_REWARDS', /\b(rewards?|points|cashback)\b/, 3],
  ];

  // While typing, a half-written word nudges its choice up but can never clear
  // the bar on its own: only complete words assert anything.
  const PREFIXES = {
    FREEZE: ['freeze'], UNFREEZE: ['unfreeze', 'unlock'], SET_LIMIT: ['limit'], ACTIVATE_CARD: ['activate'],
    SET_INTERNATIONAL: ['international', 'abroad', 'overseas', 'travel'], REPORT_LOST: ['stolen'],
    RAISE_DISPUTE: ['dispute'], SPEND_INSIGHT: ['spending', 'spent'], VIEW_TRANSACTIONS: ['transactions', 'statement'],
    VIEW_REWARDS: ['rewards'],
  };

  const hash = s => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };
  const sig = x => 1 / (1 + Math.exp(-x));
  const prob = (raw, key) => Math.min(0.995, Math.max(0.005, sig(2.2 * (raw - 1.6)) + ((hash(key) % 1000) / 1000 - 0.5) * 0.06));
  const norm = s => s.toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, ' ');
  const round = p => Math.round(p * 100) / 100;

  function rawScores(text, strict) {
    // A card's name is a name, not an intent: “my travel card” says nothing about travelling.
    const t = norm(text).replace(/\b(travel|everyday|virtual|rewards|family|premier) card\b/g, 'card'), raw = {}, fired = [];
    const add = (k, w, why) => { raw[k] = (raw[k] || 0) + w; fired.push(`${k} ${w > 0 ? '+' : ''}${w} ← ${why}`); };
    for (const [k, re, w] of FEATURES) { const m = t.match(re); if (m) add(k, w, `"${m[0]}"`); }

    const atm = /\b(atm|cash|withdraw\w*)\b/.test(t);
    const dir = /\b(off|block|disable|stop|no|pause)\b/.test(t);
    const locate = /\b(find|near|nearest|nearby|where|closest)\b/.test(t);
    if (atm && dir) add('BLOCK_ATM', 3.2, 'atm + direction word');
    if (atm && locate) add('FIND_ATM', 3.2, 'atm + locate word');

    if (!strict && !/\s$/.test(text)) {
      const last = t.trim().split(' ').pop() || '';
      if (last.length >= 3) for (const [k, list] of Object.entries(PREFIXES)) for (const w of list)
        if (w.startsWith(last) && w !== last) add(k, +(3 * 0.6 * last.length / w.length).toFixed(2), `"${last}…" → ${w}?`);
    }
    return { t, raw, fired, ambiguous: atm && !dir && !locate };
  }

  function decide(text, opts = {}) {
    const { t, raw, fired, ambiguous } = rawScores(text, opts.strict);
    const scores = [...Object.keys(KINDS), ...Object.keys(HANDOFFS)].map(id => {
      const K = KINDS[id] || HANDOFFS[id];
      return { id, type: KINDS[id] ? 'kind' : 'handoff', label: K.label, icon: K.icon, highStakes: !!K.highStakes,
        p: round(prob(raw[id] || 0, t + id)) };
    }).sort((a, b) => b.p - a.p);

    const bestKind = scores.find(s => s.type === 'kind');
    const bestHand = scores.find(s => s.type === 'handoff');
    const nWords = t.trim().split(' ').filter(Boolean).length;
    const greeting = /^(hi|hello|hey|hiya|good (morning|afternoon|evening)|thanks|thank you|ok|okay)\b/.test(t.trim()) && !Object.values(raw).some(v => v > 0);
    const generic = !greeting && !Object.values(raw).some(v => v > 0) && nWords >= 2;
    const route = { IN_SCOPE: bestKind.p, OUT_OF_SCOPE: Math.max(bestHand.p, generic ? 0.86 : 0.04) };
    const bar = s => (s.highStakes ? T.highStakes : T.act);
    // A single reading only wins when no rival is close behind it; a near tie is a question, not an answer.
    const clear = s => !scores.some(o => o !== s && o.p >= T.candidateFloor && s.p - o.p < T.margin);

    let verdict = 'NONE', top = null, candidates = [], reason;
    if (ambiguous && !(bestKind.p >= bar(bestKind) && bestKind.id !== 'BLOCK_ATM')) {
      verdict = 'AMBIGUOUS';
      reason = 'atm/cash · no direction or locate word → nothing asserted';
    } else if (route.IN_SCOPE >= route.OUT_OF_SCOPE && bestKind.p >= bar(bestKind) && clear(bestKind)) {
      verdict = 'ACTION'; top = bestKind;
      reason = `${top.id} ${top.p} ≥ ${bar(top).toFixed(2)}${top.highStakes ? ' (high-stakes bar)' : ''}`;
    } else if (route.OUT_OF_SCOPE > route.IN_SCOPE && bestHand.p >= T.handoff && clear(bestHand)) {
      verdict = 'HANDOFF'; top = bestHand;
      reason = `out of scope · ${top.id} ${top.p} names a screen`;
    } else {
      candidates = opts.strict ? [] : scores.filter(s => s.p >= T.candidateFloor).slice(0, 3);
      if (candidates.length >= 2) {
        verdict = 'CANDIDATES';
        reason = `no clear winner · ${candidates.length} readings → person chooses`;
      } else {
        candidates = [];
        if (route.OUT_OF_SCOPE >= 0.8) { verdict = 'UNSUPPORTED'; reason = 'out of scope · no screen'; }
        else reason = bestKind.p > 0.2
          ? `${bestKind.id} ${bestKind.p} < ${bar(bestKind).toFixed(2)} · menu of one = guess → nothing`
          : 'no catalogue match';
      }
    }
    return { verdict, top, candidates, route: { IN_SCOPE: round(route.IN_SCOPE), OUT_OF_SCOPE: round(route.OUT_OF_SCOPE) },
      reason: greeting ? 'a greeting, not a request' : reason, greeting, scores, features: fired, source: opts.strict ? 'rules' : 'jev' };
  }

  // Strongest single feature weight — used to decide whether a message has more than one request in it.
  const strength = text => Math.max(0, ...Object.values(rawScores(text, true).raw));

  window.Jev = { KINDS, HANDOFFS, T, decide, strength };
})();
