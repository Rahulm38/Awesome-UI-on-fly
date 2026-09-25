/* Demo data. Entirely fictional, generated relative to today on every load,
 * held in memory only. Reload the page to reset. */
(function () {
  let seed = 7;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

  const cards = [
    { id: 'c1', name: 'Everyday', type: 'Debit', last4: '4821', state: 'ACTIVE', frozen: false },
    { id: 'c2', name: 'Travel', type: 'Credit', last4: '1937', state: 'ACTIVE', frozen: true },
    { id: 'c5', name: 'Rewards', type: 'Credit', last4: '3344', state: 'ACTIVE', frozen: false },
    { id: 'c6', name: 'Family', type: 'Debit', last4: '1122', state: 'ACTIVE', frozen: false },
    { id: 'c7', name: 'Premier', type: 'Credit', last4: '8649', state: 'ACTIVE', frozen: false },
    { id: 'c3', name: 'Virtual', type: 'Prepaid', last4: '7710', state: 'PENDING_ACTIVATION', frozen: false },
    { id: 'c4', name: 'Old card', type: 'Debit', last4: '0042', state: 'CLOSED', archived: true, frozen: false },
  ].map(c => Object.assign({ limit: null, blocked: [], allow: [], intlRestricted: false, atm: true, disputes: [] }, c));

  // Which card people reach for, per category (weights over card ids).
  const HABIT = {
    'Food & Dining': { c1: 5, c5: 4, c7: 1 }, Groceries: { c6: 6, c1: 3, c5: 1 }, Transport: { c1: 4, c5: 3, c2: 1 },
    Shopping: { c7: 5, c5: 3, c1: 2 }, Travel: { c2: 7, c7: 3 }, Entertainment: { c5: 5, c1: 3, c7: 2 },
    Health: { c6: 5, c1: 3 }, Utilities: { c6: 8, c1: 2 }, Household: { c6: 6, c7: 2, c1: 2 }, 'Personal care': { c1: 5, c5: 5 },
    Education: { c7: 6, c6: 4 }, Pets: { c6: 6, c1: 4 }, Gifts: { c5: 5, c7: 5 }, Subscriptions: { c1: 1 },
  };
  const whichCard = cat => { const h = HABIT[cat] || { c1: 1 }, tot = Object.values(h).reduce((a, b) => a + b, 0); let r = rnd() * tot;
    for (const [id, w] of Object.entries(h)) { if ((r -= w) < 0) return id; } return 'c1'; };

  // [merchant, category, min, max, visits-per-week, logo bg, logo fg, monogram, city]
  const merchants = [
    ['Brewline Coffee', 'Food & Dining', 4, 9, 3, '#3b2a20', '#f6d7b0', 'Bc', 'San Francisco'],
    ['Greenleaf Bowls', 'Food & Dining', 12, 19, 1.2, '#1f7a4d', '#e8fff1', 'Gl', 'San Francisco'],
    ['Casa Taco', 'Food & Dining', 10, 16, 0.8, '#f2b134', '#3a2300', 'CT', 'Oakland'],
    ['Night Owl Diner', 'Food & Dining', 14, 32, 0.4, '#1d1b3a', '#f7c948', 'NO', 'San Francisco'],
    ['Zipride', 'Transport', 9, 34, 1.4, '#111111', '#ffffff', 'Z', 'San Francisco'],
    ['Fuelstop', 'Transport', 30, 62, 0.6, '#d9372b', '#fff4d6', 'F', 'Daly City'],
    ['MetroPass Transit', 'Transport', 2.5, 6, 1.5, '#0c6e5a', '#e6fff8', 'M', 'San Francisco'],
    ['Harvest Market', 'Groceries', 25, 140, 1.3, '#2e6b3a', '#f3f7d9', 'H', 'San Francisco'],
    ['Corner Grocer', 'Groceries', 20, 80, 0.7, '#b8452d', '#fff1e8', 'cg', 'San Francisco'],
    ['Parcelhub', 'Shopping', 15, 120, 0.9, '#232f3e', '#ffb347', 'P', 'Online'],
    ['Northwind Store', 'Shopping', 18, 90, 0.4, '#b3122e', '#ffffff', 'N', 'Colma'],
    ['Threadline Apparel', 'Shopping', 25, 110, 0.25, '#f4efe6', '#3d2f23', 'T', 'Online'],
    ['Skyline Air', 'Travel', 180, 420, 0, '#0b3d91', '#9fd3ff', 'S', 'Online'],
    ['Starlight Cinemas', 'Entertainment', 14, 32, 0.25, '#2b1b4f', '#ffd166', '★', 'San Francisco'],
    ['Arcade Nine', 'Entertainment', 10, 40, 0.15, '#ff3d7f', '#ffffff', 'A9', 'Oakland'],
    ['CareWell Pharmacy', 'Health', 8, 45, 0.45, '#e8f5ff', '#0b6fb8', '+', 'San Francisco'],
    ['Homestead Supply', 'Household', 12, 85, 0.35, '#6b4f2a', '#fff3dc', 'Hs', 'Daly City'],
    ['Glow Studio', 'Personal care', 25, 70, 0.15, '#fbe3ee', '#b0306b', 'G', 'San Francisco'],
    ['Pawsome Pets', 'Pets', 15, 60, 0.3, '#ffcf3f', '#402c00', 'P', 'Oakland'],
    ['Petal & Stem', 'Gifts', 30, 75, 0.08, '#fce8ec', '#c2185b', 'P&', 'San Francisco'],
  ];
  // Monthly bills and subscriptions: [merchant, category, amount, day of month, logo bg, logo fg, monogram]
  const subs = [
    ['Streamly', 'Entertainment', 15.49, 3, '#e50914', '#ffffff', 'S'], ['Tuneloop', 'Entertainment', 10.99, 11, '#1db954', '#08160c', 'T'],
    ['CloudVault', 'Subscriptions', 2.99, 17, '#e8f0fe', '#1a56db', 'cv'], ['Pulse Gym', 'Health', 39, 1, '#ff5a1f', '#ffffff', 'P'],
    ['Voltline Energy', 'Utilities', 86.4, 6, '#ffe45c', '#2b2600', 'V'], ['Linkwave Internet', 'Utilities', 59.99, 14, '#1c3faa', '#dfe7ff', 'L'],
    ['Tellio Mobile', 'Utilities', 45, 21, '#6c2bd9', '#f1e8ff', 'T'], ['Brightpath Courses', 'Education', 29, 9, '#0f766e', '#ccfbf1', 'B'],
  ];
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
      if (acc[i] >= 1) { acc[i] -= 1; push(date, m, cat, lo + (0.25 + rnd() * 0.5) * (hi - lo), whichCard(cat)); }
    });
    for (const [m, cat, amt, dom] of subs) if (date.getDate() === dom) push(date, m, cat, amt, cat === 'Utilities' || cat === 'Education' ? 'c6' : 'c1');
  }
  // A trip in the summer, booked once.
  const trip = new Date(now); trip.setDate(now.getDate() - 68);
  push(trip, 'Skyline Air', 'Travel', 348.20, 'c2');
  // One charge well outside the usual, for "anything unusual?"
  const odd = new Date(now); odd.setDate(now.getDate() - 1);
  push(odd, 'Parcelhub', 'Shopping', 389.99, 'c7');
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
