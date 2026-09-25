/* On-demand insights.
 *
 *   read(text)      — the LLM's job: map a question onto CLOSED lists
 *                     (intent, subjects, period, split). Never free text.
 *   choose(q, data) — PURE: pick the visual from the SHAPE of the data,
 *                     falling back down a ladder; V1 (a stat tile) is the floor.
 *   build(...)      — PURE: numbers → a panel. All money strings are made
 *                     here; the phone never formats money or picks colours. */
(function () {
  const D = window.NovaData;
  const day = (d, n = 0) => { const x = new Date(d); x.setDate(x.getDate() + n); x.setHours(0, 0, 0, 0); return x; };
  const TODAY = day(new Date());
  const som = d => new Date(d.getFullYear(), d.getMonth(), 1);
  const addM = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, 1);
  const monday = d => day(d, -((d.getDay() + 6) % 7));
  const md = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const mon = d => d.toLocaleDateString('en-US', { month: 'short' });
  const money = n => { const a = Math.abs(n); const s = a >= 10000 ? (a / 1000).toFixed(1).replace(/\.0$/, '') + 'K' : a >= 100 ? Math.round(a).toLocaleString('en-US') : a.toFixed(2).replace(/\.00$/, ''); return (n < 0 ? '−$' : '$') + s; };
  const short = n => { const a = Math.abs(n); return '$' + (a >= 1000 ? (a / 1000).toFixed(a >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'K' : Math.round(a)); };
  const sum = l => +l.reduce((n, t) => n + t.amount, 0).toFixed(2);
  const median = a => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : 0; };
  const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); if (!s.length) return 0; const i = (s.length - 1) * p, lo = Math.floor(i); return s[lo] + (s[Math.ceil(i)] - s[lo]) * (i - lo); };
  const inR = (t, a, b) => { const d = day(t.date); return d >= a && d <= b; };

  // ── read: the question → closed lists ────────────────────────────────────
  const CATS = [
    [/\b(food|dining|restaurants?|eat\w*|coffee|lunch|dinner)\b/, 'Food & Dining'], [/\b(groceries|grocery|supermarket)\b/, 'Groceries'],
    [/\b(transport|transportation|rides?|taxi|gas|fuel|petrol|gasoline|diesel)\b/, 'Transport'], [/\b(shopping|clothes)\b/, 'Shopping'],
    [/\b(entertainment|movies|streaming)\b/, 'Entertainment'], [/\b(flights?|airfare|travel spend)\b/, 'Travel'],
      [/\b(health|pharmacy|medical|doctor|medicine|gym)\b/, 'Health'], [/\b(utilit(y|ies)|electricity|power bill|internet|phone bill|mobile bill)\b/, 'Utilities'],
    [/\b(household|home goods)\b/, 'Household'], [/\b(personal care|salon|beauty|haircut)\b/, 'Personal care'], [/\b(education|courses?|learning|tuition)\b/, 'Education'],
    [/\b(pets?|pet food|vet)\b/, 'Pets'], [/\b(gifts?|flowers?)\b/, 'Gifts'],
  ];
  const INTENTS = [
    ['DECLINED', /\b(declined?|declines|rejected|refused|bounced|didn'?t go through)\b/],
    ['CALENDAR', /\bcalendar\b|\bheat ?map\b|\bday by day\b|\bdaily spend/],
    ['UNUSUAL', /\b(unusual|strange|suspicious|weird|odd|out of the ordinary)\b/],
    ['SUBSCRIPTIONS', /\b(subscriptions?|recurring|monthly bills?)\b/],
    ['LIMIT', /\blimit\b.*\b(left|remaining|used)\b|\b(left|remaining)\b.*\blimit\b|left to spend|can i (still )?spend/],
    ['PACE', /\b(on track|pace|compared? (to|with) last month|vs\.? last month|than last month|this month compare)\b/],
    ['CHANGE', /\bwhat changed\b|\bwhy (is|was|did|am)\b.*\b(higher|more|up|increase)|\bchanged\b/],
    ['WEEKDAY', /\bwhich days?\b|\bweekday|\bweekends?\b|day of the week|what day/],
    ['HABIT', /\bhow often\b|\bvisits?\b|\bhabit\b/],
    ['NORMAL', /\ba lot\b|\bnormal\b|\btypical\b|\busual\b|\btoo much\b/],
    ['BY_CARD', /\bby card\b|\bwhich card\b|\beach card\b|debit (vs|or) credit/],
    ['TOP', /\bby merchants?\b|\bmerchants?\b|\bwhere (do|did) i (shop|buy)\b|\btop\b|\bbiggest\b|\bmost\b/],
    ['COMPARE', /\bvs\.?\b|\bversus\b|\bcompare\b|\bor\b/],
    ['BREAKDOWN', /\bwhere did\b|\bbreakdown\b|\bshare\b|\bsplit\b|\bcategor(y|ies)\b|money (go|went)/],
    ['TREND', /\btrend|over time|(per|by|each) (week|month)|weekly|monthly|last (\d|three|six) months/],
  ];
  // Small typo tolerance, the way the LLM would read "merhcant" or "subscirptions".
  const VOCAB = ['merchant', 'merchants', 'subscriptions', 'subscription', 'compare', 'category', 'categories', 'spending', 'breakdown', 'unusual', 'weekday', 'groceries', 'transport', 'restaurants'];
  const KEEP = new Set(['month', 'months', 'monthly', 'week', 'weeks', 'weekly', 'weekend', 'weekends', 'today', 'spent', 'spend', 'money', 'where', 'which', 'much', 'last', 'this', 'past']);
  const dist = (a, b) => { const m = Array.from({ length: a.length + 1 }, (_, i) => [i]); for (let j = 1; j <= b.length; j++) m[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1] ? m[i - 2][j - 2] + 1 : 99); return m[a.length][b.length]; };
  const fix = w => {
    if (w.length < 6 || KEEP.has(w) || VOCAB.includes(w)) return w;
    const best = VOCAB.filter(v => v[0] === w[0]).map(v => [v, dist(w, v)]).filter(([, d]) => d <= (w.length >= 8 ? 2 : 1)).sort((x, y) => x[1] - y[1])[0];
    return best ? best[0] : w;
  };
  const NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, eight: 8, twelve: 12 };
  function read(text) {
    const t = text.toLowerCase().replace(/’/g, "'").replace(/[a-z]+/g, fix);
    const subjects = [];
    CATS.forEach(([re, c]) => { if (re.test(t)) subjects.push({ kind: 'category', name: c }); });
    D.merchants.forEach(m => { if (t.includes(m.toLowerCase()) || new RegExp('\\b' + m.split(' ')[0].toLowerCase() + '\\b').test(t)) subjects.push({ kind: 'merchant', name: m }); });
    let intent = (INTENTS.find(([, re]) => re.test(t)) || ['TOTAL'])[0];
    if (intent === 'COMPARE' && subjects.length < 2) intent = /last month/.test(t) ? 'PACE' : 'TOTAL';
    if (intent === 'HABIT' && !subjects.some(s => s.kind === 'merchant')) intent = 'TOTAL';
    // "how much can I spend today" → what's left of a daily limit.
    if (intent === 'LIMIT' && /\btoday\b/.test(t)) intent = 'TODAY_LEFT';
    const byCat = /\bby categor(y|ies)\b|\beach categor(y|ies)\b|\bper categor(y|ies)\b/.test(t);
    // "what changed since last month by category" → a dumbbell per category.
    if (intent === 'CHANGE' && (byCat || /\bsince last month\b/.test(t))) intent = 'SHIFT';
    // "break down my spending by category" → category rows that open onto their merchants.
    if ((intent === 'BREAKDOWN' || intent === 'TOTAL') && !subjects.length && /\bbreak (it |this )?down\b|\bdrill\b/.test(t)) intent = 'DRILL';
    const nm = t.match(/\b(?:last|past) (\d+|one|two|three|four|five|six|eight|twelve) (day|week|month)s?\b/);
    const custom = nm && { n: +(NUM[nm[1]] || nm[1]), unit: nm[2] };
    const period = custom && !['6 month', '3 month', '30 day', '8 week'].includes(`${custom.n} ${custom.unit}`) ? `last ${custom.n} ${custom.unit}s`
      : /\btoday\b/.test(t) ? 'today' : /\byesterday\b/.test(t) ? 'yesterday' : /\blast week\b/.test(t) ? 'last week' : /\bthis week\b/.test(t) ? 'this week'
      : /\blast month\b/.test(t) ? 'last month' : /last (6|six) months/.test(t) ? 'last 6 months' : /last (3|three) months/.test(t) ? 'last 3 months'
      : /30 days/.test(t) ? 'last 30 days' : intent === 'TREND' ? (/week/.test(t) ? 'last 8 weeks' : 'last 6 months') : 'this month';
    const split = /week/.test(t) && intent === 'TREND' ? 'WEEK' : intent === 'TREND' ? 'MONTH' : null;
    // "split by …": card / debit-vs-credit / merchant / category, optionally over time.
    const by = {
      card: /\b(by|per|each|across|split by) cards?\b|\bsplit\b.*\bcards?\b|\bcards?\b.*\bsplit\b/.test(t),
      type: /\bdebit\b.*\bcredit\b|\bcredit\b.*\bdebit\b|\bby type\b/.test(t),
      merchant: /\bmerchants?\b/.test(t),
      time: /\b(by|per|each) (month|week)|\bmonthly\b|\bweekly\b|\bover time\b|last (\d+|two|three|four|six) months/.test(t),
    };
    by.category = byCat;
    const multiMonth = /^last (\d+) months$/.test(period) && +/\d+/.exec(period)[0] >= 2;
    if ((by.card || by.type) && by.time) intent = 'STACK';
    else if (by.type) intent = 'BY_TYPE';
    else if (by.card && intent !== 'TREND') intent = 'BY_CARD';
    else if (by.category && by.time && ['BREAKDOWN', 'DRILL', 'TREND', 'TOTAL'].includes(intent)) { intent = 'STACK'; by.category = true; }
    // Two or three subjects over several months → grouped columns, one colour each.
    else if (intent === 'COMPARE' && subjects.length >= 2 && (by.time || multiMonth)) intent = 'GROUPED';
    const stackSplit = /week/.test(t) ? 'WEEK' : 'MONTH';
    const widen = (intent === 'STACK' || intent === 'GROUPED') && period === 'this month';
    return { raw: t, intent, subjects, period: widen ? (stackSplit === 'WEEK' ? 'last 8 weeks' : intent === 'GROUPED' || by.category ? 'last 6 months' : 'last 3 months')
      : intent === 'DECLINED' && period === 'this month' ? 'last 30 days' : period,
      split: intent === 'STACK' || intent === 'GROUPED' ? stackSplit : split, by };
  }

  function range(p) {
    const dow = (TODAY.getDay() + 6) % 7;
    switch (p) {
      case 'today': return { a: TODAY, b: TODAY, label: `on ${md(TODAY)}`, partial: true };
      case 'yesterday': return { a: day(TODAY, -1), b: day(TODAY, -1), label: `on ${md(day(TODAY, -1))}` };
      case 'this week': return { a: day(TODAY, -dow), b: TODAY, label: 'this week', partial: true };
      case 'last week': return { a: day(TODAY, -dow - 7), b: day(TODAY, -dow - 1), label: 'last week' };
      case 'last month': { const a = addM(som(TODAY), -1); return { a, b: day(som(TODAY), -1), label: `in ${mon(a)}` }; }
      case 'last 30 days': return { a: day(TODAY, -29), b: TODAY, label: 'in the last 30 days', partial: true };
      case 'last 3 months': return { a: addM(som(TODAY), -2), b: TODAY, label: 'in the last 3 months', partial: true };
      case 'last 6 months': return { a: addM(som(TODAY), -5), b: TODAY, label: 'in the last 6 months', partial: true };
      case 'last 8 weeks': return { a: day(monday(TODAY), -49), b: TODAY, label: 'in the last 8 weeks', partial: true };
      default: {
        const m = /^last (\d+) (day|week|month)s$/.exec(p);
        if (m) { const n = +m[1], a = m[2] === 'month' ? addM(som(TODAY), -(n - 1)) : day(TODAY, -(n * (m[2] === 'week' ? 7 : 1) - 1));
          return { a, b: TODAY, label: `in the last ${n} ${m[2]}${n > 1 ? 's' : ''}`, partial: true }; }
        return { a: som(TODAY), b: TODAY, label: `in ${mon(TODAY)} so far`, partial: true };
      }
    }
  }
  // The same span, one period earlier — for "vs last time".
  function previous(p, r) {
    if (p === 'this month') return { a: addM(r.a, -1), b: day(addM(r.a, -1), TODAY.getDate() - 1), label: `${mon(addM(r.a, -1))} 1–${TODAY.getDate()}` };
    if (p === 'last month') return { a: addM(r.a, -1), b: day(r.a, -1), label: mon(addM(r.a, -1)) };
    const n = Math.round((r.b - r.a) / 864e5) + 1;
    return { a: day(r.a, -n), b: day(r.a, -1), label: 'the period before' };
  }

  // ── choose: data shape → visual (pure) ───────────────────────────────────
  function choose(q, ctx) {
    const ladder = [];
    const ok = (v, why) => ({ visual: v, why, ladder });
    const fall = (v, why) => { ladder.push(`${v}: ${why}`); };
    const { intent } = q;
    if (intent === 'STACK') return ok('V6', `split by ${q.by.type ? 'debit vs credit' : q.by.card ? 'card' : 'category'} over ${q.split === 'WEEK' ? 'weeks' : 'months'} → stacked columns`);
    if (intent === 'GROUPED') return ok('V4', `${Math.min(3, q.subjects.length)} subjects over ${q.split === 'WEEK' ? 'weeks' : 'months'} → grouped columns`);
    if (intent === 'DECLINED') return ok('V16', 'asked about declined payments → list with reasons, not counted in spend');
    if (intent === 'CALENDAR') return ok('V19', 'asked for a calendar → month grid shaded by daily spend');
    if (intent === 'SHIFT') return ok('V15', 'what moved since last month, per category → dumbbell, last month → this month');
    if (intent === 'DRILL') return ok('V20', 'categories that open onto their merchants');
    if (intent === 'TODAY_LEFT') { if (ctx.daily) return ok('V17', 'a daily limit exists → what’s left of it today'); fall('V17', 'no daily limit on this card'); }
    if (intent === 'BY_TYPE') return ok('V5', 'debit vs credit → one split bar');
    if (intent === 'TOP' && q.subjects.some(s => s.kind === 'category')) return ok('V7', 'merchants inside a category → ranked with logos, tap one for its payments');
    if (intent === 'UNUSUAL') return ok('V21', 'asked for anything unusual');
    if (intent === 'SUBSCRIPTIONS') return ok('V14', 'asked about recurring payments');
    if (intent === 'LIMIT') { if (ctx.limit) return ok('V9', 'a limit exists → meter with an even-pace tick'); fall('V9', 'no limit set on this card'); }
    if (intent === 'PACE') { if (TODAY.getDate() >= 5) return ok('V10', 'this month vs last, cumulative; ≥5 days in'); fall('V10', 'fewer than 5 days into the month'); }
    if (intent === 'CHANGE') return ok('V11', 'asked what changed → ↑/↓ by category');
    if (intent === 'WEEKDAY') return ok('V12', 'asked about days → weekday strip');
    if (intent === 'HABIT') return ok('V13', 'a merchant + how often → visits and last visit');
    if (intent === 'NORMAL') { if (ctx.history >= 3) return ok('V18', 'your usual range as a band, this month as a marker'); fall('V18', 'under 3 months of history'); }
    if (intent === 'BY_CARD') { if (ctx.topShare < 0.97 || q.subjects.length) return ok('V5', 'one 100% bar split by card'); fall('V5', `${Math.round(ctx.topShare * 100)}% on one card — a split bar would be a single colour`); }
    if (intent === 'COMPARE' && q.subjects.length >= 2) return ok('V2', 'two subjects → face-off');
    if (intent === 'TOP') return ok('V7', 'ranked merchants, top 5 + other');
    if (intent === 'BREAKDOWN' && q.subjects.some(x => x.kind === 'category') && /\bshare\b|\bpercent|\bportion\b|\bhow much of\b/.test(q.raw || '')) return ok('V8', 'the share of one category → donut of the whole, that category called out');
    if (intent === 'BREAKDOWN') {
      if (ctx.ratio >= 1.3) return ok('V8', `top slice is ${ctx.ratio.toFixed(1)}× the next → donut reads clearly`);
      fall('V8', `top slice only ${ctx.ratio.toFixed(1)}× the next (< 1.3×) → a donut would be unreadable`);
      return ok('V7', 'ranked bars, top 5 + other');
    }
    if (intent === 'TREND') return ok('V3', `columns by ${q.split === 'WEEK' ? 'week' : 'month'} with your usual line`);
    return ok('V1', 'one number: stat tile with change and sparkline');
  }

  // ── build ────────────────────────────────────────────────────────────────
  function build(text, scope, only) {
    const q = read(text);
    if (only) { q.subjects = [only]; if (q.intent === 'COMPARE') q.intent = 'TOTAL'; }
    const r = range(q.period);
    const base = D.txns.filter(t => !scope.cardId || t.cardId === scope.cardId);
    const subj = q.subjects[0];
    const pick = (a, b, s = subj) => base.filter(t => inR(t, a, b) && (!s || (s.kind === 'category' ? t.category === s.name : t.merchant === s.name)));
    const cur = pick(r.a, r.b);
    const byCat = {}; cur.forEach(t => (byCat[t.category] = (byCat[t.category] || 0) + t.amount));
    const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
    const byCard = {}; pick(r.a, r.b).forEach(t => (byCard[t.cardId] = (byCard[t.cardId] || 0) + t.amount));
    const cardTot = Object.values(byCard).reduce((a, b) => a + b, 0) || 1;
    const card = scope.cardId ? D.card(scope.cardId) : D.cards.find(c => c.limit);
    const dcard = scope.cardId ? D.card(scope.cardId) : D.cards.find(c => c.daily && !c.archived && !c.frozen);
    const ctx = { limit: card && card.limit, daily: dcard && dcard.daily, history: 6, ratio: cats.length > 1 ? cats[0][1] / cats[1][1] : 9, topShare: Math.max(0, ...Object.values(byCard)) / cardTot };
    const pickV = choose(q, ctx);
    const what = subj ? subj.name : 'everything';
    const scopeLbl = scope.cardId ? D.tag(D.card(scope.cardId)) : `${D.cards.filter(c => !c.archived).length} cards`;
    const nm = /^last (\d+) (day|week|month)s$/.exec(q.period);
    const per = q.period === 'this month' ? mon(TODAY) : q.period === 'last month' ? mon(addM(som(TODAY), -1)) : q.period === 'this week' ? 'This week'
      : q.period === 'last week' ? 'Last week' : q.period === 'today' ? 'Today' : q.period === 'yesterday' ? 'Yesterday'
      : nm && nm[2] === 'week' ? `${nm[1]} wks` : nm && nm[2] === 'day' ? `${nm[1]} days` : `${mon(r.a)}–${mon(r.b)}`;
    const P = { visual: pickV.visual, why: pickV.why, ladder: pickV.ladder, read: q, footer: `${md(r.a)} – ${md(r.b)}${r.partial ? ' · so far' : ''} · ${scopeLbl}` };
    const total = sum(cur);

    const V = {
      V1() {
        const pr = previous(q.period, r), prev = sum(pick(pr.a, pr.b));
        const d = prev ? (total - prev) / prev : null;
        const spark = [];
        for (let i = 5; i >= 0; i--) { const a = addM(som(TODAY), -i); spark.push(sum(pick(a, i ? day(addM(a, 1), -1) : TODAY))); }
        const chg = d == null ? '' : Math.abs(d) < 0.03 ? ` · about the same as ${pr.label}` : ` · ${Math.abs(Math.round(d * 100))}% ${d > 0 ? 'more' : 'less'} than ${pr.label}`;
        Object.assign(P, { hero: { display: money(total) },
          series: [{ colorSlot: 0, points: spark.map((v, i) => ({ label: mon(addM(som(TODAY), i - 5)), amount: v })) }],
          takeaway: total === 0 ? `Nothing on ${what} ${r.label}` : chg ? chg.slice(3).replace(/^./, c => c.toUpperCase()) : `${money(total)} on ${what} ${r.label}` });
        if (!ctx.limit && q.intent === 'LIMIT') P.takeaway = 'No limit is set, so here’s what you’ve spent instead';
        if (!ctx.daily && q.intent === 'TODAY_LEFT') P.takeaway = 'No daily limit is set, so here’s what you’ve spent today';
      },
      // Grouped columns: each month a cluster, one colour per subject.
      V4() {
        const subs = q.subjects.slice(0, 3), buckets = [];
        if (q.split === 'WEEK') for (let w = monday(r.a); w <= r.b; w = day(w, 7)) buckets.push({ label: md(w), a: w, b: day(w, 6), partial: day(w, 6) > TODAY });
        else for (let m = som(r.a); m <= r.b; m = addM(m, 1)) buckets.push({ label: mon(m), a: m, b: day(addM(m, 1), -1), partial: addM(m, 1) > TODAY });
        const series = subs.map((s, i) => ({ label: s.name, colorSlot: i + 1, points: buckets.map(b => ({ label: b.label, amount: sum(pick(b.a, b.b, s)), partial: b.partial })) }));
        series.forEach(s => (s.total = s.points.reduce((n, p) => n + p.amount, 0)));
        const rank = [...series].sort((a, b) => b.total - a.total), [big, next] = rank;
        const wins = big.points.filter((p, i) => series.every(o => o === big || o.points[i].amount <= p.amount)).length;
        const close = big.total && (big.total - next.total) / big.total < 0.03;
        Object.assign(P, { series: series.map(s => ({ ...s, value: short(s.total) })),
          takeaway: close ? `About the same ${r.label}` : `${big.label} is ${money(big.total - next.total)} more${series.length > 2 ? ` than ${next.label}` : ''} ${r.label}${wins > buckets.length / 2 ? `, ahead in ${wins} of ${buckets.length} ${q.split === 'WEEK' ? 'weeks' : 'months'}` : ''}` });
      },
      V2() {
        const pts = q.subjects.slice(0, 2).map((s, i) => ({ label: s.name, amount: sum(pick(r.a, r.b, s)) }));
        const [a, b] = pts, big = a.amount >= b.amount ? a : b, small = big === a ? b : a;
        pts.forEach(p => (p.colorSlot = p === big ? 0 : -1));
        const close = big.amount && (big.amount - small.amount) / big.amount < 0.03;
        Object.assign(P, { title: `${a.label} vs ${b.label}`, series: [{ points: pts.map(p => ({ ...p, display: money(p.amount) })) }],
          takeaway: close ? 'About the same' : `${big.label} is ${money(big.amount - small.amount)} more ${r.label}` });
      },
      V3() {
        const pts = [];
        if (q.split === 'WEEK') for (let w = monday(r.a); w <= r.b; w = day(w, 7)) pts.push({ label: md(w), amount: sum(pick(w, day(w, 6))), partial: day(w, 6) > TODAY });
        else for (let m = som(r.a); m <= r.b; m = addM(m, 1)) pts.push({ label: mon(m), amount: sum(pick(m, day(addM(m, 1), -1))), partial: addM(m, 1) > TODAY });
        const full = pts.filter(p => !p.partial).map(p => p.amount), med = median(full);
        const last = pts[pts.length - 1];
        pts.forEach(p => (p.display = short(p.amount)));
        Object.assign(P, { title: `${what[0].toUpperCase() + what.slice(1)} by ${q.split === 'WEEK' ? 'week' : 'month'}`, series: [{ colorSlot: 0, points: pts }],
          band: med >= 1 ? { low: pct(full, .25), high: pct(full, .75), median: med, label: 'usual' } : null,
          takeaway: med >= 1 ? `${last.partial ? 'So far' : 'Latest'} ${short(last.amount)} — your usual is ${short(med)}` : `${short(last.amount)} ${last.partial ? 'so far' : ''}` });
      },
      V5() {
        const byType = q.intent === 'BY_TYPE', grp = {};
        cur.forEach(t => { const c = D.card(t.cardId), k = byType ? c.type : t.cardId; grp[k] = (grp[k] || 0) + t.amount; });
        const tot = Object.values(grp).reduce((a, b) => a + b, 0) || 1;
        const pts = Object.entries(grp).sort((a, b) => b[1] - a[1]).map(([k, v], i) => ({ label: byType ? k : `••${D.card(k).last4} ${D.card(k).type}`, amount: v, display: money(v), share: v / tot, colorSlot: i + 1 }));
        Object.assign(P, { series: [{ points: pts }], takeaway: pts.length ? `${pts[0].label} covers ${Math.round(pts[0].share * 100)}% of ${subj ? what.toLowerCase() : 'your'} spend` : 'No spending in this period' });
      },
      V6() {
        const byType = q.by.type, buckets = [];
        if (q.split === 'WEEK') for (let w = monday(r.a); w <= r.b; w = day(w, 7)) buckets.push({ label: md(w), a: w, b: day(w, 6), partial: day(w, 6) > TODAY });
        else for (let m = som(r.a); m <= r.b; m = addM(m, 1)) buckets.push({ label: mon(m), a: m, b: day(addM(m, 1), -1), partial: addM(m, 1) > TODAY });
        // By category: the top 3 keep a colour each, everything else is one grey "Other".
        const byCatV = !byType && !q.by.card && q.by.category;
        const catRank = byCatV ? Object.entries(cur.reduce((o, t) => ((o[t.category] = (o[t.category] || 0) + t.amount), o), {})).sort((a, b) => b[1] - a[1]).map(x => x[0]) : [];
        const keyOf = t => byType ? D.card(t.cardId).type : byCatV ? (catRank.indexOf(t.category) < 3 ? t.category : 'Other') : t.cardId;
        const groups = [...new Set(cur.map(keyOf))];
        const totals = groups.map(g => [g, sum(cur.filter(t => keyOf(t) === g))]).sort((a, b) => (a[0] === 'Other') - (b[0] === 'Other') || b[1] - a[1]);
        const series = totals.map(([g], i) => ({ label: byType || byCatV ? g : `••${D.card(g).last4} ${D.card(g).type}`, colorSlot: g === 'Other' && byCatV ? -1 : i + 1,
          points: buckets.map(b => ({ label: b.label, amount: sum(pick(b.a, b.b).filter(t => keyOf(t) === g)), partial: b.partial })) }));
        const all = totals.reduce((n, x) => n + x[1], 0) || 1;
        Object.assign(P, { series, takeaway: totals.length ? `${series[0].label} covers ${Math.round(totals[0][1] / all * 100)}% of ${subj ? what.toLowerCase() : 'your'} spend, ${per}` : 'No spending in this period' });
      },
      V7() {
        const by = {}; cur.forEach(t => { const k = q.intent === 'TOP' ? t.merchant : t.category; by[k] = (by[k] || 0) + t.amount; });
        const s = Object.entries(by).sort((a, b) => b[1] - a[1]);
        const merchantsView = q.intent === 'TOP';
        const inside = k => cur.filter(t => (merchantsView ? t.merchant : t.category) === k).slice(0, 6).map(t => ({ label: t.merchant, display: money(t.amount), when: `${md(t.date)} · ${t.date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} · ••${D.card(t.cardId).last4}` }));
        const pts = s.slice(0, 5).map(([label, amount], i) => ({ label, amount, display: money(amount), colorSlot: i === 0 ? 0 : -1, logo: merchantsView, inside: inside(label) }));
        const other = s.slice(5).reduce((n, x) => n + x[1], 0);
        if (other > 0) pts.push({ label: 'Other', amount: other, display: money(other), colorSlot: -1, other: true, count: s.length - 5 });
        Object.assign(P, { title: q.intent === 'TOP' ? (subj && subj.kind === 'category' ? `Top ${subj.name} merchants` : 'Top merchants') : 'Where it went', series: [{ points: pts }], takeaway: pts.length ? `${pts[0].label} is your top ${merchantsView ? 'merchant' : 'category'} at ${pts[0].display}` : 'No spending in this period' });
      },
      V8() {
        // A share is always of the whole: every category, with the one asked about called out.
        const all = {}; pick(r.a, r.b, null).forEach(t => (all[t.category] = (all[t.category] || 0) + t.amount));
        const whole = Object.entries(all).sort((a, b) => b[1] - a[1]), tot = whole.reduce((n, x) => n + x[1], 0) || 1;
        const pts = whole.slice(0, 4).map(([label, amount], i) => ({ label, amount, display: money(amount), pct: Math.round(amount / tot * 100) + '%', colorSlot: i + 1 }));
        const other = whole.slice(4).reduce((n, x) => n + x[1], 0);
        if (other > 0) pts.push({ label: 'Other', amount: other, display: money(other), pct: Math.round(other / tot * 100) + '%', colorSlot: -1 });
        const focus = subj && subj.kind === 'category' ? subj.name : pts[0].label, fp = Math.round((all[focus] || 0) / tot * 100);
        Object.assign(P, { series: [{ points: pts }], hero: { display: money(tot) }, focus, takeaway: `${focus} is ${fp}% of your spend` });
      },
      V9() {
        const spent = sum(base.filter(t => inR(t, som(TODAY), TODAY) && t.cardId === card.id));
        const dim = new Date(TODAY.getFullYear(), TODAY.getMonth() + 1, 0).getDate();
        Object.assign(P, { title: `${D.tag(card)} limit`, hero: { display: `${money(Math.max(0, card.limit - spent))} left` },
          meter: { limit: card.limit, spent, pace: TODAY.getDate() / dim, limitDisplay: money(card.limit), spentDisplay: money(spent) },
          takeaway: spent > card.limit * TODAY.getDate() / dim ? 'Ahead of an even pace — slow down a little' : 'Under an even pace for the month',
          perDay: `${money(Math.max(0, (card.limit - spent) / (dim - TODAY.getDate() + 1)))} a day for the rest of ${mon(TODAY)}`,
          keepFooter: true, footer: `${mon(TODAY)} 1–${TODAY.getDate()} · so far · ${D.tag(card)}` });
      },
      V10() {
        const mk = (a, n) => { let c = 0; const out = []; for (let i = 0; i < n; i++) { c += sum(pick(day(a, i), day(a, i))); out.push(c); } return out; };
        const lastA = addM(som(TODAY), -1), lastN = new Date(TODAY.getFullYear(), TODAY.getMonth(), 0).getDate();
        const thisS = mk(som(TODAY), TODAY.getDate()), lastS = mk(lastA, lastN);
        const diff = thisS[thisS.length - 1] - lastS[TODAY.getDate() - 1];
        Object.assign(P, { title: `${mon(TODAY)} vs ${mon(lastA)}`, hero: { display: money(thisS[thisS.length - 1]), delta: `${diff >= 0 ? '↑' : '↓'} ${money(Math.abs(diff))} vs same day` },
          series: [{ label: mon(lastA), colorSlot: -1, points: lastS.map(amount => ({ amount })) }, { label: mon(TODAY), colorSlot: 0, points: thisS.map(amount => ({ amount })) }],
          days: lastN, footer: `${mon(TODAY)} 1–${TODAY.getDate()} vs all of ${mon(lastA)} · ${scopeLbl}`, takeaway: Math.abs(diff) / (lastS[TODAY.getDate() - 1] || 1) < 0.03 ? 'About the same pace as last month' : `${money(Math.abs(diff))} ${diff > 0 ? 'ahead of' : 'behind'} ${mon(lastA)} at this point` });
      },
      V11() {
        const pa = addM(som(TODAY), -1), pb = day(pa, TODAY.getDate() - 1), ch = {};
        base.filter(t => inR(t, som(TODAY), TODAY)).forEach(t => (ch[t.category] = (ch[t.category] || 0) + t.amount));
        base.filter(t => inR(t, pa, pb)).forEach(t => (ch[t.category] = (ch[t.category] || 0) - t.amount));
        const pts = Object.entries(ch).map(([label, amount]) => ({ label, amount, display: (amount >= 0 ? '↑ ' : '↓ ') + money(Math.abs(amount)) }))
          .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)).slice(0, 5);
        Object.assign(P, { title: 'What changed', series: [{ points: pts }], footer: `${mon(TODAY)} 1–${TODAY.getDate()} vs ${mon(pa)} 1–${TODAY.getDate()} · ${scopeLbl}`,
          takeaway: `Biggest move: ${pts[0].label} ${pts[0].amount >= 0 ? 'up' : 'down'} ${money(Math.abs(pts[0].amount))}` });
      },
      V12() {
        const a = day(monday(TODAY), -56), tot = [0, 0, 0, 0, 0, 0, 0];
        pick(a, day(monday(TODAY), -1)).forEach(t => (tot[(t.date.getDay() + 6) % 7] += t.amount));
        const pts = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label, i) => ({ label, amount: tot[i] / 8, display: short(tot[i] / 8) }));
        const top = pts.reduce((m, p) => (p.amount > m.amount ? p : m));
        Object.assign(P, { title: `${what[0].toUpperCase() + what.slice(1)} by weekday`, series: [{ colorSlot: 0, points: pts }], footer: `Average of the last 8 weeks · ${scopeLbl}`,
          takeaway: `${{ Mon: 'Mondays', Tue: 'Tuesdays', Wed: 'Wednesdays', Thu: 'Thursdays', Fri: 'Fridays', Sat: 'Saturdays', Sun: 'Sundays' }[top.label]} are your biggest day — ${top.display} on average` });
      },
      V13() {
        const m = q.subjects.find(s => s.kind === 'merchant'), a = day(monday(TODAY), -49);
        const vis = pick(a, TODAY, m), weeks = [];
        for (let w = a; w <= TODAY; w = day(w, 7)) weeks.push({ label: md(w), amount: pick(w, day(w, 6), m).length });
        const lastV = vis[0];
        Object.assign(P, { title: m.name, hero: { display: `${vis.length} visits` }, series: [{ colorSlot: 0, points: weeks }], footer: `Last 8 weeks · ${scopeLbl}`,
          takeaway: `${money(sum(vis) / (vis.length || 1))} a visit${lastV ? `, last on ${md(lastV.date)}` : ''}` });
      },
      V14() {
        const found = D.subs.map(s => { const l = base.filter(t => t.merchant === s); return l.length >= 3 ? { label: s, amount: l[0].amount, display: money(l[0].amount), next: md(new Date(l[0].date.getFullYear(), l[0].date.getMonth() + 1, l[0].date.getDate())), since: l.length } : null; }).filter(Boolean);
        const tot = found.reduce((n, s) => n + s.amount, 0);
        Object.assign(P, { title: 'Subscriptions', hero: { display: `${money(tot)} / month` }, series: [{ points: found }], footer: `Seen 3+ months in a row · ${scopeLbl}`,
          takeaway: `${found.length} recurring payments · ${money(tot * 12)} a year` });
      },
      // Dumbbell: each category, last month (same days) → this month so far.
      V15() {
        const pa = addM(som(TODAY), -1), pb = day(pa, TODAY.getDate() - 1), was = {}, now = {};
        base.filter(t => inR(t, pa, pb)).forEach(t => (was[t.category] = (was[t.category] || 0) + t.amount));
        base.filter(t => inR(t, som(TODAY), TODAY)).forEach(t => (now[t.category] = (now[t.category] || 0) + t.amount));
        const pts = [...new Set([...Object.keys(was), ...Object.keys(now)])].map(label => ({ label, from: +(was[label] || 0).toFixed(2), to: +(now[label] || 0).toFixed(2) }))
          .sort((a, b) => Math.max(b.from, b.to) - Math.max(a.from, a.to)).slice(0, 6);
        pts.forEach(p => { p.amount = p.to - p.from; p.fromDisplay = short(p.from); p.display = short(p.to); });
        const mv = [...pts].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))[0];
        Object.assign(P, { series: [{ points: pts }], legend: [{ label: `${mon(pa)} 1–${TODAY.getDate()}`, colorSlot: -1 }, { label: `${mon(TODAY)} 1–${TODAY.getDate()}`, colorSlot: 0 }],
          footer: `${mon(TODAY)} 1–${TODAY.getDate()} vs ${mon(pa)} 1–${TODAY.getDate()} · ${scopeLbl}`,
          takeaway: mv ? `Biggest move: ${mv.label} ${mv.amount >= 0 ? 'up' : 'down'} ${money(Math.abs(mv.amount))}` : 'No spending to compare' });
      },
      // Declined attempts — kept apart from spend; nothing here was charged.
      V16() {
        const rows = D.declines.filter(t => (!scope.cardId || t.cardId === scope.cardId) && inR(t, r.a, r.b) && (!subj || (subj.kind === 'category' ? t.category === subj.name : t.merchant === subj.name)))
          .sort((a, b) => b.date - a.date).map(t => ({ label: t.merchant, amount: t.amount, display: money(t.amount), reason: t.reason,
            when: `${md(t.date)} · ${t.date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} · ••${D.card(t.cardId).last4}` }));
        Object.assign(P, { series: [{ points: rows }], keepFooter: true, footer: `${md(r.a)} – ${md(r.b)} · ${scopeLbl} · not counted in spend`,
          takeaway: rows.length ? `${rows.length} declined ${r.label} — ${rows.length > 1 ? 'none were' : 'it wasn’t'} charged` : `No declined payments ${r.label}` });
      },
      // What's left of a card's daily limit today.
      V17() {
        const spent = sum(base.filter(t => inR(t, TODAY, TODAY) && t.cardId === dcard.id));
        const left = Math.max(0, dcard.daily - spent);
        Object.assign(P, { hero: { display: `${money(left)} left today` },
          meter: { limit: dcard.daily, spent, limitDisplay: `${money(dcard.daily)} daily limit`, spentDisplay: `${money(spent)} spent` },
          keepFooter: true, footer: `${md(TODAY)} · ${D.tag(dcard)} · resets at midnight`,
          takeaway: spent >= dcard.daily ? 'You’ve reached today’s limit on this card' : spent ? `${money(spent)} spent on ${D.tag(dcard)} so far today` : `Nothing spent on ${D.tag(dcard)} yet today` });
      },
      // Month calendar: each day shaded by what went out that day.
      V19() {
        const mStart = q.period === 'last month' ? addM(som(TODAY), -1) : som(TODAY), dim = new Date(mStart.getFullYear(), mStart.getMonth() + 1, 0).getDate();
        const days = Array.from({ length: dim }, (_, i) => { const d = day(mStart, i); const amt = d > TODAY ? null : sum(pick(d, d)); return { label: String(i + 1), amount: amt, display: amt == null ? '' : short(amt), today: +d === +TODAY }; });
        const past = days.filter(x => x.amount != null), top = past.reduce((m, x) => (x.amount > m.amount ? x : m), past[0] || { amount: 0 });
        const quiet = past.filter(x => !x.amount).length, tot = past.reduce((n, x) => n + x.amount, 0);
        Object.assign(P, { series: [{ colorSlot: 0, points: days }], offset: (mStart.getDay() + 6) % 7, hero: { display: money(tot) },
          keepFooter: true, footer: `${subj ? subj.name + ' · ' : ''}${md(mStart)}–${mStart.getMonth() === TODAY.getMonth() ? TODAY.getDate() + ' · so far' : dim} · ${scopeLbl}`,
          takeaway: top.amount ? `Biggest day ${mon(mStart)} ${top.label} at ${money(top.amount)}${quiet ? ` · ${quiet} no-spend day${quiet > 1 ? 's' : ''}` : ''}` : 'No spending this month' });
      },
      // Category rows; tap one to see the merchants inside it.
      V20() {
        const s = cats;
        const inside = c => { const m = {}; cur.filter(t => t.category === c).forEach(t => { m[t.merchant] = m[t.merchant] || { n: 0, a: 0 }; m[t.merchant].n++; m[t.merchant].a += t.amount; });
          return Object.entries(m).sort((a, b) => b[1].a - a[1].a).slice(0, 5).map(([label, v]) => ({ label, display: money(v.a), when: `${v.n} payment${v.n > 1 ? 's' : ''}` })); };
        const pts = s.slice(0, 6).map(([label, amount], i) => ({ label, amount, display: money(amount), colorSlot: i === 0 ? 0 : -1, inside: inside(label) }));
        const other = s.slice(6).reduce((n, x) => n + x[1], 0);
        if (other > 0) pts.push({ label: 'Other', amount: other, display: money(other), colorSlot: -1, other: true, count: s.length - 6 });
        Object.assign(P, { series: [{ points: pts }], takeaway: pts.length ? `${pts[0].label} leads at ${pts[0].display} — tap a category for its merchants` : 'No spending in this period' });
      },
      V18() {
        const months = []; for (let i = 6; i >= 1; i--) { const a = addM(som(TODAY), -i); months.push(sum(pick(a, day(addM(a, 1), -1)))); }
        const dim = new Date(TODAY.getFullYear(), TODAY.getMonth() + 1, 0).getDate();
        const proj = total / TODAY.getDate() * dim, lo = pct(months, .25), hi = pct(months, .75);
        const level = proj > hi ? 'MORE' : proj < lo ? 'LESS' : 'ABOUT';
        Object.assign(P, { title: subj ? `Is ${what} a lot this month?` : 'Is this month a lot?', hero: { display: money(total), delta: null },
          band: { low: lo, high: hi, median: median(months), lowDisplay: short(lo), highDisplay: short(hi) }, marker: proj, max: Math.max(hi, proj, ...months) * 1.15,
          verdict: { level, label: { MORE: 'More than usual', LESS: 'Less than usual', ABOUT: 'About usual' }[level], glyph: { MORE: '↑', LESS: '↓', ABOUT: '≈' }[level] },
          takeaway: `On course for ${short(proj)}; usual is ${short(lo)}–${short(hi)}` });
      },
      V21() {
        const a = day(TODAY, -14), rows = [];
        base.filter(t => inR(t, a, TODAY)).forEach(t => {
          const hist = base.filter(x => x.merchant === t.merchant && x !== t).map(x => x.amount), m = median(hist);
          const earlier = hist.length && base.some(x => x.merchant === t.merchant && x.date < t.date);
          if (hist.length >= 3 && t.amount > 3 * m) rows.push({ label: t.merchant, amount: t.amount, display: money(t.amount), when: md(t.date), reason: `${Math.round(t.amount / m)}× your usual` });
          else if (!earlier && t.amount >= 20) rows.push({ label: t.merchant, amount: t.amount, display: money(t.amount), when: md(t.date), reason: 'First time here' });
        });
        Object.assign(P, { title: 'Unusual activity', series: [{ points: rows }], footer: `Last 14 days · ${scopeLbl}`,
          takeaway: rows.length ? `${rows.length} payment${rows.length > 1 ? 's' : ''} worth a look` : 'Nothing unusual in the last 14 days' });
      },
    };
    V[P.visual]();
    P.partial = !!r.partial;
    const Subj = subj ? subj.name : null;
    const TITLE = {
      V1: `${Subj || 'All spend'} · ${per}`, V2: `${q.subjects.slice(0, 2).map(x => x.name).join(' vs ')} · ${per}`,
      V3: `${Subj || 'All spend'} · ${q.split === 'WEEK' ? 'by week' : per}`, V5: `${Subj ? Subj + ' · ' : ''}${q.intent === 'BY_TYPE' ? 'Debit vs credit' : 'By card'} · ${per}`,
      V6: `${Subj ? Subj + ' · ' : ''}${q.by && q.by.type ? 'Debit vs credit' : q.by && !q.by.card && q.by.category ? 'By category' : 'By card'} · ${per}`,
      V4: `${q.subjects.slice(0, 3).map(x => x.name).join(' vs ')} · ${per}`, V15: `By category · ${mon(addM(som(TODAY), -1))} → ${mon(TODAY)}`,
      V16: `Declined payments · ${q.period === 'last 30 days' ? '30 days' : per}`, V17: `${dcard ? D.tag(dcard) : 'Daily limit'} · Today`,
      V19: `${Subj || 'All spend'} · ${q.period === 'last month' ? mon(addM(som(TODAY), -1)) : mon(TODAY)}`, V20: `By category · ${per}`, V7: q.intent === 'TOP' ? `${Subj ? Subj + ' · merchants' : 'Top merchants'} · ${per}` : `Top categories · ${per}`,
      V8: `Spend by category · ${per}`, V11: `What changed · ${per}`, V12: `${Subj || 'All spend'} · by weekday`, V21: 'Unusual activity', V14: 'Subscriptions & bills',
    };
    if (TITLE[P.visual]) P.title = TITLE[P.visual];
    if (!P.keepFooter && !/Last 8 weeks|Last 14 days|Seen 3\+|vs /.test(P.footer)) P.footer = `${Subj && P.visual !== 'V2' && P.visual !== 'V4' ? Subj + ' · ' : ''}${md(r.a)}–${r.a.getMonth() === r.b.getMonth() ? r.b.getDate() : md(r.b)}${r.partial ? ' · so far' : ''} · ${scopeLbl}`;
    P.answer = P.takeaway;
    return P;
  }

  // Several subjects with a split → one page per subject, same view on each (max 3).
  function buildAll(text, scope) {
    const q = read(text);
    if (q.subjects.length > 1 && ['STACK', 'BY_TYPE', 'BY_CARD', 'TREND', 'TOP'].includes(q.intent)) {
      return q.subjects.slice(0, 3).map(sj => build(text, scope, sj));
    }
    return [build(text, scope)];
  }

  window.Insights = { read, choose, build, buildAll, money };
})();
