/* Starts the live pipeline graph on the architecture page (kept out of the HTML so the CSP can forbid inline scripts). */
FlowGraph.autoplay(FlowGraph(document.getElementById('flow')), document.querySelector('.flow-say span'));

// Phones read table rows as small cards; each cell carries its column name.
document.querySelectorAll('table').forEach(t => {
  const head = t.querySelector('tr'), heads = [...head.querySelectorAll('th')].map(th => th.textContent.trim());
  t.querySelectorAll('tr').forEach(tr => tr !== head && [...tr.children].forEach((td, i) => heads[i] && td.setAttribute('data-label', heads[i])));
});
