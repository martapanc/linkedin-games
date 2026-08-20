# linkedin-games

Clones of LinkedIn's daily puzzles, each one a standalone app that deploys and
rolls back on its own.

| Game | Lives in | Deploys to |
| --- | --- | --- |
| [Queens](apps/queens/README.md) | `apps/queens` | `queens-unlimited.netlify.app` |
| [Tango](apps/tango/README.md) | `apps/tango` | `tango-unlimited.netlify.app` |

```bash
pnpm install                    # once, from here
pnpm --filter tango-pwa dev     # or queens-pwa
pnpm build                      # every app
```

## Why a workspace

The two games share more than they look like they do: the same difficulty
ladder, the same seeded RNG, the same "your progress lives in localStorage and
the leaderboard is a bonus" model, and the same dialogs. All of that lives in
`packages/core` and is imported as `@games/core` — source, not built output, so
each app's `next.config.ts` lists it in `transpilePackages` and each app's
`globals.css` points an `@source` at it (Tailwind skips `node_modules`, which is
where pnpm's workspace link resolves).

What is *not* shared is the part that makes each game itself: its solver, its
generator, its board. Those have nothing in common beyond a shape.

```
apps/queens/       queens-unlimited — daily + practice, hints, leaderboard, PWA
apps/tango/        tango-unlimited  — daily + practice
packages/core/     difficulty ladder, RNG, storage, leaderboard rules, shared UI
```

## Deploying

Each app owns a `netlify.toml`, and each Netlify site sets its **base
directory** to that app's folder — that pairing is what makes the two sites
independent while sharing one repo and one lockfile. A push touching only
`apps/tango` still rebuilds both sites unless you give each one an [ignore
command](https://docs.netlify.com/configure-builds/ignore-builds/); that is the
one thing this layout does not give you for free.
