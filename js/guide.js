/* First-visit guide: four hints that point at the parts of the page, shown once.
   "Show the guide" in the footer brings it back. */
(function () {
  const KEY = 'nova-guide-seen';
  const STEPS = [
    { at: '.phone', title: 'This is the phone', body: 'Nova, the card assistant, lives in the sheet. Type a question, or tap the mic when the box is empty. Press <span class="kbd">/</span> to jump here.' },
    { at: '#try', title: 'Scenarios type for you', body: 'Click any question and it’s typed into the phone. Or press <b>Play the tour</b> for a two-minute run through the ideas.' },
    { at: '#flow-panel', title: 'Watch the system work', body: 'Each request travels this pipeline live: Jev decides, the LLM fills in, the gate guards. Switch Jev or the LLM off here.' },
    { at: '#inspect-panel', tab: 'scores', title: 'Why it chose that', body: '<b>Decision</b> shows Jev’s scores against the bars and the call itself. Latency, Payloads and Log sit beside it.' },
  ];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const seen = () => { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } };
  const markSeen = () => { try { localStorage.setItem(KEY, '1'); } catch (e) { /* private mode: it just shows again next visit */ } };

  let i = 0, ring = null, pop = null, target = null, back = null, raf = 0;

  function place() {
    if (!pop) return;
    const r = target.getBoundingClientRect(), pad = 6;
    Object.assign(ring.style, { left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' });
    if (innerWidth < 760) { pop.style.left = pop.style.top = ''; pop.classList.add('docked'); return; }   // phones: a sheet at the bottom
    pop.classList.remove('docked');
    const pw = pop.offsetWidth, ph = pop.offsetHeight, m = 14, vw = innerWidth, vh = innerHeight;
    let x, y;
    if (r.right + m + pw <= vw - 8) { x = r.right + m; y = r.top + 24; }            // right of it
    else if (r.left - m - pw >= 8) { x = r.left - m - pw; y = r.top + 24; }          // left of it
    else if (r.bottom + m + ph <= vh - 8) { x = r.left + 24; y = r.bottom + m; }     // below
    else if (r.top - m - ph >= 64) { x = r.left + 24; y = r.top - m - ph; }          // above
    else { x = vw - pw - 16; y = vh - ph - 16; }                                      // no room: bottom corner, over its least busy part
    pop.style.left = Math.max(8, Math.min(vw - pw - 8, x)) + 'px';
    pop.style.top = Math.max(64, Math.min(vh - ph - 8, y)) + 'px';
  }
  const track = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(place); };

  function bringIntoView(el) {
    const r = el.getBoundingClientRect(), top = 64, dock = innerWidth < 760 ? pop.offsetHeight + 16 : 0, room = innerHeight - top - dock;
    if (r.top >= top && r.bottom <= innerHeight - dock) return;
    // Tall targets (the phone) start just under the header; short ones sit in the middle of the free space.
    const y = scrollY + r.top - top - (r.height < room ? (room - r.height) / 2 : 0);
    scrollTo({ top: Math.max(0, y), behavior: reduce ? 'auto' : 'smooth' });
  }

  function show(n) {
    i = n;
    const s = STEPS[i];
    target = document.querySelector(s.at);
    if (s.tab) { const t = document.querySelector(`[data-tab="${s.tab}"]`); if (t && !t.classList.contains('on')) t.click(); }
    pop.querySelector('.guide-n').textContent = `${i + 1} of ${STEPS.length}`;
    pop.querySelector('h3').textContent = s.title;
    pop.querySelector('p').innerHTML = s.body;
    pop.querySelector('[data-g="prev"]').hidden = i === 0;
    const next = pop.querySelector('[data-g="next"]');
    next.textContent = i === STEPS.length - 1 ? 'Got it' : 'Next';
    pop.querySelectorAll('.guide-dots i').forEach((d, k) => d.classList.toggle('on', k === i));
    pop.classList.remove('in'); void pop.offsetWidth; pop.classList.add('in');
    place(); bringIntoView(target); track();
    next.focus({ preventScroll: true });
  }

  function open() {
    if (pop) return;
    markSeen();
    back = document.activeElement;
    ring = document.createElement('div'); ring.className = 'guide-ring'; ring.setAttribute('aria-hidden', 'true');
    pop = document.createElement('div'); pop.className = 'guide-pop';
    pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-labelledby', 'guide-title'); pop.setAttribute('aria-describedby', 'guide-body');
    pop.innerHTML = `<div class="guide-top"><span class="guide-n"></span><button class="guide-x" type="button" data-g="close" aria-label="Close the guide">✕</button></div>
      <h3 id="guide-title"></h3><p id="guide-body"></p>
      <div class="guide-foot"><span class="guide-dots" aria-hidden="true">${STEPS.map(() => '<i></i>').join('')}</span>
        <button class="btn sm" type="button" data-g="prev">Back</button><button class="btn sm primary" type="button" data-g="next">Next</button></div>`;
    document.body.append(ring, pop);
    pop.addEventListener('click', e => {
      const g = e.target.closest('[data-g]'); if (!g) return;
      if (g.dataset.g === 'close') close();
      else if (g.dataset.g === 'prev') show(i - 1);
      else if (i === STEPS.length - 1) close();
      else show(i + 1);
    });
    // Keyboard: Esc closes; ← → step; Tab stays inside the hint.
    pop.addEventListener('keydown', e => {
      if (e.key === 'ArrowRight' && i < STEPS.length - 1) show(i + 1);
      else if (e.key === 'ArrowLeft' && i > 0) show(i - 1);
      else if (e.key === 'Tab') {
        const f = [...pop.querySelectorAll('button:not([hidden])')], k = f.indexOf(document.activeElement);
        e.preventDefault(); f[(k + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
      }
    });
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onOutside, true);
    addEventListener('scroll', track, { passive: true }); addEventListener('resize', track);
    show(0);
  }
  const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  // Using the page (a scenario, the tour, the phone) is the best reason to get out of the way.
  const onOutside = e => { if (!pop.contains(e.target)) close(false); };

  function close(restore = true) {
    if (!pop) return;
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('pointerdown', onOutside, true);
    removeEventListener('scroll', track); removeEventListener('resize', track);
    cancelAnimationFrame(raf);
    ring.remove(); pop.remove(); ring = pop = null;
    if (restore && back && back.isConnected && back !== document.body) back.focus({ preventScroll: true });
  }

  document.getElementById('guide-again').addEventListener('click', () => { scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' }); setTimeout(open, reduce ? 0 : 350); });
  // First visit: once the sheet has opened (main.js opens it at 500 ms), unless something has already started.
  if (!seen()) setTimeout(() => { if (!document.querySelector('#try.collapsed')) open(); }, 1300);
})();
