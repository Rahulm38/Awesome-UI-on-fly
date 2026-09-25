/* The LLM side (simulated) plus two pure helpers.
 *
 * Slots.extract  — what a general LLM is good at: pulling open values out of a
 *                  sentence (amounts, merchant names, countries, periods).
 * Dates.parse    — PURE, no model: "next week" → a calendar range. It returns
 *                  null whenever it is unsure instead of guessing a window.
 * (Spending questions are read and charted in insights.js.) */
(function () {
  const D = window.NovaData;
  const day = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); x.setHours(0, 0, 0, 0); return x; };
  const fmt = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const iso = d => d.toISOString().slice(0, 10);

  const Dates = {
    parse(t, now = new Date()) {
      const today = day(now, 0), dow = (today.getDay() + 6) % 7; // Monday = 0
      let m;
      if (/\bnext week\b/.test(t)) return range(day(today, 7 - dow), day(today, 13 - dow));
      if (/\btomorrow\b/.test(t)) return range(day(today, 1), day(today, 1));
      if (/\bthis weekend\b/.test(t)) return range(day(today, 5 - dow), day(today, 6 - dow));
      if ((m = t.match(/\bfor (\d{1,2}) (day|week)s?\b/))) return range(today, day(today, (+m[1]) * (m[2] === 'week' ? 7 : 1) - 1));
      return null;
      function range(a, b) { return { start: iso(a), end: iso(b), label: a.getTime() === b.getTime() ? `on ${fmt(a)}` : `${fmt(a)} – ${fmt(b)}` }; }
    },
  };

  const CATS = [
    [/\b(food|dining|restaurants?|eat\w*|coffee|lunch|dinner)\b/, 'Food & Dining'],
    [/\b(groceries|grocery|supermarket)\b/, 'Groceries'],
    [/\b(transport|rides?|taxi|gas|fuel)\b/, 'Transport'],
    [/\b(shopping|clothes)\b/, 'Shopping'],
    [/\b(entertainment|streaming|subscriptions?)\b/, 'Entertainment'],
    [/\b(flights?|airfare)\b/, 'Travel'],
      [/\b(health|pharmacy|medical|doctor|medicine|gym)\b/, 'Health'], [/\b(utilit(y|ies)|electricity|power bill|internet|phone bill|mobile bill)\b/, 'Utilities'],
    [/\b(household|home goods)\b/, 'Household'], [/\b(personal care|salon|beauty|haircut)\b/, 'Personal care'], [/\b(education|courses?|learning|tuition)\b/, 'Education'],
    [/\b(pets?|pet food|vet)\b/, 'Pets'], [/\b(gifts?|flowers?)\b/, 'Gifts'],
  ];

  const Slots = {
    extract(text) {
      const t = text.toLowerCase(), s = {};
      for (const c of D.cards) if (t.includes(c.last4) || t.includes(c.name.toLowerCase() + ' card'))
        { s.cardId = c.id; break; }
      if (/\b(all|every|both)\b.*\bcards\b|\ball (of )?my cards\b/.test(t)) s.allCards = true;

      const last4s = D.cards.map(c => c.last4);
      const am = t.match(/\$\s?(\d[\d,]*(?:\.\d+)?)\s*(k)?|\b(\d[\d,]*(?:\.\d+)?)\s*(k|dollars|usd|bucks)\b|\b(?:to|at|of)\s+(\d{2,6})\b/);
      if (am) {
        const n = parseFloat((am[1] || am[3] || am[5]).replace(/,/g, '')) * ((am[2] || am[4]) === 'k' ? 1000 : 1);
        if (!last4s.includes(String(n))) s.amount = n;
      }
      const merchant = D.merchants.find(m => t.includes(m.toLowerCase())) || D.merchants.find(m => new RegExp('\\b' + m.split(' ')[0].toLowerCase() + '\\b').test(t));
      if (merchant) s.merchant = merchant;
      const country = D.countries.find(c => new RegExp('\\b' + c.toLowerCase() + '\\b').test(t));
      if (country) s.country = country;
      const dates = Dates.parse(t);
      if (dates) s.dates = dates;
      const cat = CATS.find(([re]) => re.test(t));
      if (cat) s.category = cat[1];
      s.period = /\blast month\b/.test(t) ? 'last month' : /\blast week\b/.test(t) ? 'last week'
        : /\bthis week\b/.test(t) ? 'this week' : /\b(30 days|past month)\b/.test(t) ? 'last 30 days' : 'this month';
      return s;
    },
  };

  window.Slots = Slots; window.Dates = Dates;
})();
