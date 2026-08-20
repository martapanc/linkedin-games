# Tango — unlimited

A clone of LinkedIn's Tango with a generator that makes as many boards a day as
you want, and a difficulty rating that is **measured rather than assumed**.

```bash
pnpm install                     # from the repo root — this is a workspace
pnpm --filter tango-pwa dev      # play
pnpm --filter tango-pwa check    # the invariants every board has to hold
pnpm --filter tango-pwa bench    # generation speed + difficulty calibration
```

## The rules

Fill every square with a sun or a moon, so that:

- every row and every column ends up with the same number of each,
- no three of the same symbol sit consecutively, across or down,
- an `=` between two squares means they match, a `×` means they differ.

Every board has exactly one answer, and never needs a guess to find it — the
generator refuses to ship one that does.

## How a board is made

Backwards from the finished grid (`lib/tango/generator.ts`):

1. **Draw a random legal grid.** Row-major backtracking with the counts and the
   run-of-three check as pruning. That grid is the answer.
2. **Write down every clue it implies** — each of the 36 cells as a given, and a
   sign on each of the 60 edges. Trivially unique, and trivially boring.
3. **Take clues away**, one at a time in random order, keeping a removal only
   when the answer stays unique. Cells and signs are shuffled *together*: try
   every cell first and the signs alone pin the grid down, so all the cells come
   off and you get one lonely given; try every sign first and you get the
   mirror image, a board with no signs at all.
4. **Put clues back until it grades where you asked.**

Step 4 is the difficulty dial, and it only turns one way — adding a clue can
never make a board harder. So the minimal board from step 3 is the *ceiling* for
that answer grid, and if the ceiling is already too low the whole grid is thrown
away for another. Givens go back before signs, which is why easy boards come out
with a dozen symbols already showing and expert ones with two.

Clues are not interchangeable: one can drop a board clean past the target where
another lands on it. So an overshoot is taken straight back off and a different
clue tried instead. Skipping that costs a third of `hard` boards their rating.

> A board of pure signs is never solvable, incidentally. Flip every symbol on a
> finished grid: the counts still balance, no run of three appears, and every `=`
> and `×` still holds. So at least one given always survives step 3 without
> anyone having to ask for it.

## How it is rated

Not by size, and not by clue count — by *which techniques a solve is forced to
use*. The logical solver (`lib/tango/solver.ts`) runs a ladder of rules,
easiest-first, and the rating is the hardest rung the board actually forces.

| Tier | Rule | What it reads |
| --- | --- | --- |
| 1 | `link` | a filled cell and the sign beside it settle its neighbour |
| 1 | `triple` | `AA_` and `A_A` — a third would make three in a row |
| 1 | `count` | a line already holding its quota of one symbol fills up with the other |
| 2 | `quota` | counting that budgets for the signs: an unfilled `×` pair always spends one of each symbol, an `=` pair always spends two of one — so once the `×` pairs claim every remaining sun, the rest of the line is moons |
| 3 | `line` | write out every legal filling of one line and keep what they all agree on |
| 4 | `trial` | assume a symbol, run tiers 1–3, and take the contradiction as proof |

Tier 1 steps are scored at zero. Every board is riddled with them, so counting
them would grade boards by how *long* they are rather than how hard. What is
left — `score / n`, the **effort** — splits each tier into two ratings.

`pnpm check` proves the ladder alone walks the givens to the one real solution
on every board it generates. That is the actual promise being kept: no guessing.

## Layout

```
apps/tango/
  lib/tango/
    solver.ts     exhaustive solver + the tiered rule ladder / difficulty grader
    generator.ts  random grid → strip to minimal → relax to the target rating
    game.ts       conflicts, broken signs, win check
  components/     Board (grid, symbols, signs on the edges), TangoGame (state)
  scripts/        check.ts (invariants), bench.ts (speed + calibration)
packages/core/    the difficulty ladder, seeded RNG, localStorage, and the
                  dialogs both games share
```

Not yet built, in rough order: the hint engine (the ladder already reports why
each rule fired — `Deduction.text` — so this is UI, not logic), the daily
leaderboard, and the PWA manifest and service worker.

See the [repo README](../../README.md) for how the workspace fits together.
