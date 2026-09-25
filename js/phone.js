/* The phone: a host spending screen with the assistant sheet over it.
 * It renders the blocks the composer sends and knows nothing about banking. */
(function () {
  const D = window.NovaData;
  const $ = s => document.querySelector(s);
  const chat = $('#chat'), tray = $('#tray'), sheet = $('#sheet'), picker = $('#picker'), input = $('#input');
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const md = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const money = n => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const CHEV = '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
  const art = (c, w = 22) => `<span class="art ${c.frozen || c.state === 'REPORTED' ? 'frozen' : c.state === 'PENDING_ACTIVATION' ? 'pending' : ''}" style="width:${w}px"></span>`;
  const allArt = w => `<span class="art-stack" style="width:${w}px"><span class="art" style="width:${w}px"></span><span class="art" style="width:${w}px"></span></span>`;
  const cardSub = c => `••${c.last4} · ${c.type}${c.state === 'REPORTED' ? '<span class="tag">Reported</span>' : c.state === 'PENDING_ACTIVATION' ? '<span class="tag">Pending</span>' : c.frozen ? '<span class="tag">Frozen</span>' : ''}`;

  const Phone = { ctx: { cardId: null }, on: {} };
  const changes = [];
  const scroll = () => requestAnimationFrame(() => { chat.scrollTop = chat.scrollHeight; });

  // ── host screen (what the person was looking at when they opened Nova) ──
  function renderHost() {
    const now = new Date(), months = [];
    for (let i = 5; i >= 0; i--) {
      const a = new Date(now.getFullYear(), now.getMonth() - i, 1), b = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      months.push({ l: a.toLocaleDateString('en-US', { month: 'short' }), v: D.txns.filter(t => t.date >= a && t.date < b).reduce((n, t) => n + t.amount, 0) });
    }
    const max = Math.max(...months.map(m => m.v));
    const recent = D.txns.slice(0, 6);
    $('#host').innerHTML = `
      <div class="host-top"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M19 12H5m6-6-6 6 6 6"/></svg><b>Spending</b><svg width="22" height="22" viewBox="0 0 24 24" fill="#015b7e"><rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="8" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/><rect x="13" y="13" width="8" height="8" rx="2"/></svg></div>
      <div class="host-tabs"><span class="on">Dates</span><span>Categories</span><span>Merchants</span></div>
      <div class="host-bars">${months.map(m => `<div><span>$${m.v >= 1000 ? (m.v / 1000).toFixed(2) + 'K' : Math.round(m.v)}</span><i style="height:${(m.v / max) * 110}px"></i><small>${m.l}</small></div>`).join('')}</div>
      <div class="host-list">${recent.map(t => `<div>${Charts.logo(t.merchant, 34)}<p><b>${esc(t.merchant)}</b><small>${t.pending ? '<em>Pending</em> · ' : ''}${t.date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} · ${esc(t.city)}</small></p><strong>${money(t.amount)}</strong></div>`).join('')}</div>`;
  }

  // ── sheet open / close ──────────────────────────────────────────────────
  Phone.open = () => {
    sheet.classList.remove('off'); $('#scrim').classList.remove('off'); $('#fab').classList.add('gone'); $('#statusbar').classList.add('dark');
    Phone.on.opened && Phone.on.opened();
  };
  Phone.close = () => {
    sheet.classList.add('off'); $('#scrim').classList.add('off'); $('#fab').classList.remove('gone'); $('#statusbar').classList.remove('dark');
  };
  $('#fab').onclick = Phone.open; $('#handle').onclick = Phone.close; $('#scrim').onclick = Phone.close;
  chat.addEventListener('scroll', () => $('#sheet-head').classList.toggle('shadow', chat.scrollTop > 4));

  // ── card chip + picker ──────────────────────────────────────────────────
  Phone.renderCards = () => {
    const c = Phone.ctx.cardId && D.card(Phone.ctx.cardId);
    $('#card-chip').innerHTML = `${c ? art(c) : allArt(22)}<span class="lbl">${c ? `••${c.last4} ${c.type}` : 'All cards'}</span>${CHEV}`;
    renderHost();
  };
  Phone.pulseCard = label => {
    const chip = $('#card-chip'), lbl = chip.querySelector('.lbl'), old = lbl.textContent;
    chip.classList.remove('pulse'); void chip.offsetWidth; chip.classList.add('pulse');
    lbl.style.opacity = 0; setTimeout(() => { lbl.textContent = `Uses ${label}`; lbl.style.opacity = 1; }, 120);
    setTimeout(() => { lbl.style.opacity = 0; setTimeout(() => { lbl.textContent = old; lbl.style.opacity = 1; }, 120); }, 2400);
  };
  function openSheet(title, body) {
    picker.hidden = false;
    picker.innerHTML = `<div class="picker-sheet"><button class="handle" aria-label="Close"></button><div class="picker-head"><b>${title}</b><button class="icon-btn" aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>${body}</div>`;
    picker.onclick = e => { if (e.target === picker || e.target.closest('.icon-btn,.handle')) picker.hidden = true; };
  }
  $('#card-chip').onclick = () => {
    const vis = D.cards.filter(c => !c.archived);
    openSheet('Select Card', `
      <button class="pick" data-id=""><span class="all">${allArt(18)}</span><div><b>All Cards</b><small>${vis.length} cards</small></div>${!Phone.ctx.cardId ? '<span class="ok">✓</span>' : ''}</button>
      <div class="lbl-s">Cards</div>
      ${vis.map(c => `<button class="pick" data-id="${c.id}">${art(c, 32)}<div><b>${esc(c.name)}</b><small>${cardSub(c)}</small></div>${Phone.ctx.cardId === c.id ? '<span class="ok">✓</span>' : ''}</button>`).join('')}`);
    picker.querySelectorAll('.pick').forEach(b => b.onclick = () => { Phone.ctx.cardId = b.dataset.id || null; picker.hidden = true; Phone.renderCards(); Phone.on.context && Phone.on.context(); });
  };
  $('#activity').onclick = () => {
    openSheet('What Nova changed', changes.length ? changes.map(x => `<div class="pick"><span class="all">✓</span><div><b>${esc(x.title)}</b><small>${x.at} · undo within 30 min</small></div></div>`).join('')
      : '<p class="greet-sub" style="padding:8px 4px 16px">Nothing yet. Every change Nova makes is listed here for 24 hours.</p>');
    $('#badge').textContent = '';
  };
  Phone.activity = title => { changes.unshift({ title, at: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) }); $('#badge').textContent = changes.length > 9 ? '9+' : changes.length; };

  // ── thread ──────────────────────────────────────────────────────────────
  // The opening state is about the screen underneath: a title for it, one
  // insight already drawn, then questions to try. It re-draws on a card change
  // until the conversation starts.
  let opening = null;
  Phone.greet = ({ title, sub, panel, chips }) => {
    const g = opening || el('div', 'opening');
    g.innerHTML = `<p class="greet">${esc(title)}</p><p class="greet-sub">${esc(sub)}</p>`;
    if (panel) g.appendChild(Charts.render(panel));
    g.appendChild(el('p', 'try', 'Try asking'));
    const row = el('div', 'sugg');
    chips.forEach(t => { const b = el('button', 'sug', esc(t)); b.onclick = () => { Phone.user(t); Phone.on.send({ text: t }); }; row.appendChild(b); });
    g.appendChild(row);
    if (!opening) { chat.appendChild(g); opening = g; }
  };
  Phone.started = () => chat.querySelector('.me') !== null;
  Phone.user = text => { chat.appendChild(el('div', 'me', esc(text))); scroll(); };
  Phone.thinking = () => {
    const e = el('div', 'thinking', '<svg viewBox="0 0 24 24"><use href="#i-sparkle"/></svg><span>Thinking</span>');
    chat.appendChild(e); scroll();
    const t = setTimeout(() => (e.querySelector('span').textContent = 'Still working on it'), 6000);
    return () => { clearTimeout(t); e.remove(); };
  };
  Phone.toast = text => { const t = el('div', 'toast', esc(text)); $('.screen').appendChild(t); setTimeout(() => t.remove(), 2400); };

  const ICON = { DONE: '✓', FAILED: '✕', NEEDS_CONFIRM: '!', NEEDS_INPUT: '○', WAITING: '○', UNSUPPORTED: '–', UNDONE: '↺' };
  const act = (a, off) => { const b = el('button', 'act' + (a.primary ? ' primary' : ''), esc(a.label)); b.onclick = () => { off(); Phone.user(a.turn.display || a.label); Phone.on.send(a.turn); }; return b; };

  const DRAW = {
    ANSWER: b => el('div', 'bubble', md(b.text)),
    CHART: b => {
      const c = Charts.render(b.panel, false, true);
      if (b.built != null) { const t = el('span', 'built', b.built === 'typed' ? `⚡ built while you typed · ${b.panel.visual} · reused` : `⚡ built on the fly · ${b.panel.visual} · ${b.built} ms`); c.appendChild(t); setTimeout(() => t.classList.add('gone'), 2600); }
      return c;
    },
    STATUS(b, off) {
      const box = el('div', 'status');
      b.rows.forEach(r => {
        const line = el('div', 'row ' + (ICON[r.state] ? r.state.toLowerCase() : 'neutral'), `<span class="ic">${ICON[r.state] || '•'}</span><div><b>${esc(r.title)}</b>${r.detail ? `<small>${esc(r.detail)}</small>` : ''}</div>`);
        if (r.actions && r.actions.length) { const a = el('div', 'acts'); r.actions.forEach(x => a.appendChild(act(x, off))); line.appendChild(a); }
        box.appendChild(line);
      });
      return box;
    },
    CHIPS(b, off) {
      const box = el('div', 'status', `<p class="chips-q">${esc(b.question)}</p>`);
      const cardChips = b.chips.some(c => c.turn.cardOverride);
      const wrap = el('div', cardChips ? 'status' : 'sugg');
      b.chips.forEach(c => {
        const card = c.turn.cardOverride && D.card(c.turn.cardOverride);
        const x = card ? el('button', 'chip-card', `${art(card, 32)}<div><b>${esc(card.name)}</b><small>${c.reason ? esc(c.reason) : cardSub(card)}</small></div>`) : el('button', 'sug', esc(c.label));
        x.disabled = !!c.disabled;
        x.onclick = () => { off(); Phone.user(c.turn.display || c.turn.text); Phone.on.send(c.turn); };
        wrap.appendChild(x);
      });
      box.appendChild(wrap);
      return box;
    },
    FOLLOW(b, off) { return DRAW.CHIPS({ question: '', chips: b.chips }, off).lastChild; },
    CTA(b) { const x = el('button', 'cta', esc(b.label) + ' →'); x.onclick = () => Phone.toast(`Would open: ${b.screen}`); return x; },
  };

  Phone.bot = (blocks, meta = {}) => {
    const m = el('div', 'reply');
    const off = () => m.querySelectorAll('.act, .sug, .chip-card').forEach(b => (b.disabled = true));
    blocks.forEach(b => m.appendChild(DRAW[b.type] ? DRAW[b.type](b, off) : el('div', 'bubble', '')));
    chat.appendChild(m); scroll();
    if (meta.card) Phone.pulseCard(meta.card);
  };

  // ── action tray: above the input while typing. It never writes anything;
  //    every tap composes an ordinary turn down the same path as send. ─────
  Phone.tray = pres => {
    tray.innerHTML = '';
    if (!pres || pres.type === 'NONE' || (pres.type === 'READ' && !pres.panel)) { tray.hidden = true; return; }
    tray.hidden = false;
    const commit = extra => { tray.hidden = true; Phone.on.commit(extra || {}); };
    const pct = p => `<em>${Math.round(p * 100)}%</em>`;
    const GO = '<span class="go">›</span>';

    if (pres.type === 'CANDIDATES') {
      tray.appendChild(el('div', 'tray-h', 'Did you mean'));
      pres.items.forEach(c => { const r = el('button', 'tray-row', `<span class="ti">${c.icon}</span><span>${esc(c.label)}</span>${pct(c.p)}${GO}`); r.onclick = () => Phone.on.reask(c.label); tray.appendChild(r); });
      return;
    }
    if (pres.type === 'READ') {
      tray.appendChild(el('div', 'tray-h', pres.previewOnly ? 'Preview · from Insights only — Jev not called yet' : 'Preview · Jev + Insights'));
      tray.appendChild(Charts.render(pres.panel, true));
      const r = el('button', 'tray-row', `<span class="ti">▦</span><span>See the full answer</span>${GO}`); r.onclick = () => commit(); tray.appendChild(r); return;
    }
    if (pres.type === 'HANDOFF') {
      const r = el('button', 'tray-row', `<span class="ti">${pres.icon}</span><span>${esc(pres.label)}<small>Opens ${esc(pres.screen)}</small></span>${pct(pres.p)}${GO}`);
      r.onclick = () => commit(); tray.appendChild(r); return;
    }
    const res = pres.res;
    const who = res.error ? res.error : res.allCards ? `All ${res.cards.length} eligible card${res.cards.length > 1 ? 's' : ''}` : res.cards ? D.tag(res.cards[0]) : 'Pick a card';
    const head = el('div', 'tray-row static', `<span class="ti">${pres.icon}</span><span>${esc(pres.label)}<small>${esc(who)}</small></span>${pct(pres.p)}`);
    tray.appendChild(head);
    if (res.error) return;
    const go = el('button', 'tray-go', pres.requiresFullConfirm ? 'Review' : 'Do it');
    if (pres.needsCardPick) {
      let picked = null; go.disabled = true;
      res.options.forEach(o => {
        const c = el('button', 'chip-card', `${art(o.card, 26)}<div><b>${esc(o.card.name)}</b><small>${o.reason ? esc(o.reason) : cardSub(o.card)}</small></div>`);
        c.disabled = !!o.reason;
        c.onclick = () => { picked = o.card.id; tray.querySelectorAll('.chip-card').forEach(x => x.classList.remove('sel')); c.classList.add('sel'); go.disabled = false; };
        tray.appendChild(c);
      });
      go.onclick = () => commit({ cardOverride: picked });
    } else go.onclick = () => commit(res.allCards ? {} : { cardOverride: res.cards[0].id });
    tray.appendChild(go);
  };

  input.addEventListener('input', () => $('#trail').classList.toggle('send', !!input.value.trim()));
  Phone.clearInput = () => { input.value = ''; $('#trail').classList.remove('send'); };

  window.Phone = Phone;
})();
