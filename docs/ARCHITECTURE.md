# Awesome UI on Fly — Architecture

Nova splits one hard problem — *understand a sentence and change a bank card safely* — into small parts that are each good at one thing.

| Part | Job | Why it's separate |
|---|---|---|
| **Jev** (decision model) | Picks **which** action, from a closed catalogue, with a score per choice | A closed set can't invent an action. Scores make thresholds possible. Fast enough to run on every keystroke |
| **LLM** | Pulls **open values** out of the sentence: amounts, merchants, countries, periods | Good at language, bad at being a gate. It never picks the action |
| **Rules decider** | Answers when both models are down | Slower and blunter, but the conversation never dies |
| **Safety gate** | Deterministic checks between any model output and the bank | The only door to a write. No model output passes around it |
| **Bank API** | Write, then **read back** | A ✓ is shown only when the read-back confirms the write |
| **Insights** | Reads a spending question into closed lists, picks a chart from the data's shape, builds the panel | Pure and fast (< 15 ms) over a warm in-memory snapshot |
| **UI composer** | Turns results into UI blocks | The phone draws primitives; it knows nothing about banking |

## System view

```mermaid
flowchart LR
  P[Phone · Nova UI] -->|turn| O[Orchestrator]
  O -->|parts| J[Jev<br/>decision model]
  O -->|parts| L[LLM<br/>slot extraction]
  O -.->|both down| R[Rules<br/>fallback]
  O -->|question| N[Insights<br/>snapshot + chooser]
  N -->|6-month read, single flight| B
  J --> S{Safety gate}
  L --> S
  R --> S
  S -->|act| B[(Bank API)]
  B -->|read-back| S
  S --> C[UI composer]
  C -->|blocks| P
```

## A turn (press send)

```mermaid
sequenceDiagram
  participant P as Phone
  participant O as Orchestrator
  participant J as Jev
  participant L as LLM
  participant S as Safety gate
  participant B as Bank
  participant C as Composer
  P->>O: { text, screen context }
  par in parallel
    O->>J: which action? (closed set)
    J-->>O: scores + verdict   ~30–80 ms
  and
    O->>L: which values?
    L-->>O: amount, merchant, dates…   ~400–900 ms
  and
    O->>O: insights over the warm snapshot   ~5–15 ms
  end
  O->>S: proposals
  S->>S: catalogue · card resolution · eligibility · sanitise · lane
  alt lane = act
    S->>B: write
    B-->>S: accepted
    S->>B: read-back
    B-->>S: state
  else lane = confirm / ask
    S-->>O: wait for the person
  end
  O->>C: results
  C-->>P: UI blocks
```

## A keystroke (score as you type)

```mermaid
sequenceDiagram
  participant P as Phone
  participant J as Jev
  P->>P: debounce 120 ms, request #n
  P->>J: text so far + screen context
  J-->>P: scores + verdict
  alt #n is still the newest request
    P->>P: draw the action tray
  else a newer request exists
    P->>P: drop this answer
  end
```

Only Jev answers keystrokes. The LLM and rules never do: if Jev is unavailable the tray is **absent**, not slow or blunt. The tray never writes anything. A tap on it builds an ordinary turn (your words plus the card you picked) and sends it down the same path as pressing send, so there is exactly one route to a bank write.

## From verdict to UI

```mermaid
flowchart TD
  V{Jev verdict} -->|ACTION| A[resolve card → lane]
  V -->|HANDOFF| H[“can't here” + button to the screen that can]
  V -->|CANDIDATES| D[“did you mean” list — 2 or 3 readings]
  V -->|AMBIGUOUS| Q[ask which reading — no tray while typing]
  V -->|UNSUPPORTED| U[say so, list what Nova can do]
  A -->|read| I[answer + metric + chart + button]
  A -->|act| W[write → read-back → ✓ with Undo]
  A -->|confirm| F[confirm row: irreversible or many cards]
  A -->|ask| K[chips for the missing value or card]
```

The composer picks the view from the question. Ask about a category and you get weekly bars. Ask where the money went and you get bars by category. A week with no spending is drawn without a `$0` label.

## Lanes

| Lane | When |
|---|---|
| **act** | reversible, confident, card known, all values present |
| **confirm** | irreversible (report lost, dispute, activate) **or** acting on all cards at once |
| **ask** | a value is missing, or the card isn't known |
| **read** | a question, not a change |

## Card resolution: cheapest correct signal first

1. The card the person **picked**
2. A card **named** in the message (“my travel card”, “4821”)
3. The **transaction** being discussed (disputes)
4. The card **on screen**
5. A card named **earlier in the same message**
6. The **only** card the person has
7. Otherwise, **ask**, showing every usable card

Scores may order the picker. They never remove a card from it.

## Thresholds

| Name | Value | Meaning |
|---|---|---|
| act | 0.60 | the lowest score an action needs to be asserted |
| high-stakes | 0.70 | the bar for report lost/stolen and disputes |
| handoff | 0.50 | a named screen for an out-of-scope request |
| candidate floor | 0.35 | the lowest score that still counts as a plausible reading |
| margin | 0.15 | how far the winner must lead any plausible rival |
