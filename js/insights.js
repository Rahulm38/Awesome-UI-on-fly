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
    [/\b(transport|rides?|taxi|gas|fuel)\b/, 'Transport'], [/\b(shopping|clothes)\b/, 'Shopping'],
    [/\b(entertainment|movies|streaming)\b/, 'Entertainment'], [/\b(flights?|airfare|travel spend)\b/, 'Travel'],
  ];
  const INTENTS = [
    ['UNUSUAL', /\b(unusual|strange|suspicious|weird|odd|out of the ordinary)\b/],
    ['SUBSCRIPTIONS', /\b(subscriptions?|recurring|monthly bills?)\b/],
    ['LIMIT', /\blimit\b.*\b(left|remaining|used)\b|\b(left|remaining)\b.*\blimit\b|left to spend|can i (still )?spend/],
    ['PACE', /\b(on track|pace|compared? (to|with) last month|vs\.? last month|than last month|this month compare)\b/],
    ['CHANGE', /\bwhat changed\b|\bwhy (is|was|did|am)\b.*\b(higher|more|up|increase)|\bchanged\b/],
    ['WEEKDAY', /\bwhich days?\b|\bweekday|\bweekends?\b|day of the week|what day/],
    ['HABIT', /\bhow often\b|\bvisits?\b|\bhabit\b/],
    ['NORMAL', /\ba lot\b|\bnormal\b|\btypical\b|\busual\b|\btoo much\b/],
    ['BY_CARD', /\bby card\b|\bwhich card\b|\beach card\b|debit (vs|or) credit/],
    ['COMPARE', /\bvs\.?\b|\bversus\b|\bcompare\b|\bor\b/],
    ['TOP', /\btop\b|\bbiggest\b|\bmost\b|\bmerchants\b/],
    ['BREAKDOWN', /\bwhere did\b|\bbreakdown\b|\bshare\b|\bsplit\b|\bcategor(y|ies)\b|money (go|went)/],
    ['TREND', /\btrend|over time|(per|by|each) (week|month)|weekly|monthly|last (\d|three|six) months/],
  ];
  function read(text) {
    const t = text.toLowerCase().replace(/’/g, "'");
    const subjects = [];
    CATS.forEach(([re, c]) => { if (re.test(t)) subjects.push({ kind: 'category', name: c }); });
    D.merchants.forEach(m => { if (t.includes(m.toLowerCase()) || new RegExp('\\b' + m.split(' ')[0].toLowerCase() + '\\b').test(t)) subjects.push({ kind: 'merchant', name: m }); });
    let intent = (INTENTS.find(([, re]) => re.test(t)) || ['TOTAL'])[0];
    if (intent === 'COMPARE' && subjects.length < 2) intent = /last month/.test(t) ? 'PACE' : 'TOTAL';
    if (intent === 'HABIT' && !subjects.some(s => s.kind === 'merchant')) intent = 'TOTAL';
    const period = /\btoday\b/.test(t) ? 'today' : /\byesterday\b/.test(t) ? 'yesterday' : /\blast week\b/.test(t) ? 'last week' : /\bthis week\b/.test(t) ? 'this week'
      : /\blast month\b/.test(t) ? 'last month' : /last (6|six) months/.test(t) ? 'last 6 months' : /last (3|three) months/.test(t) ? 'last 3 months'
      : /30 days/.test(t) ? 'last 30 days' : intent === 'TREND' ? (/week/.test(t) ? 'last 8 weeks' : 'last 6 months') : 'this month';
    const split = /week/.test(t) && intent === 'TREND' ? 'WEEK' : intent === 'TREND' ? 'MONTH' : null;
    return { intent, subjects, period, split };
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
      default: return { a: som(TODAY), b: TODAY, label: `in ${mon(TODAY)} so far`, partial: true };
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
    if (intent === 'UNUSUAL') return ok('V21', 'asked for anything unusual');
    if (intent === 'SUBSCRIPTIONS') return ok('V14', 'asked about recurring payments');
    if (intent === 'LIMIT') { if (ctx.limit) return ok('V9', 'a limit exists → meter with an even-pace tick'); fall('V9', 'no limit set on this card'); }
    if (intent === 'PACE') { if (TODAY.getDate() >= 5) return ok('V10', 'this month vs last, cumulative; ≥5 days in'); fall('V10', 'fewer than 5 days into the month'); }
    if (intent === 'CHANGE') return ok('V11', 'asked what changed → ↑/↓ by category');
    if (intent === 'WEEKDAY') return ok('V12', 'asked about days → weekday strip');
    if (intent === 'HABIT') return ok('V13', 'a merchant + how often → visits and last visit');
    if (intent === 'NORMAL') { if (ctx.history >= 3) return ok('V18', 'your usual range as a band, this month as a marker'); fall('V18', 'under 3 months of history'); }
    if (intent === 'BY_CARD') { if (ctx.topShare < 0.97) return ok('V5', 'one 100% bar split by card'); fall('V5', `${Math.round(ctx.topShare * 100)}% on one card — a split bar would be a single colour`); }
    if (intent === 'COMPARE' && q.subjects.length >= 2) return ok('V2', 'two subjects → face-off');
    if (intent === 'TOP') return ok('V7', 'ranked merchants, top 5 + other');
    if (intent === 'BREAKDOWN') {
      if (ctx.ratio >= 1.3) return ok('V8', `top slice is ${ctx.ratio.toFixed(1)}× the next → donut reads clearly`);
      fall('V8', `top slice only ${ctx.ratio.toFixed(1)}× the next (< 1.3×) → a donut would be unreadable`);
      return ok('V7', 'ranked bars, top 5 + other');
    }
    if (intent === 'TREND') return ok('V3', `columns by ${q.split === 'WEEK' ? 'week' : 'month'} with your usual line`);
    return ok('V1', 'one number: stat tile with change and sparkline');
  }

  // ── build ────────────────────────────────────────────────────────────────
  function build(text, scope) {
    const q = read(text);
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
    const ctx = { limit: card && card.limit, history: 6, ratio: cats.length > 1 ? cats[0][1] / cats[1][1] : 9, topShare: Math.max(0, ...Object.values(byCard)) / cardTot };
    const pickV = choose(q, ctx);
    const what = subj ? subj.name : 'everything';
    const scopeLbl = scope.cardId ? D.tag(D.card(scope.cardId)) : 'All cards';
    const P = { visual: pickV.visual, why: pickV.why, ladder: pickV.ladder, read: q, footer: `${md(r.a)} – ${md(r.b)}${r.partial ? ' · so far' : ''} · ${scopeLbl}` };
    const total = sum(cur);

    const V = {
      V1() {
        const pr = previous(q.period, r), prev = sum(pick(pr.a, pr.b));
        const d = prev ? (total - prev) / prev : null;
        const spark = [];
        for (let i = 5; i >= 0; i--) { const a = addM(som(TODAY), -i); spark.push(sum(pick(a, i ? day(addM(a, 1), -1) : TODAY))); }
        Object.assign(P, { title: `Spent on ${what}`, hero: { display: money(total), delta: d == null ? null : Math.abs(d) < 0.03 ? '≈ about the same' : `${d > 0 ? '↑' : '↓'} ${Math.abs(Math.round(d * 100))}% vs ${pr.label}` },
          series: [{ colorSlot: 0, points: spark.map((v, i) => ({ label: mon(addM(som(TODAY), i - 5)), amount: v })) }],
          takeaway: total === 0 ? `${money(0)} on ${what} ${r.label}` : `${money(total)} on ${what} ${r.label} across ${cur.length} payments` });
        if (!ctx.limit && q.intent === 'LIMIT') P.takeaway = 'No limit is set, so here’s what you’ve spent instead';
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
        const pts = Object.entries(byCard).sort((a, b) => b[1] - a[1]).map(([id, v], i) => ({ label: D.tag(D.card(id)), amount: v, display: money(v), share: v / cardTot, colorSlot: i ? i : 0 }));
        Object.assign(P, { title: `${what[0].toUpperCase() + what.slice(1)} by card`, series: [{ points: pts }], takeaway: `${Math.round(pts[0].share * 100)}% on ${pts[0].label}` });
      },
      V7() {
        const by = {}; cur.forEach(t => { const k = q.intent === 'TOP' ? t.merchant : t.category; by[k] = (by[k] || 0) + t.amount; });
        const s = Object.entries(by).sort((a, b) => b[1] - a[1]);
        const pts = s.slice(0, 5).map(([label, amount], i) => ({ label, amount, display: money(amount), colorSlot: 0 }));
        const other = s.slice(5).reduce((n, x) => n + x[1], 0);
        if (other > 0) pts.push({ label: 'Other', amount: other, display: money(other), colorSlot: -1 });
        Object.assign(P, { title: q.intent === 'TOP' ? 'Top merchants' : 'Where it went', series: [{ points: pts }], hero: { display: money(total) },
          takeaway: `${pts[0].label} leads with ${Math.round(pts[0].amount / total * 100)}%` });
      },
      V8() {
        const pts = cats.slice(0, 4).map(([label, amount], i) => ({ label, amount, display: money(amount), colorSlot: i + 1 }));
        const other = cats.slice(4).reduce((n, x) => n + x[1], 0);
        if (other > 0) pts.push({ label: 'Other', amount: other, display: money(other), colorSlot: -1 });
        Object.assign(P, { title: 'Where it went', series: [{ points: pts }], hero: { display: money(total) }, takeaway: `${pts[0].label} is ${Math.round(pts[0].amount / total * 100)}% of the total` });
      },
      V9() {
        const spent = sum(base.filter(t => inR(t, som(TODAY), TODAY) && t.cardId === card.id));
        const dim = new Date(TODAY.getFullYear(), TODAY.getMonth() + 1, 0).getDate();
        Object.assign(P, { title: `${D.tag(card)} limit`, hero: { display: `${money(Math.max(0, card.limit - spent))} left` },
          meter: { limit: card.limit, spent, pace: TODAY.getDate() / dim, limitDisplay: money(card.limit), spentDisplay: money(spent) },
          takeaway: spent > card.limit * TODAY.getDate() / dim ? 'Ahead of an even pace — slow down a little' : 'Under an even pace for the month',
          perDay: `${money(Math.max(0, (card.limit - spent) / (dim - TODAY.getDate() + 1)))} a day for the rest of ${mon(TODAY)}` });
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
          if (hist.length >= 3 && t.amount > 3 * m) rows.push({ label: t.merchant, amount: t.amount, display: money(t.amount), when: md(t.date), reason: `${Math.round(t.amount / m)}× your usual` });
        });
        Object.assign(P, { title: 'Unusual activity', series: [{ points: rows }], footer: `Last 14 days · ${scopeLbl}`,
          takeaway: rows.length ? `${rows.length} payment${rows.length > 1 ? 's' : ''} well above your usual` : `Nothing unusual on ${md(TODAY)}` });
      },
    };
    V[P.visual]();
    P.answer = P.takeaway;
    return P;
  }

  window.Insights = { read, choose, build, money };
})();
