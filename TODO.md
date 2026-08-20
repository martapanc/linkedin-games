## To Do

### Tango

- hint engine — the rule ladder already reports why each rule fired
  (`Deduction.title` / `.text` / `.evidence` / `.fills` in
  `apps/tango/lib/tango/solver.ts`), so this is the UI and the cooldown, not
  the logic
- daily leaderboard — Queens' `app/api/leaderboard/route.ts` re-derives the
  day's board and verifies the marks before writing; Tango can do the same with
  `dailyPuzzle()` + `isSolved()`, and the sanitising/upsert rules are already
  shared in `@games/core`
- PWA — manifest, icons and a service worker, as Queens has
- ~2/25 `hard` boards and ~1/25 `master` ones still come back rated a rung off
  after all 14 attempts. They report their real rating, so nothing lies to the
  player, but the `hard` band (tier 3, effort ≥ 8) is narrow enough to be worth
  re-calibrating against a bigger sample

### Both

- point the two Netlify sites at their new base directories (`apps/queens`,
  `apps/tango`) — **queens-unlimited still targets the repo root and will fail
  its next deploy until this is done** — and create the `tango-unlimited` site
- a push touching one app rebuilds both sites; each needs an
  [ignore command](https://docs.netlify.com/configure-builds/ignore-builds/)
- custom domains — still on the default `*.netlify.app`, not e.g.
  `queens.martacodes.it`

### Queens

- a genuine play-through in the browser to confirm the leaderboard submission
  fires with a real (nonzero) elapsed time — automated testing hit the
  tab-visibility pause (background tabs don't run the clock), so only the
  server side of a submission got a live end-to-end check

## Done

- ~~Tango, first pass~~ — `apps/tango`, deployable on its own. Seeded generator
  that strips a full clue set to minimal and relaxes it back to the target
  rating; a 4-tier rule ladder that grades boards and proves every one is
  solvable without guessing; board UI in the Queens visual language, with the
  `=`/`×` signs riding the edges between cells; daily + practice, five
  difficulties, timer, undo, clear, local progress and best times.
  `pnpm check` asserts the invariants, `pnpm bench` the speed and calibration.
- ~~monorepo~~ — Queens moved to `apps/queens`, shared code to
  `packages/core` (`@games/core`): the difficulty ladder, seeded RNG, the
  localStorage store, the leaderboard rules, and the `ConfirmDialog` /
  `RulesDialog` / `BestTimesTable` / `ServiceWorker` components, plus the
  palette tokens in `styles.css`. Queens' behaviour is unchanged.
- ~~personal-bests UI~~ — a "Best times" disclosure next to Rules
  (`BestTimesTable` in `@games/core/ui`) tables all 5 difficulties ×
  Daily/Practice from the already-tracked `Stats.best`, `—` where nothing's
  recorded yet
- ~~deploy to Netlify~~ — live at `queens-unlimited.netlify.app`
- ~~best scores & ranking~~ — daily wins prompt once for a name
  (`components/Leaderboard.tsx`), then POST to `app/api/leaderboard/route.ts`,
  which re-derives that day's board with the existing `dailyPuzzle()` and
  checks the marks with `isSolved()` before writing to Netlify Blobs; GET
  returns the top 20 for the day. One entry per player, resubmission only
  overwrites if faster. Verified against real (sandboxed) Netlify Blobs via
  `netlify dev`.
- ~~timer before new hint is available~~ — first 2 hints per board are free; each
  one after that locks the Hint button for longer (5s, 10s, 15s… capped at 30s),
  tracked per board and surviving a reload
- ~~Rules instead of "How it works"~~ — rules copy lives once in `Rules.tsx`,
  shown in a first-run dialog and an always-available disclosure; the
  generator/solver prose is gone from the UI (it survives in the README)
- ~~improve "game over" animation~~ — queens pop in a diagonal wave, then the
  panel and crown arrive; `prefers-reduced-motion` keeps the panel and drops the
  motion
