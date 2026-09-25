/* Accessibility helpers shared by both pages: a polite announcer and keyboard-operable tab rows. */
(function () {
  // One visually hidden live region per channel. Updates inside `delay` coalesce, so a screen
  // reader hears the line the page settles on rather than every intermediate one.
  const regions = {};
  function announce(text, { channel = 'main', delay = 250 } = {}) {
    let r = regions[channel];
    if (!r) {
      const el = document.createElement('div');
      el.className = 'sr-only'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite'); el.setAttribute('aria-atomic', 'true');
      document.body.appendChild(el);
      r = regions[channel] = { el, t: 0 };
    }
    clearTimeout(r.t);
    r.t = setTimeout(() => { r.el.textContent = ''; setTimeout(() => (r.el.textContent = text), 60); }, delay);
  }

  // A row of tabs (or radios): one tab stop for the row; ←/→, Home and End move and select.
  // The selected item is the one with class "on"; ARIA follows it even when the row re-renders.
  function roving(list, { item = '[role="tab"]', attr = 'aria-selected' } = {}) {
    if (!list) return;
    const items = () => [...list.querySelectorAll(item)];
    const sync = () => {
      const all = items(), cur = all.find(b => b.classList.contains('on')) || all[0];
      all.forEach(b => { b.setAttribute(attr, String(b === cur)); b.tabIndex = b === cur ? 0 : -1; });
    };
    list.addEventListener('keydown', e => {
      const all = items(), i = all.indexOf(document.activeElement);
      const j = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: all.length - 1 }[e.key];
      if (i < 0 || j === undefined) return;
      e.preventDefault();
      const k = (j + all.length) % all.length;
      all[k].click();
      items()[k].focus();   // the click may have redrawn the row
    });
    new MutationObserver(sync).observe(list, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    sync();
  }

  const text = html => new DOMParser().parseFromString(html, 'text/html').body.textContent.replace(/\s+/g, ' ').trim();
  window.A11y = { announce, roving, text };
})();
