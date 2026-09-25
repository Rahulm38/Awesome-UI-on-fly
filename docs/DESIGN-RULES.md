# Awesome UI on Fly — Design rules

A model that drives UI and touches money needs rules that don't bend. Each rule below is enforced in the code and can be seen in the showcase.

**Never substitute.** An unsupported request is reported as unsupported, never mapped to the nearest action. “Block a merchant” must never become “freeze the card”. If the named card can't do it, Nova says so. It does not quietly use another card. → `engine.js › resolveCard`, `advance`

**Never drop.** Every part of a multi-part message gets its own row (done, waiting, or can't), in the order asked. The number of rows always equals the number of parts. → `engine.js › onText`, `compose`

**Never narrow by probability.** Scores rank cards in a picker; they never remove one. A card that can't do *this* action stays in the list, dimmed, with its reason. Only cards that can't do *anything* (closed or archived) are left out. If that leaves a single card, Nova still asks: a shorter list is not consent. → `resolveCard`

**A near tie is a question.** A reading wins only if it clears its bar **and** leads every plausible rival by the margin. Otherwise, with two or three plausible readings, the person chooses from a list. With fewer than two, nothing is shown, because a menu of one is a guess. → `jev.js › decide`

**High stakes need a higher bar.** Reporting a card lost and disputing a charge need 0.70, not 0.50. A half-typed “forgot” scores about 0.47 for both *lost card* and *PIN*, so it gets a choice, never an alarming suggestion. → `Jev.T.highStakes`

**Ambiguous words get no tray.** “atm” alone sits between *turn off ATM withdrawals* and *find an ATM*. A direction word (“off”, “block”) or a locate word (“find”, “near”) settles it. Without one, nothing is shown while typing, and pressing send asks. → `rawScores`

**Half a word asserts nothing.** While typing, a partial word raises its choice's score but can't push it over the bar. The tray appears only once a word is complete. → `PREFIXES`

**Newest keystroke wins.** Each keystroke request is numbered. A late answer to an older request is dropped, never drawn over a newer one. Pressing send cancels every in-flight keystroke. → `main.js › ask`, `send`

**One road to the bank.** The tray composes an ordinary turn. Chips, card picks, confirms and undos are all ordinary turns too. There is no second write path to keep correct. → `Phone.on.commit`, `Engine.message`

**Irreversible always confirms. All cards always confirm.** Even a reversible action confirms when it acts on every card at once, and the confirm row lists the cards it will skip and why. → `nextNeed`

**✓ means the bank confirmed it.** Every write is followed by a read-back. If the read-back doesn't match, the row shows ✕, never ✓. → `execute`, `Bank.verify`

**Undo is a real write, for a limited time.** A reversible change offers Undo for 30 minutes. Undo goes through the gate, writes the reverse, and reads back. → `onUndo`

**Order writes so a failure is harmless.** For travel, Nova allows the country *first* and restricts the card *second*. The reverse order could leave a card working only at home if the second step failed. → `execute`

**The LLM only writes words.** Jev decides the action *and* its values (amount, merchant, dates, card) in one call. The LLM never decides and never extracts values. It words an answer's headline (numbers only as placeholders, then Jev checks the wording), follow-ups and advice. Only when needed: never on keystrokes, never on bank writes. Headline wait ≤ 1.5 s; on failure → templated wording.

**Values are checked before they're used.** Jev proposes an amount, merchant or country. Only values in range, or in a known set, reach the bank. → `sanitize`

**Missing values are asked in the turn.** The tray only resolves *which action* and *which card*. Missing values are asked for in the chat, in one place. → `interaction`

**Jev down says so.** No second decider. The phone says “I can't understand requests right now” and shows a button to the screen that can do it.

**Charts don't shout zeros.** An empty week gets no `$0` label, and a just-started week is drawn faded. → `phone.js › CHART`

## Charts

**The data picks the chart, not the words.** Jev reads which chart the question asks for, from closed lists. Deterministic code picks the visual from the shape of the numbers and falls back down a ladder — a donut needs a clear leader, a split bar needs more than one card, a pace line needs five days of the month. The stat tile is the floor. → `insights.js › choose`

**The server formats; the phone draws.** Every money string and colour slot arrives in the panel. The phone never formats money or chooses a colour. → `charts.js`

**Only the latest column is labelled.** Everything else reads against the *usual* line — the median of complete periods, with a p25–p75 band behind it. No usual line when the median is under $1. → `R.V3`

**A period in progress looks in progress.** It is hatched and faded, and an empty one gets no "$0" label. → `R.V3`

**One-day windows say "on".** "on Sep 24", never "in Sep 24". → `range`

**Nothing unusual is an answer.** When nothing stands out, V21 says so with a calm grey tick rather than an empty chart. → `R.V21`
