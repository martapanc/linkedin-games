## To Do

- a genuine play-through in the browser to confirm the leaderboard submission
  fires with a real (nonzero) elapsed time — automated testing hit the
  tab-visibility pause (background tabs don't run the clock), so only the
  server side of a submission got a live end-to-end check
- custom domain — still on the default `queens-unlimited.netlify.app`, not
  e.g. `queens.martacodes.it`

## Done

- ~~personal-bests UI~~ — a "Best times" disclosure next to Rules
  (`components/BestTimes.tsx`) tables all 5 difficulties × Daily/Practice from
  the already-tracked `Stats.best`, `—` where nothing's recorded yet
- ~~deploy to Netlify~~ — live at `queens-unlimited.netlify.app`
- ~~best scores & ranking~~ — daily wins prompt once for a name
  (`components/Leaderboard.tsx`), then POST to `app/api/leaderboard/route.ts`,
  which re-derives that day's board with the existing `dailyPuzzle()` and
  checks the marks with `isSolved()` before writing to Netlify Blobs; GET
  returns the top 20 for the day. One entry per player (`getPlayerId()` in
  `lib/storage.ts`), resubmission only overwrites if faster. `Stats.best` is
  now split into `daily`/`practice` buckets per difficulty, with a migration
  for the old flat shape. `sw.js` now bypasses `/api/**` entirely and bumped
  `CACHE` to `queens-v3`. Verified against real (sandboxed) Netlify Blobs via
  `netlify dev` — repo is now linked to the existing `queens-unlimited` site.
- ~~timer before new hint is available~~ — first 2 hints per board are free; each
  one after that locks the Hint button for longer (5s, 10s, 15s… capped at 30s),
  tracked per board and surviving a reload

- ~~Rules instead of "How it works"~~ — rules copy lives once in `components/Rules.tsx`,
  shown in a first-run dialog and an always-available disclosure; the generator/solver
  prose is gone from the UI (it survives in the README)
- ~~improve "game over" animation~~ — queens pop in a diagonal wave, then the panel and
  crown arrive; `prefers-reduced-motion` keeps the panel and drops the motion
