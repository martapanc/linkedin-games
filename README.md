# Queens — unlimited

An offline-capable PWA clone of LinkedIn's Queens, with a generator that makes as
many boards a day as you want and a difficulty rating that is **measured rather
than assumed**.

```bash
pnpm install
pnpm dev      # play
pnpm bench    # generator sanity-check + difficulty calibration
```

## Playing it on your phone (Tailscale)

```bash
pnpm phone      # build + serve on :3005  (leave running)
pnpm phone:on   # expose it over HTTPS, tailnet-only
```

Then open Tailnet URL on the phone and use
*Share → Add to Home Screen*. `pnpm phone:off` tears the proxy down;
`pnpm phone:status` shows what's exposed.

**Why the HTTPS proxy rather than just `http://100.x.y.z:3005`?** Service
workers only register in a [secure context](https://developer.mozilla.org/docs/Web/Security/Secure_Contexts).
A raw Tailscale IP over plain HTTP is not one, so the app would still load but
silently refuse to install and never work offline. `tailscale serve` terminates
TLS with a real Let's Encrypt cert for your `ts.net` name, which makes it a
secure context and the app properly installable.

`serve` publishes to your tailnet only — devices signed into your account.
It is *not* `tailscale funnel`, which would put it on the public internet.

Because puzzles are generated on-device, once the phone has loaded the app the
service worker keeps it fully playable **even when your Mac is asleep** — you
only need the Mac awake and `pnpm phone` running to install it or pick up code
changes.

## The rules

An `n × n` grid is partitioned into `n` colour regions. Place exactly one queen
per row, per column and per region, and no two queens may touch — including
diagonally.

Rows and columns alone force a permutation, so the two constraints that actually
bite are *one per region* and *no touching*. One useful consequence: since every
row holds exactly one queen, two queens can only touch if they sit in **adjacent
rows with |Δcolumn| ≤ 1**. That reduces the exhaustive solver to a tiny
row-by-row backtracker (`lib/queens/solver.ts`).

## How boards are generated

Generation runs backwards from a finished board (`lib/queens/generator.ts`):

1. **Draw a solution first.** A random permutation with `|Δcolumn| ≥ 2` between
   adjacent rows.
2. **Grow regions around it.** Each queen is a seed; regions flood-fill outward
   until the board is tiled, so every region contains exactly one queen and the
   solution is valid by construction.
3. **Repair until unique.** ← the step that makes it work.
4. **Grade it, then keep or discard.**

### Step 3 is the whole problem

Naively grown regions are almost never uniquely solvable — measured at
**~1% unique across 2400 boards**. Rerolling until you get a unique one is
hopeless.

So instead of rerolling, each rival solution is hunted down and killed. Find a
second solution `S2`, pick one of its queens that our solution does *not* use,
and move that single cell into a neighbouring region that already holds another
`S2` queen. Now `S2` has two queens in one region and is illegal, while our
solution is untouched — it never owned that cell. Guard rails: the donor region
must stay connected and above the minimum size.

That took the yield from ~1% to **31–59%**, and every surviving board is both
uniquely solvable and solvable by pure logic (no guessing).

## How difficulty is decided

Not by board size. The rating is **the hardest deduction technique the board
forces you to use**, found by replaying each board with a logical solver whose
rules are ordered easiest-first (`analyze()` in `lib/queens/solver.ts`):

| Tier | Technique | What it means |
|-----:|-----------|---------------|
| 1 | Single | Only one legal cell left in a row/column/region |
| 2 | Locked candidates | A region confined to one row claims it (and the converse) |
| 3 | Adjacency squeeze | A cell that would strand an entire region can't be a queen |
| 4 | Hall set | *k* rows drawing from exactly *k* regions consume them |
| 5 | Contradiction | Assume a queen, propagate, refute — the "I had to test it" tier |

The solver applies the cheapest rule that fires, then rescans from the top. The
rating is the highest tier reached; a normalised `effort` score (weighted rule
count ÷ `n`) splits a tier in two. Boards the logical solver *cannot* finish
would require guessing and are rejected outright.

Tier 5 gets a band to itself — **Master**. Contradiction is a different *kind*
of move from the rest of the ladder: you stop reading the board and start
assuming. Grading it by volume alongside tier 4 buried that step change, and
sampling says tier-5 boards are a steady 15–23% of output at 9×9 and 10×10, so
there is plenty to draw on.

Thresholds were calibrated against ~1700 generated boards rather than guessed —
score scales with board size, which is why it is normalised by `n`.

### Two things that turned out to be backwards

**Region shape is a weak dial.** Sweeping the growth parameters moved mean
difficulty only from tier 3.3 to 3.7, and every setting produced all five
ratings. The grader doing rejection sampling is what actually hits the target,
not the shaping. Pushing past the Expert settings makes this concrete: growing
weirder regions (stick 0.05 / balance 0.95) yields *fewer* tier-5 boards, not
more, so Master reuses Expert's style and simply asks for more.

**Snaking regions are *easier*, not harder.** The intuitive guess is that long
interleaved tendrils are nastier. Measured, the opposite holds: a region
wandering across many rows constrains very little, and uneven growth leaves
small regions that resolve immediately. Compact, evenly-sized regions interlock
and force the deeper deductions. The style table is set from the data.

Repair also had to be capped for looks — left alone it happily grew one blob
over a third of the board (worst case 43 of 64 cells), so region sizes are
clamped to `[2, 2n]`.

### Board size is a feel dial, not a difficulty dial

`effort` is normalised per row, so a compact 10×10 grades the same as a compact
8×8 and only costs more to generate. Sizes still widen up the ladder, because a
bigger grid *looks* like the step up the rating just earned — not because it is
what makes the board hard.

The cost is real, though: at 10×10 a flat 2.5s generation budget quietly handed
back an Expert board about one run in twenty, so boards with `n >= 10` get 6s.

### Current calibration

`pnpm bench` — each difficulty at the size the app ships it at, 20 boards each,
all on-target, none broken:

| Difficulty | Size | Gen (avg / max) | Tier | Score |
|------------|------|-----------------|------|-------|
| Easy | 7×7 | 9ms · 30ms | 2 (Locked candidates) | 8 |
| Medium | 8×8 | 12ms · 59ms | 3 (Adjacency squeeze) | 51 |
| Hard | 9×9 | 60ms · 254ms | 4 (Hall set) | 93 |
| Expert | 9×9 | 114ms · 313ms | 4 (Hall set) | 173 |
| Master | 10×10 | 700ms · 3184ms | 5 (Contradiction) | 374 |

Everything up to Expert is fast enough to generate synchronously in the browser.
Master can block the main thread for a couple of seconds on a phone; it paints
"Generating a board…" first, so the wait is at least honest, but it is the one
level that would benefit from a Web Worker.

## The app

- **Daily** — seeded from the date, so it is the same board on every device, with
  a Mon→Sun difficulty ramp. **Practice** — unlimited boards at any difficulty.
- Tap cycles empty → ✕ → 👑; drag sweeps ✕ across a run of cells. A whole drag
  is one undo step.
- A press is **not** resolved on `pointerdown` — at that instant a tap and the
  start of a drag look identical, and cycling early meant starting a sweep on an
  existing ✕ flipped it to a queen. The press is held pending: leaving the origin
  cell makes it a drag (which never cycles), releasing without leaving makes it a
  tap. Swipe paths are interpolated so fast drags don't skip cells, and touch
  pointer capture is released so the sweep crosses cell boundaries at all.
- **Auto-crossing.** Placing a queen crosses out its row, column, colour region
  and touching cells. These are *derived from the queens, never stored* — which
  is what makes removal correct for free: pull a queen off and exactly its own
  crosses disappear, while ones another queen still rules out stay put and any ✕
  you placed by hand is untouched. Auto and manual crosses render identically —
  a two-tier ✕ just reads as "some of these are hard to see" — and tapping one
  goes straight to a queen rather than a redundant manual mark.
- **Hints explain, they don't spoil.** The same rule ladder that grades the
  puzzle is replayed from *your* board — seeded with your queens and crosses —
  to find the next forced step, and names the technique behind it: *"These 3
  colours need columns 6, 7 and 8 between them — nothing else there can be a
  queen."*
- The highlight carries the pointing so the words don't have to. While a hint
  shows, everything irrelevant is **dimmed**; what stays bright is the reasoning,
  and the squares to act on get a ring plus a ghost ✕ or 👑 of the move. That is
  one idea rather than two competing decorations needing a legend — and it is
  why the text says "this colour" instead of "the salmon area": naming a colour
  is just a second, worse way of pointing at squares already lit up.
- **A hint holds the board until you've acted on it.** A hint that says "cross
  out these six" used to vanish on the first tap, leaving the other five to be
  remembered from a message no longer on screen. Now only the hint's own squares
  accept input while it is up, the panel counts down what's outstanding, and it
  releases itself on the last one. Sweeping still works across the gaps — the
  locked cells in between are skipped rather than blocking the drag. **Dismiss**
  is always there for when you'd rather just get back to playing.
- Under the lock a target toggles between empty and the mark being asked for,
  rather than cycling empty → ✕ → 👑. The hint wants one specific mark, so a
  mis-tap needs an escape that isn't a third, wrong mark.
- Mistakes are checked before any of that. The solver reasons from the marks on
  the board, so a single wrong one would let it prove something false — a
  confidently bogus hint being worse than none.
- **Region outlines are overlay spans, not CSS borders.** A 3px border mitres
  diagonally into the 1px border beside it, so every crossing had a notch bitten
  out of it and the outlines read as dashed. Spans butt together instead, with
  the strong ones a layer above so a weak line can never cut through one. They
  paint after the hint dimming, so a dimmed cell keeps its outline at full
  strength, and the hint ring is inset by the cell's own line widths to sit
  inside them the way it did when they were real borders.
- **Each cell also owns the vertex at its top-left.** A cell draws only its top
  and left lines — its right and bottom are the neighbours' near edges — so
  where a boundary *turns*, both spans stop at their own cell and leave a 3px
  notch in the elbow. The cell diagonally past the corner fills it, when either
  of the two edges on the far side of that vertex is a boundary. Overhanging the
  spans instead does not work: cells are isolated stacking contexts with opaque
  backgrounds, so anything spilling into a later sibling is painted over by it.
- That `isolation: isolate` on each cell is load-bearing for another reason too.
  `position: relative` leaves `z-index: auto`, which is *not* a stacking
  context, so the line spans' z-indices escaped the cell and painted over the
  "Solved in" overlay — 81 cells' worth of grid lines straight across it.
- Live conflict highlighting, timer, streaks, and progress saved per board.
- Progress is keyed by a **fingerprint of the region layout**, not just the seed:
  any change to the generator makes the same seed produce a different board, and
  restoring stale marks onto it would silently corrupt the game.
- Installable, works fully offline — puzzles are generated on-device, so the
  service worker only needs to cache the shell.

## Layout

```
lib/queens/
  solver.ts     exhaustive solver + tiered logical solver / difficulty grader
  generator.ts  solution → region growth → uniqueness repair → rating filter
  game.ts       conflicts, attacked cells, win check, hints
components/     Board (rendering + pointer handling), QueensGame (state)
scripts/bench.ts
```
