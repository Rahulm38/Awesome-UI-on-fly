/* Demo data. Entirely fictional, generated relative to today on every load,
 * held in memory only. Reload the page to reset. */
(function () {
  let seed = 7;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

  const cards = [
    { id: 'c1', name: 'Everyday', type: 'Debit', last4: '4821', state: 'ACTIVE', frozen: false },
    { id: 'c2', name: 'Travel', type: 'Credit', last4: '1937', state: 'ACTIVE', frozen: true },
    { id: 'c3', name: 'Virtual', type: 'Prepaid', last4: '7710', state: 'PENDING_ACTIVATION', frozen: false },
    { id: 'c4', name: 'Old card', type: 'Debit', last4: '0042', state: 'CLOSED', archived: true, frozen: false },
  ].map(c => Object.assign({ limit: null, blocked: [], allow: [], intlRestricted: false, atm: true, disputes: [] }, c));

  // [merchant, category, min, max, visits-per-week, logo bg, logo fg, monogram, city]
  const merchants = [
    ['Brewline Coffee', 'Food & Dining', 4, 9, 3, '#3b2a20', '#f6d7b0', 'Bc', 'San Francisco'],
    ['Greenleaf Bowls', 'Food & Dining', 12, 19, 1.2, '#1f7a4d', '#e8fff1', 'Gl', 'San Francisco'],
    ['Casa Taco', 'Food & Dining', 10, 16, 0.8, '#f2b134', '#3a2300', 'CT', 'Oakland'],
    ['Zipride', 'Transport', 9, 34, 1.4, '#111111', '#ffffff', 'Z', 'San Francisco'],
    ['Fuelstop', 'Transport', 30, 62, 0.6, '#d9372b', '#fff4d6', 'F', 'Daly City'],
    ['Harvest Market', 'Groceries', 25, 140, 1.3, '#2e6b3a', '#f3f7d9', 'H', 'San Francisco'],
    ['Corner Grocer', 'Groceries', 20, 80, 0.7, '#b8452d', '#fff1e8', 'cg', 'San Francisco'],
    ['Parcelhub', 'Shopping', 15, 120, 0.9, '#232f3e', '#ffb347', 'P', 'Online'],
    ['Northwind Store', 'Shopping', 18, 90, 0.4, '#b3122e', '#ffffff', 'N', 'Colma'],
    ['Skyline Air', 'Travel', 180, 420, 0, '#0b3d91', '#9fd3ff', 'S', 'Online'],
    ['Starlight Cinemas', 'Entertainment', 14, 32, 0.25, '#2b1b4f', '#ffd166', '★', 'San Francisco'],
  ];
  const subs = [['Streamly', 'Entertainment', 15.49, 3, '#e50914', '#ffffff', 'S'], ['Tuneloop', 'Entertainment', 10.99, 11, '#1db954', '#08160c', 'T'],
    ['CloudVault', 'Subscriptions', 2.99, 17, '#e8f0fe', '#1a56db', 'cv'], ['Pulse Gym', 'Health', 39, 1, '#ff5a1f', '#ffffff', 'P']];
  const LOGOS = {};
  merchants.forEach(m => (LOGOS[m[0]] = { bg: m[5], fg: m[6], t: m[7], city: m[8] }));
  subs.forEach(m => (LOGOS[m[0]] = { bg: m[4], fg: m[5], t: m[6], city: 'Online' }));

  const txns = [];
  const day0 = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); };
  const now = new Date(); now.setHours(12, 0, 0, 0);
  const push = (date, m, cat, amount, cardId) => {
    const at = new Date(date); at.setHours(7 + Math.floor(rnd() * 14), Math.floor(rnd() * 60));
    txns.push({ id: 't' + txns.length, date: at, merchant: m, category: cat, amount: +amount.toFixed(2), cardId, city: LOGOS[m].city, pending: false });
  };
  // Visits follow a steady rhythm per merchant (an accumulator, not coin flips),
  // so months compare the way real ones do; only amounts and timing vary.
  const acc = merchants.map(() => rnd());
  for (let d = 0; d < 190; d++) {
    const date = new Date(now); date.setDate(now.getDate() - d);
    const weekend = date.getDay() === 0 || date.getDay() === 6;
    merchants.forEach(([m, cat, lo, hi, w], i) => {
      acc[i] += (w / 7) * (weekend && cat === 'Food & Dining' ? 1.6 : 0.85) * (0.7 + rnd() * 0.6);
      if (acc[i] >= 1) { acc[i] -= 1; push(date, m, cat, lo + (0.25 + rnd() * 0.5) * (hi - lo), rnd() < 0.85 ? 'c1' : 'c2'); }
    });
    for (const [m, cat, amt, dom] of subs) if (date.getDate() === dom) push(date, m, cat, amt, 'c1');
  }
  // A trip in the summer, booked once.
  const trip = new Date(now); trip.setDate(now.getDate() - 68);
  push(trip, 'Skyline Air', 'Travel', 348.20, 'c2');
  // One charge well outside the usual, for "anything unusual?"
  const odd = new Date(now); odd.setDate(now.getDate() - 1);
  push(odd, 'Parcelhub', 'Shopping', 389.99, 'c1');
  txns.sort((a, b) => b.date - a.date);
  txns.filter(t => day0(t.date) >= day0(now)).forEach(t => (t.pending = true));

  const initial = JSON.stringify(cards);
  window.NovaData = {
    // Put every card back the way it started — stories begin from the same state.
    reset() { JSON.parse(initial).forEach((c, i) => Object.assign(cards[i], c)); },
    cards, txns, logos: LOGOS, subs: subs.map(s => s[0]),
    merchants: [...merchants.map(m => m[0]), ...subs.map(s => s[0])],
    categories: [...new Set([...merchants.map(m => m[1]), ...subs.map(s => s[1])])],
    countries: ['Japan', 'France', 'Mexico', 'Canada', 'Italy', 'Spain', 'Germany', 'India', 'Brazil', 'Thailand', 'Portugal'],
    card: id => cards.find(c => c.id === id),
    tag: c => `${c.name} ••${c.last4}`,
  };
})();
