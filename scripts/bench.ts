/**
 * Sanity-check + tuning harness for the generator.
 *   pnpm bench
 *
 * Verifies every generated board really is uniquely solvable and reports how
 * long generation takes plus which deduction tiers each difficulty leans on.
 */
import { generatePuzzle } from "../lib/queens/generator";
import { analyze, findSolutions, TIER_NAMES } from "../lib/queens/solver";
import { DIFFICULTIES } from "../lib/queens/types";

const SIZES = [7, 8, 9];
const ROUNDS = 20;

for (const n of SIZES) {
  for (const difficulty of DIFFICULTIES) {
    const times: number[] = [];
    const tiers: number[] = [];
    const scores: number[] = [];
    let mismatched = 0;
    let broken = 0;

    for (let i = 0; i < ROUNDS; i++) {
      const t0 = performance.now();
      let puzzle;
      try {
        puzzle = generatePuzzle({ n, difficulty, seed: `bench-${n}-${difficulty}-${i}` });
      } catch {
        broken++;
        continue;
      }
      times.push(performance.now() - t0);

      const sols = findSolutions(n, puzzle.regions, 3);
      if (sols.length !== 1) broken++;
      if (sols[0]?.join() !== puzzle.solution.join()) broken++;

      const a = analyze(n, puzzle.regions);
      if (!a.solved) broken++;
      if (puzzle.difficulty !== difficulty) mismatched++;
      tiers.push(a.tier);
      scores.push(a.score);
    }

    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
    const max = (xs: number[]) => (xs.length ? Math.max(...xs) : 0);
    console.log(
      [
        `${n}x${n} ${difficulty.padEnd(6)}`,
        `gen avg ${avg(times).toFixed(0).padStart(4)}ms`,
        `max ${max(times).toFixed(0).padStart(5)}ms`,
        `tier ${avg(tiers).toFixed(1)} (peak ${max(tiers)}: ${TIER_NAMES[max(tiers)] ?? "-"})`,
        `score ${avg(scores).toFixed(0).padStart(3)}`,
        `offTarget ${mismatched}/${ROUNDS}`,
        broken ? `BROKEN ${broken}` : "ok",
      ].join("  "),
    );
  }
}
