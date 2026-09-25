/* Wiring: input → (live intent | turn) → phone + inspector. */
(function () {
  const $ = s => document.querySelector(s);
  const { settings, message, intent, log, bus } = window.Engine;
  const input = $('#input'), form = $('#composer');
  let live = false, replaying = false, seq = 0, inflight = 0, deb = null, busy = false, lastKey = 0, shown = null;

  // ── as-you-type ──────────────────────────────────────────────────────────
  // • nothing under 3 characters   • at most 2 requests in flight
  // • only the newest answer may paint, and only if its text is still what's typed
  // • a different chart swaps in only at a word boundary or after 600 ms of quiet
  async function ask(text) {
    if (text.trim().length < 3) { Phone.tray(null); return; }
    if (inflight >= 2) { log('2 keystroke requests already in flight — this one waits for the next pause', 'dim'); clearTimeout(deb); deb = setTimeout(() => ask(input.value), 150); return; }
    const my = ++seq; inflight++;
    let r;
    try { r = await intent(text, Phone.ctx, replaying); } finally { inflight--; }
    if (my !== seq || input.value !== text) { log(`dropped stale answer #${my} (“${text}”) — ${my !== seq ? 'a newer one exists' : 'text changed since'}`, 'dim'); return; }
    if (r.outage) { if (r.limited) { Phone.tray(null); return; } log(r.off ? 'Jev is off → no tray. The LLM and rules never answer keystrokes: absent beats slow or blunt.' : 'Jev unavailable → no tray. The LLM and rules never answer keystrokes: absent beats slow or blunt.', 'warn'); setTimeout(() => { if (my === seq) Phone.tray(null); }, 1500); return; }
    Engine.showDecision(r.decision, text, r.presentation);
    const p = r.presentation, vis = p.panel && p.panel.visual;
    if (shown && vis && shown !== vis && !/\s$/.test(text) && performance.now() - lastKey < 600) {
      log(`chart would change ${shown} → ${vis} mid-word — held until a word boundary or 600 ms of quiet`, 'dim');
      setTimeout(() => { if (my === seq && input.value === text) { shown = vis; Phone.tray(p); } }, 600);
      return;
    }
    shown = vis || shown;
    Phone.tray(p);
  }

  // In "On send" mode Jev isn't called per keystroke, but the chart preview still is:
  // it's a local read over the warm snapshot, not a model call.
  async function previewOnly(text) {
    const my = ++seq;
    if (text.trim().length < 3) { Phone.tray(null); return; }
    const panel = await Engine.preview(text, Phone.ctx);
    if (my !== seq || input.value !== text) return;
    if (!panel) { Phone.tray(null); shown = null; return; }
    if (shown && shown !== panel.visual && !/\s$/.test(text) && performance.now() - lastKey < 600) {
      setTimeout(() => { if (my === seq && input.value === text) { shown = panel.visual; Phone.tray({ type: 'READ', panel, previewOnly: true }); } }, 600);
      return;
    }
    shown = panel.visual; Phone.tray({ type: 'READ', panel, previewOnly: true });
  }

  input.addEventListener('input', e => {
    if (e.isTrusted) replaying = false;   // a real keystroke makes it a live call
    lastKey = performance.now();
    if (!live) {
      clearTimeout(deb);
      const text = input.value;
      if (!text.trim()) { seq++; shown = null; Phone.tray(null); return; }
      deb = setTimeout(() => previewOnly(text), 160);
      return;
    }
    clearTimeout(deb);
    const text = input.value;
    if (!text.trim()) { seq++; shown = null; Phone.tray(null); return; }
    deb = setTimeout(() => ask(text), 120);
  });

  // ── a full turn ──────────────────────────────────────────────────────────
  async function send(turn) {
    seq++; clearTimeout(deb); Phone.tray(null); shown = null;   // in-flight keystrokes can no longer paint
    busy = true;
    const done = Phone.thinking();
    try { const blocks = await message(turn, Phone.ctx); done(); Phone.bot(blocks, { card: blocks.usesCard }); }
    catch (e) { done(); Phone.bot([{ type: 'ANSWER', text: 'Something went wrong on my side — nothing was changed.' }]); console.error(e); }
    finally { busy = false; Phone.renderCards(); }
  }

  // ── voice: tap the mic when the input is empty. Speech counts as typing → a LIVE call.
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const trail = $('#trail');
  let rec = null, heard = '';
  function stopVoice() { if (rec) rec.stop(); }
  function startVoice() {
    if (!SR) { Phone.toast('Voice isn’t supported in this browser — try Chrome, Edge or Safari.'); return; }
    replaying = false; heard = '';
    rec = new SR();
    rec.lang = 'en-US'; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
    rec.onstart = () => { trail.classList.add('listening'); input.placeholder = 'Listening…'; log('voice: listening (browser speech recognition)', 'dim'); };
    rec.onresult = e => {
      heard = [...e.results].map(r => r[0].transcript).join('').trim();
      input.value = heard; input.dispatchEvent(new Event('input'));
    };
    rec.onerror = e => {
      const msg = { 'not-allowed': 'Microphone access is blocked — allow it in the browser’s site settings.', 'service-not-allowed': 'Microphone access is blocked — allow it in the browser’s site settings.',
        'no-speech': 'Didn’t catch anything — tap the mic and try again.', 'audio-capture': 'No microphone found.', network: 'Speech recognition needs the browser’s speech service, which is unreachable right now.' }[e.error];
      if (msg) Phone.toast(msg);
      log(`voice: ${e.error}`, 'warn');
    };
    rec.onend = () => {
      trail.classList.remove('listening'); input.placeholder = 'Ask Nova…'; rec = null;
      if (heard && !busy) { log(`voice: heard “${heard}” → sent as a LIVE turn`, 'ok'); Phone.clearInput(); Phone.user(heard); send({ text: heard, replay: false }); }
    };
    try { rec.start(); } catch (err) { log('voice: could not start — ' + err.message, 'warn'); }
  }
  trail.addEventListener('click', e => {
    if (rec) { e.preventDefault(); stopVoice(); return; }
    if (!input.value.trim()) { e.preventDefault(); startVoice(); }
  });
  trail.setAttribute('aria-label', 'Send, or speak when empty');

  form.addEventListener('submit', e => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || busy) return;
    Phone.clearInput(); Phone.user(text); send({ text, replay: replaying });
    replaying = false;
  });

  Phone.on.send = turn => send({ replay: true, ...turn });
  // A tray tap composes an ordinary turn: the person's own words + the card they picked.
  Phone.on.commit = extra => { const text = input.value.trim(); if (!text) return; Phone.clearInput(); Phone.user(text); send({ text, replay: replaying, ...extra }); replaying = false; };
  // Picking a "did you mean" row re-asks with that row's label — one way to build a tray, not two.
  Phone.on.reask = label => { input.value = label; input.dispatchEvent(new Event('input')); clearTimeout(deb); ask(label); };
  Phone.on.context = () => { bus.emit('scope'); log(`card scope → ${Phone.ctx.cardId ? NovaData.tag(NovaData.card(Phone.ctx.cardId)) : 'All cards'}`); if (live && input.value.trim()) ask(input.value); };
  Phone.on.opened = () => Engine.prewarm();
  bus.on('activity', ({ title }) => Phone.activity(title));

  // ── toggles ──────────────────────────────────────────────────────────────
  function setMode(m) {
    live = m === 'live'; seq++; Phone.tray(null);
    document.querySelectorAll('[data-mode]').forEach(x => { x.classList.toggle('on', x.dataset.mode === m); x.setAttribute('aria-checked', x.dataset.mode === m); });
    log(live ? 'mode: Jev + an insight preview on every keystroke (min 3 chars, 120 ms debounce, ≤ 2 in flight)' : 'mode: nothing is sent until you press send');
  }
  document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => {
    setMode(b.dataset.mode);
    narrate(live ? '<b>Every keystroke</b> · Jev per key · tray before send' : '<b>On send</b> · Jev on send only · chart preview still live');
  });
  $('#outage').addEventListener('change', e => { settings.outage = e.target.checked; document.body.classList.toggle('sim-outage', settings.outage); bus.emit('outage', settings.outage); log(settings.outage ? 'simulation: model outage → Jev + LLM time out, rules answer' : 'simulation: models back up', settings.outage ? 'warn' : 'ok'); });

  // ── scenarios ────────────────────────────────────────────────────────────
  // Tabs → groups → questions. Each row shows the question it will ask and, on the right, what you'll get.
  const Q = (q, k, text, say, extra = {}) => ({ q, k, text, say, ...extra });
  const GROUPS = [
    ['Instant charts', 'Ask about money · a chart is chosen from the data', [
      ['How much?', [
        Q('How much on food last month?', 'number', 'how much did I spend on food last month', 'One number · change chip · 6-month sparkline', { tag: 'V1' }),
        Q('Food vs transport?', 'face-off', 'food vs transport this month', 'Two subjects side by side', { tag: 'V2' }),
        Q('Is my food spending a lot?', 'gauge', 'is my food spending a lot this month', 'Usual range band · projection marker · verdict', { tag: 'V18' }),
        Q('How much of my limit is left?', 'meter', 'how much of my limit is left', 'Meter + even-pace tick · no limit → falls back', { tag: 'V9' }),
      ]],
      ['Where it goes', [
        Q('Where did my money go last month?', 'donut', 'where did my money go last month', 'Donut if one slice clearly leads · else ranked bars', { tag: 'V8' }),
        Q('Top merchants?', 'ranking', 'top merchants this month', 'Top 5 + Other · with logos', { tag: 'V7' }),
        Q('Spending by card?', 'split bar', 'spending by card', 'One bar split by card', { tag: 'V5' }),
        Q('Which days do I spend most?', 'weekdays', 'which days do I spend most', 'Average by weekday · last 8 weeks', { tag: 'V12' }),
      ]],
      ['Over time', [
        Q('Food spending by week?', 'weekly bars', 'food spending by week', 'Weekly columns · usual line + band · current week hatched', { tag: 'V3' }),
        Q('This month vs last?', 'pace line', 'how does this month compare with last month', 'Cumulative pace · this month vs last', { tag: 'V10' }),
        Q('What changed this month?', 'up / down', 'what changed this month', '↑↓ by category vs same days last month', { tag: 'V11' }),
      ]],
      ['Watch-outs', [
        Q('Anything unusual?', 'alerts', 'anything unusual', '> 3× a merchant’s usual · or “nothing unusual”', { tag: 'V21' }),
        Q('My subscriptions?', 'list', 'show my subscriptions', 'Recurring · 3+ months in a row', { tag: 'V14' }),
        Q('How often at Brewline?', 'visits', 'how often do I go to brewline', 'Visits per week · last visit', { tag: 'V13' }),
      ]],
    ]],
    ['Multi-step stories', 'Real conversations · several turns, taps and confirms', [
      ['Money checks', [
        Q('Budget reset', '4 steps', '', 'pace → what changed → set a limit → limit meter', { steps: [
          { say: 'how does this month compare with last month', note: 'pace vs last month' },
          { say: 'what changed this month', note: 'which categories moved' },
          { say: 'set a limit of $1,500 on my everyday card', note: 'act · read-back · undo' },
          { say: 'how much of my limit is left', note: 'the limit meter now has a limit' } ] }),
        Q('Monthly review', '4 steps', '', 'stat tile → face-off → gauge → donut', { steps: [
          { say: 'how much did I spend on food last month', note: 'one number + sparkline' },
          { say: 'food vs transport this month', note: 'face-off' },
          { say: 'is my food spending a lot this month', note: 'usual range + verdict' },
          { say: 'where did my money go last month', note: 'donut · one category clearly leads' } ] }),
        Q('Spending deep-dive', '4 steps', '', 'ranking → weekdays → visits → subscriptions', { steps: [
          { say: 'top merchants this month', note: 'ranked with logos' },
          { say: 'which days do I spend most', note: 'weekday strip' },
          { say: 'how often do I go to brewline', note: 'visits + last visit' },
          { say: 'show my subscriptions', note: 'recurring payments' } ] }),
      ]],
      ['Card journeys', [
        Q('Suspicious charge', '5 steps', '', 'spot it → dispute → confirm → block merchant → pick card', { steps: [
          { say: 'anything unusual', note: 'finds a charge 4× the usual' },
          { say: 'I don’t recognise the Parcelhub charge', note: 'dispute · card from the transaction' },
          { tap: 'Confirm', note: 'irreversible → confirmed' },
          { say: 'block parcelhub', note: 'which card? → Nova asks' },
          { tap: 'Everyday', note: 'picked · blocked · read back' } ] }),
        Q('Trip planning', '4 steps', '', 'unfreeze → travel dates → limit → weekly check', { steps: [
          { say: 'unfreeze my travel card', note: 'reversible · one step' },
          { say: 'I’m travelling to Japan next week on my travel card', note: 'dates without a model' },
          { say: 'set a limit of $800 on my travel card', note: 'guard rail for the trip' },
          { say: 'food spending by week', note: 'weekly columns + usual line' } ] }),
        Q('New card setup', '4 steps', '', 'activate → confirm → ATM off → by card', { steps: [
          { say: 'activate my virtual card', note: 'irreversible → confirm' },
          { tap: 'Confirm', note: 'activated · read back' },
          { say: 'turn off atm withdrawals on my virtual card', note: 'one clear action' },
          { say: 'spending by card', note: 'split across cards' } ] }),
        Q('Three asks at once', '2 steps', '', 'freeze + block + limit → one row each → fill the gap', { steps: [
          { say: 'freeze my everyday card and block zipride and set a limit', note: '3 parts → 3 rows · never dropped' },
          { tap: '$500', note: 'missing amount filled · plan resumes' } ] }),
      ]],
    ]],
    ['Safe card actions', 'Change a card · gate → confirm → read-back → undo', [
      ['Everyday', [
        Q('Freeze my card and block Zipride', '2 steps', 'freeze my everyday card and block zipride', '2 parts → 2 rows · card carried over'),
        Q('Set a limit on my everyday card', 'asks amount', 'set a limit on my everyday card', 'Missing amount → chips → resumes'),
        Q('Travelling to Japan next week', 'dates', 'I’m travelling to Japan next week', 'Dates without a model · allow first, then restrict'),
      ]],
      ['High stakes', [
        Q('I think my card was stolen', 'confirm', 'I think my card was stolen', 'Bar 0.70 · pick card · confirm'),
        Q('Freeze all my cards', 'confirm', 'freeze all my cards', 'Always confirms · lists skipped cards'),
        Q('I don’t recognise a charge', 'dispute', 'I don’t recognise the Streamly charge', 'Card from the transaction · confirm'),
      ]],
    ]],
    ['Before you send', 'Jev reads each keystroke · UI appears before send', [
      ['Before you send', [
        Q('freeze my card', 'action tray', 'freeze my card', 'Tray before send · pick card · Do it', { live: true, stay: true }),
        Q('where did my money go', 'live chart', 'where did my money go', 'Live chart preview · cached 60 s for send', { live: true, stay: true }),
      ]],
      ['When it’s unsure', [
        Q('forgot', 'did you mean', 'forgot', '≈ 0.47 tie → offers both', { live: true, stay: true }),
        Q('atm', 'nothing', 'atm', 'Coin flip → nothing shown', { live: true, stay: true }),
        Q('find an atm near me', 'handoff', 'find an atm near me', 'Unsupported → the screen that can · never substitute'),
        Q('change my mailing address', 'can’t', 'change my mailing address', 'Out of scope · says so'),
      ]],
    ]],
  ];
  GROUPS.forEach(([, , subs]) => subs.forEach(([, list]) => list.forEach(x => (x.label = x.q))));
  const box = $('#scenarios'), tabs = $('#scen-tabs');
  const tryPanel = $('#try');
  const narrate = html => {
    $('#narrate').classList.remove('finished');
    $('#narrate').innerHTML = `<span class="np"><i class="np-dot"></i><span class="np-label">Now playing</span><span>${html}</span></span><button class="btn sm np-open" type="button" aria-expanded="false" aria-controls="scenarios">Scenarios ▾</button><i class="np-bar"></i>`;
    $('#narrate .np-open').onclick = () => expand(true);
    A11y.announce(A11y.text(html));
  };
  // When a scenario ends, the bar becomes a clear next step instead of a quiet button at the far right.
  const cardFor = q => [...box.querySelectorAll('.sc-card')].find(x => x.querySelector('span').firstChild.textContent === q);
  function finished(s) {
    if (tour.running) return;                       // the tour drives its own next step
    const list = GROUPS[group][2].flatMap(([, l]) => l);
    const next = list[(list.indexOf(s) + 1) % list.length];
    const bar = $('#narrate');
    bar.innerHTML = `<span class="np done"><i class="np-dot"></i><span class="np-label">Done</span><span><b>${s.q}</b> ✓</span></span>
      <span class="np-acts"><button class="btn sm np-all" type="button" aria-controls="scenarios">All scenarios ▾</button><button class="btn sm primary np-next" type="button">Next: ${next.q} ▸</button></span>`;
    bar.classList.add('finished');
    tryPanel.classList.remove('playing-now');
    bar.querySelector('.np-all').onclick = () => expand(true);
    bar.querySelector('.np-next').onclick = () => play(next, cardFor(next.q));
    A11y.announce(`${s.q} done. Next: ${next.q}`);
  }
  // Collapsed scenarios are out of the tab order too (inert), not just out of sight.
  const collapse = () => { tryPanel.classList.add('collapsed', 'playing-now'); tabs.inert = box.inert = true; };
  function expand(focus) {
    if (!tryPanel.classList.contains('collapsed')) return;
    tryPanel.classList.remove('collapsed'); tabs.inert = box.inert = false;
    if (focus) (box.querySelector('.sc-card.on') || tabs.querySelector('.on')).focus({ preventScroll: true });
  }
  let group = 0;
  function renderGroup() {
    const count = g => g[2].reduce((n, [, l]) => n + l.length, 0);
    tabs.innerHTML = GROUPS.map((g, i) => `<button role="tab" id="sg-${i}" aria-controls="scenarios" class="${i === group ? 'on' : ''}" data-g="${i}"><b>${g[0]}<span>${count(g)}</span></b><small>${g[1]}</small></button>`).join('');
    tabs.querySelectorAll('button').forEach(b => b.onclick = () => {
      const had = document.activeElement === b;
      group = +b.dataset.g; renderGroup();
      if (had) tabs.querySelector(`[data-g="${group}"]`).focus();   // redrawing the row mustn't drop keyboard focus
    });
    box.setAttribute('aria-labelledby', 'sg-' + group);
    const [, , subs] = GROUPS[group];
    box.innerHTML = '';
    const cols = document.createElement('div'); cols.className = 'scen-cols';
    subs.forEach(([title, list]) => {
      const col = document.createElement('div'); col.className = 'scen-col';
      col.setAttribute('role', 'group'); col.setAttribute('aria-labelledby', `sc-h-${group}-${title.replace(/\W+/g, '')}`);
      col.innerHTML = `<small id="sc-h-${group}-${title.replace(/\W+/g, '')}">${title}</small>`;
      list.forEach(s => {
        const b = document.createElement('button');
        b.className = 'sc-card' + (s.steps ? ' story' : ''); b.title = s.say + (s.tag ? ` · ${s.tag}` : '');
        b.innerHTML = s.steps ? `<span>${s.q}<i>${s.say}</i></span><em>${s.k}</em>` : `<span>${s.q}</span><em>${s.k}</em>`;
        b.onclick = () => play(s, b);
        col.appendChild(b);
      });
      cols.appendChild(col);
    });
    box.appendChild(cols);
  }
  renderGroup();
  A11y.roving(tabs);
  A11y.roving($('#mode-seg'), { item: '[role="radio"]', attr: 'aria-checked' });
  // ↑/↓ walk the scenario list; Tab still reaches every row.
  box.addEventListener('keydown', e => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const all = [...box.querySelectorAll('.sc-card')], i = all.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    all[Math.max(0, Math.min(all.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))].focus();
  });
  // Keep the phone in view while a scenario types into it.
  function showPhone() {
    const r = document.querySelector('.phone').getBoundingClientRect(), top = 64;
    if (r.top >= top - 4 && r.bottom <= innerHeight + 4) return Promise.resolve();
    const y = scrollY + r.top - (r.height + top > innerHeight ? top : (innerHeight - r.height + top) / 2);
    scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
    return new Promise(res => setTimeout(res, 450));
  }
  const idle = async () => { await new Promise(r => setTimeout(r, 150)); while (busy) await new Promise(r => setTimeout(r, 150)); };
  function tapIn(label) {
    const last = [...document.querySelectorAll('#chat .reply')].pop();
    return last && [...last.querySelectorAll('.act, .sug, .chip-card')].find(b => !b.disabled && b.textContent.includes(label));
  }
  async function typeAndSend(text) {
    input.value = ''; replaying = true;
    for (const ch of text) { input.value += ch; input.dispatchEvent(new Event('input')); await new Promise(r => setTimeout(r, 34)); }
    await new Promise(r => setTimeout(r, 250));
    form.requestSubmit();
    await idle();
  }
  async function playStory(s, btn) {
    if (busy) return;
    Phone.open(); collapse(); await showPhone();
    box.querySelectorAll('.sc-card').forEach(x => x.classList.toggle('on', x === btn));
    if (live) setMode('send');
    Engine.resetState(); Phone.renderCards();
    const n = s.steps.length;
    for (let i = 0; i < n; i++) {
      const st = s.steps[i];
      narrate(`<b>${s.q}</b> · step ${i + 1}/${n} → ${st.note}`);
      tryPanel.classList.remove('playing-now'); void tryPanel.offsetWidth; tryPanel.classList.add('playing-now');
      if (st.say) await typeAndSend(st.say);
      else {
        await new Promise(r => setTimeout(r, 900));
        const b = tapIn(st.tap);
        if (!b) { log(`story: couldn’t find “${st.tap}” — state changed earlier; stopping here`, 'warn'); break; }
        b.classList.add('tapped'); await new Promise(r => setTimeout(r, 350));
        b.click(); await idle();
      }
      await new Promise(r => setTimeout(r, 1300));
    }
    finished(s);
  }
  async function play(s, btn) {
    if (s.steps) return playStory(s, btn);
    if (busy) return;
    Phone.open();
    collapse();
    await showPhone();
    box.querySelectorAll('.sc-card').forEach(x => x.classList.toggle('on', x === btn));
    narrate(`<b>“${s.q}”</b> → ${s.say}${s.tag ? ` <em>${s.tag}</em>` : ''}`);
    if (s.live && !live) { setMode('live'); narrate(`<b>“${s.q}”</b> → ${s.say} <em>· every keystroke on</em>`); }
    if (!s.live && live && tour.running) setMode('send');
    box.classList.add('playing');
    input.value = ''; input.focus({ preventScroll: true });
    replaying = true;
    for (const ch of s.text) { input.value += ch; input.dispatchEvent(new Event('input')); await new Promise(r => setTimeout(r, 42)); }
    await new Promise(r => setTimeout(r, live ? 1100 : 250));
    box.classList.remove('playing');
    if (!s.stay) { form.requestSubmit(); await idle(); await new Promise(r => setTimeout(r, 900)); }
    else await new Promise(r => setTimeout(r, 1800));
    finished(s);
  }

  // ── guided tour: a short run through the ideas, one after another ───────
  const tour = { running: false };
  const flat = g => GROUPS[g][2].flatMap(([, l]) => l);
  const STOPS = [[0, 'Where did my money go last month?'], [0, 'Food spending by week?'], [3, 'freeze my card'], [3, 'forgot'], [1, 'Three asks at once'], [2, 'I think my card was stolen'], [0, 'Anything unusual?']];
  $('#tour').onclick = async () => {
    if (tour.running) { tour.running = false; return; }
    tour.running = true; $('#tour').lastChild.textContent = 'Stop the tour';
    for (const [g, i] of STOPS) {
      if (!tour.running) break;
      group = g; renderGroup();
      const s = flat(g).find(x => x.q === i);
      while (busy) await new Promise(r => setTimeout(r, 200));
      await play(s, [...box.querySelectorAll('.sc-card')].find(b => b.firstChild.firstChild.textContent === i));
      await new Promise(r => setTimeout(r, s.stay ? 3200 : 1800));
      while (busy) await new Promise(r => setTimeout(r, 200));
      if (s.stay) { input.value = ''; input.dispatchEvent(new Event('input')); Phone.tray(null); }
      await new Promise(r => setTimeout(r, 2600));
    }
    tour.running = false; $('#tour').lastChild.textContent = 'Play the tour'; setMode('send');
  };

  // keyboard: / → type into the phone · Esc → reopen scenarios
  document.addEventListener('keydown', e => {
    if (e.key === '/' && document.activeElement !== input) { e.preventDefault(); showPhone().then(() => input.focus({ preventScroll: true })); }
    if (e.key === 'Escape') { if (rec) { rec.abort(); return; } if (document.querySelector('.guide-pop')) return; const back = tryPanel.classList.contains('collapsed'); expand(back); if (!back) input.blur(); }
  });

  Phone.renderCards();
  const openingState = () => {
    if (Phone.started()) return;
    const c = Phone.ctx.cardId && NovaData.card(Phone.ctx.cardId);
    Phone.greet({
      title: 'Spending trends over time',
      sub: c ? `How ${NovaData.tag(c)} is tracking against last month.` : 'Review daily and monthly spending to stay on top of your budget.',
      panel: Insights.build('how does this month compare with last month', Phone.ctx),
      chips: ['Where did my money go?', 'Anything unusual?', 'Which days do I spend most?', 'Show my subscriptions'],
    });
  };
  openingState();
  bus.on('scope', openingState);
  log('ready · fictional data, generated for today, held in memory');
  setTimeout(Phone.open, 500);
})();
