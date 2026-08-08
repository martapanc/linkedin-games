## To Do

- best scores & ranking, players choose name and score is saved in global ranking for daily challenge, and locally by difficulty for current player
  - hosting/store: **Netlify + Netlify Blobs**; submissions are server-verified by
    re-deriving the day's board and checking the marks
  - local bests split **daily vs practice** per difficulty (schema change)
- deploy to e.g. Netlify
  - `sw.js` must stop caching `/api/**` before the leaderboard lands, and `CACHE`
    needs bumping to `queens-v3`
- timer (e.g. 5 seconds, and increasing after a few tries) before new hint is available, to motivate player to try things

## Done

- ~~Rules instead of "How it works"~~ — rules copy lives once in `components/Rules.tsx`,
  shown in a first-run dialog and an always-available disclosure; the generator/solver
  prose is gone from the UI (it survives in the README)
- ~~improve "game over" animation~~ — queens pop in a diagonal wave, then the panel and
  crown arrive; `prefers-reduced-motion` keeps the panel and drops the motion
