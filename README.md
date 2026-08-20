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

Each app owns a `netlify.toml`, and each Netlify site points its **package
directory** at that app while leaving its **base directory** at the repository
root. That split is what makes a pnpm workspace work: install runs at the root,
where the lockfile and the workspace links live, and only the build is scoped to
one app.

The consequence worth remembering is that **paths inside `netlify.toml` are
relative to the base directory** — the repo root — and not to the file itself.
Hence `publish = "apps/tango/.next"` rather than `".next"`.

Each app's `[build] ignore` skips its site when a push didn't touch that app,
`packages/`, or the lockfile, so the two games really do deploy on their own.
