# Awesome UI on Fly

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Deploy to GitHub Pages](https://github.com/Rahulm38/Awesome-UI-on-fly/actions/workflows/pages.yml/badge.svg)](https://github.com/Rahulm38/Awesome-UI-on-fly/actions/workflows/pages.yml)

**[Open the live demo](https://rahulm38.github.io/Awesome-UI-on-fly/)** · [Architecture](architecture.html) · [Contributing](CONTRIBUTING.md)

*Live decisions and interfaces built on the fly — starring Nova, a card assistant.*

Nova is a card assistant that works out what you mean **while you type**, decides what to do, and **builds its interface for that answer on the fly**: a chart for a spending question, a card picker when it doesn't know which card you mean, a confirm step for anything that can't be undone.

This repository is an interactive showcase of that design. The left side is the phone. The right side visualizes a simulated decision flow: sample model outputs, confidence, illustrative latency, and why the next step was chosen. It runs in your browser with fictional data; it does not call real models or banking services.

## Run it

No build, no install, no server, no network calls.

```bash
open index.html
```

(Or double-click it. Any modern browser works.)

## What you can try

The phone is a spending screen with the assistant sheet open over it. Scenario buttons type a message into the phone for you; the right side shows the system flow, Jev's scores, per-hop latency, every payload and a decision log.

**Charts on the fly.** A spending question is read into closed lists (intent, subjects, period, split). A pure chooser then picks the chart from the *shape of the data*, falling back down a ladder when the data doesn't fit:

| Question | Chart |
|---|---|
| how much on food last month | V1 stat tile: number, change chip, 6-month sparkline |
| food vs transport | V2 face-off |
| compare food and shopping over the last 3 months | V4 grouped columns, one colour per subject |
| food spending by week · last 6 months | V3 columns with your *usual* line and band; the period in progress is hatched |
| spending by card | V5 split bar (falls back to V1 when ≥ 97 % is on one card) |
| spending by category each month | V6 stacked columns (also by card, debit/credit) |
| top merchants | V7 ranked bars, top 5 + Other |
| where did my money go | V8 donut, only when the top slice is ≥ 1.3× the next, otherwise V7 |
| how much of my limit is left | V9 limit meter with an even-pace tick (V1 when no limit is set) |
| how does this month compare with last month | V10 cumulative pace line |
| what changed this month | V11 ↑/↓ by category |
| what changed since last month by category | V15 dumbbell, last month → this month |
| any declined payments | V16 declines with reasons, not counted in spend |
| how much can I spend today | V17 left today against a daily limit (V1 without one) |
| which days do I spend most | V12 weekday strip |
| how often do I go to Brewline | V13 visits and last visit |
| show my subscriptions | V14 recurring payments |
| is my food spending a lot | V18 usual range gauge with a verdict chip |
| show my spending calendar | V19 month heatmap |
| break down my spending | V20 category rows that open to their merchants |
| anything unusual | V21 payments well above that merchant's usual — or a calm "nothing unusual" |

**Multi-step stories.** Seven real conversations played turn by turn — typing, tapping cards and Confirm — from a clean state each time: budget reset, monthly review, spending deep-dive, suspicious charge, trip planning, new card setup, three asks at once. Together with the instant charts, every chart type appears.

**Scenarios are a live gallery.** Every card shows what it will produce: the chart drawn from today’s data, Jev’s real scores against its thresholds (grouped by what Jev decides: acts, confirms first, asks first, hands off, holds back), or a story’s steps. Filter charts by category, click any card and it flies into the phone, or press *Surprise me*.

**Voice.** Tap the mic with an empty input (Chrome, Edge, Safari). Speech is transcribed by the browser and sent as a LIVE turn.

**Card actions.** Freeze, limits, merchant blocks, travel, disputes, lost/stolen — with card resolution, confirmation lanes, read-back before ✓, and undo.

**While typing.** Spending questions show a live chart preview above the input as you type, in either mode. Switch *Call Jev* (under the phone) to **Every keystroke** and Jev scores each keystroke too: an action row, a *did you mean* list or a handoff appears before you press send.

**Simulate models down.** (Simulation only — no real model is ever called.) In the system flow, turn **Jev** or the **LLM** off (the switches in the system-flow header, or click the node). Jev off: the LLM decides actions too — slower, uncalibrated, no *did you mean*, no typing tray. LLM off: rules extract the values. Both off: the rules decider answers.

**Simulate outage.** In the same place as the Jev/LLM switches — toggle it: Jev and the LLM time out, the rules decider answers turns, and the typing tray goes quiet.

## Safeguards

| | |
|---|---|
| No network | CSP `connect-src 'none'` — nothing can leave the page |
| Recorded vs live | scenario buttons replay recorded fixtures (marked RECORDED); only text you type is a LIVE call |
| Rate limit | live calls only · 20 turns and 90 keystrokes per minute per visitor → 429 |
| Real deployment | put the live path behind a server: auth, per-user + per-IP quotas, model keys server-side |

## Speed

| Technique | What it buys |
|---|---|
| Jev ∥ LLM ∥ Insights | the three calls run in parallel; a turn costs the slowest, not the sum |
| Warm snapshot | six months of transactions loaded when the sheet opens; fresh for 120 s |
| Stale-while-revalidate | a snapshot up to 30 min old is served instantly while one background refresh runs |
| Single flight | concurrent readers share one bank read |
| Typing cache | a chart built while typing is kept 60 s, so pressing send reuses the same numbers |
| Typing controls | ≥ 3 characters, 120 ms debounce, ≤ 2 requests in flight, newest-wins with a text check |
| No flicker | a different chart swaps in only at a word boundary or after 600 ms of quiet |

## How it's put together

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the diagrams and [docs/DESIGN-RULES.md](docs/DESIGN-RULES.md) for the rules that keep a model-driven UI safe.

```
index.html        the demo
architecture.html the design, as a page
site.css  phone.css
js/
  data.js       fictional cards, merchants (with monogram logos) and 6 months of transactions
  jev.js        Jev: the decision model (closed catalogue → scores → verdict)
  llm.js        the LLM (open values) and a pure date parser
  insights.js   question → closed lists → chart chooser → panel (pure)
  charts.js     draws a panel; never formats money or picks colours
  engine.js     orchestrator, safety gate, simulated bank, UI composer
  phone.js      renders UI blocks and the action tray
  inspector.js  flow diagram, scores, latency waterfall, payloads, log
  main.js       wiring, modes, scenarios
docs/
```

## What is real and what is simulated

Everything runs in your browser. Merchants are fictional. The models are **simulated**: Jev is a weighted-feature scorer that behaves like a calibrated classifier, and the “LLM” is a set of extractors. Latencies are illustrative ranges. Cards and transactions are made up and reset on reload. The **decision flow, thresholds, lanes, and safety rules** are the design being demonstrated.

## Contributing

Bug reports, ideas, and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for the local setup and review checklist. GitHub's issue forms are available for [bug reports](https://github.com/Rahulm38/Awesome-UI-on-fly/issues/new?template=bug_report.yml) and [feature ideas](https://github.com/Rahulm38/Awesome-UI-on-fly/issues/new?template=feature_request.yml).

## License

The project code is released under the [MIT License](LICENSE). The bundled Geist and Geist Mono font files are separately licensed under the SIL Open Font License 1.1; see [`fonts/OFL.txt`](fonts/OFL.txt). Icons are a bundled subset of [Lucide](https://lucide.dev) under the ISC License; see [`LICENSE-LUCIDE`](LICENSE-LUCIDE).
