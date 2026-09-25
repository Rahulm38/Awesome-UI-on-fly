/* Starts the live pipeline graph on the architecture page (kept out of the HTML so the CSP can forbid inline scripts). */
FlowGraph.autoplay(FlowGraph(document.getElementById('flow')), document.querySelector('.flow-say span'));
