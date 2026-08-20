/**
 * Sanity-check + tuning harness for the generator.
 *   pnpm bench
 *
 * Verifies every generated board really is uniquely solvable and reachable by
 * the rule ladder, and reports generation time, the techniques each difficulty
 * leans on, and the clue shape — how many givens and signs land on the board,
 * which is what decides whether it *looks* like a Tango puzzle.
 */
import {DIFFICULTIES} from "@games/core";
import {DEFAULT_SIZE, generatePuzzle} from "../lib/tango/generator";
import {analyze, buildCtx, countSolutions, TIER_NAMES} from "../lib/tango/solver";
import {EMPTY} from "../lib/tango/types";

const ROUNDS = Number(process.env.ROUNDS ?? 12);

for (const difficulty of DIFFICULTIES) {
    const n = DEFAULT_SIZE[difficulty];
    const times: number[] = [];
    const tiers: number[] = [];
    const efforts: number[] = [];
    const givenCounts: number[] = [];
    const signCounts: number[] = [];
    let mismatched = 0;
    let notUnique = 0;
    let unsolvable = 0;

    for (let i = 0; i < ROUNDS; i++) {
        const t0 = performance.now();
        const p = generatePuzzle({n, difficulty, seed: `bench:${difficulty}:${i}`});
        times.push(performance.now() - t0);

        const ctx = buildCtx(p.n, p.links);
        if (countSolutions(ctx, p.givens, 2) !== 1) notUnique++;
        const a = analyze(ctx, p.givens);
        if (!a.solved) unsolvable++;
        if (p.difficulty !== difficulty) mismatched++;

        tiers.push(p.tier);
        efforts.push(a.effort);
        givenCounts.push(p.givens.filter((c) => c !== EMPTY).length);
        signCounts.push(p.links.length);
    }

    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const range = (xs: number[]) => `${Math.min(...xs)}–${Math.max(...xs)}`;
    const tierMix = [...new Set(tiers)]
        .sort()
        .map((t) => `${TIER_NAMES[t]}×${tiers.filter((x) => x === t).length}`)
        .join(" ");

    console.log(
        `${difficulty.padEnd(7)} ${n}x${n}  ` +
            `gen ${avg(times).toFixed(0)}ms (max ${Math.max(...times).toFixed(0)})  ` +
            `effort ${avg(efforts).toFixed(1)}  ` +
            `givens ${range(givenCounts)}  signs ${range(signCounts)}  ` +
            `[${tierMix}]` +
            (mismatched ? `  MISRATED ${mismatched}/${ROUNDS}` : "") +
            (notUnique ? `  NOT-UNIQUE ${notUnique}` : "") +
            (unsolvable ? `  UNSOLVABLE ${unsolvable}` : ""),
    );
}
