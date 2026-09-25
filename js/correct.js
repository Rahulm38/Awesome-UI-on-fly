/* Mandatory autocorrect for everything that reaches Jev, the LLM and Insights —
 * typed or spoken. The vocabulary comes from the demo's own world (actions,
 * categories, merchants, cards, countries), so ordinary English is left alone.
 *
 *   Correct.fix(text)  → { text, changes: [[from, to], …] }
 *   Correct.word(w)    → the corrected word (or w)                               */
(function () {
  const D = window.NovaData;
  const BASE = ('freeze unfreeze frozen limit limits block unblock merchant merchants subscriptions subscription dispute stolen lost travel ' +
    'travelling traveling activate spending spend spent groceries grocery transport restaurants restaurant weekly monthly compare unusual ' +
    'suspicious category categories breakdown withdrawals withdrawal international abroad overseas transactions transaction statement rewards ' +
    'charge charges recognise recognize budget month months week weeks weekend weekends card cards everyday virtual today yesterday ' +
    'entertainment shopping dining coffee often which where money much last this next versus atm pin forgot find near nearest turn show ' +
    'biggest changed usual normal typical visits habit remaining left trend dollars hundred thousand').split(' ');
  const WORLD = [...D.merchants, ...D.countries, ...D.categories, ...D.cards.map(c => c.name)]
    .flatMap(s => s.toLowerCase().split(/[^a-z’']+/)).filter(w => w.length > 2);
  const VOCAB = [...new Set([...BASE, ...WORLD])];
  const KNOWN = new Set(VOCAB);

  // What speech-to-text tends to produce for this world.
  const PHRASES = [
    [/\bzip ride\b/g, 'zipride'], [/\bbrew line\b/g, 'brewline'], [/\bparcel hub\b/g, 'parcelhub'], [/\bstream ?lee\b/g, 'streamly'],
    [/\btune loop\b/g, 'tuneloop'], [/\bcloud vault\b/g, 'cloudvault'], [/\bfuel stop\b/g, 'fuelstop'], [/\bun ?freeze\b/g, 'unfreeze'],
    [/\ba t m\b/g, 'atm'], [/\bp i n\b/g, 'pin'], [/\bfrees my\b/g, 'freeze my'], [/\bfree my card\b/g, 'freeze my card'],
    [/\bsubscriptions? list\b/g, 'subscriptions'], [/\bper cent\b/g, 'percent'],
  ];
  const NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20, fifty: 50 };

  function dist(a, b) {
    const m = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) m[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
      m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) m[i][j] = Math.min(m[i][j], m[i - 2][j - 2] + 1);
    }
    return m[a.length][b.length];
  }

  // A word is corrected only when it's unknown, long enough to be a real attempt,
  // starts with the same letter, and exactly one known word is close enough.
  function word(w) {
    const lw = w.toLowerCase();
    if (lw.length < 4 || KNOWN.has(lw) || /\d/.test(lw)) return w;
    const max = lw.length >= 8 ? 2 : 1;
    const near = VOCAB.filter(v => v[0] === lw[0] && Math.abs(v.length - lw.length) <= max).map(v => [v, dist(lw, v)]).filter(([, d]) => d <= max);
    if (!near.length) return w;
    near.sort((x, y) => x[1] - y[1]);
    if (near.length > 1 && near[0][1] === near[1][1]) return w;          // ambiguous → leave it
    const to = near[0][0];
    return w[0] === w[0].toUpperCase() ? to[0].toUpperCase() + to.slice(1) : to;
  }

  // "five hundred dollars" → "$500", "fifteen hundred" → "1500"
  function amounts(t) {
    return t.replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|twelve|fifteen|twenty|fifty)\s+(hundred|thousand)(\s+dollars?)?\b/gi,
      (m, n, u, dol) => (dol ? '$' : '') + NUM[n.toLowerCase()] * (u.toLowerCase() === 'hundred' ? 100 : 1000));
  }

  function fix(text) {
    const changes = [];
    let t = text;
    for (const [re, to] of PHRASES) t = t.replace(new RegExp(re.source, 'gi'), m => { changes.push([m, to]); return to; });
    const a = amounts(t); if (a !== t) { changes.push(['amount in words', 'digits']); t = a; }
    t = t.replace(/[A-Za-z’']+/g, w => { const c = word(w); if (c !== w) changes.push([w, c]); return c; });
    return { text: t, changes };
  }

  window.Correct = { fix, word };
})();
