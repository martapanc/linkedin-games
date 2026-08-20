/**
 * The invariants a board has to hold, checked against freshly generated ones.
 *   pnpm check
 *
 * `bench` answers "is the generator fast enough and rating honestly?"; this
 * answers "is what it hands the player actually a puzzle?" — the solution obeys
 * the rules, the givens agree with it, a fresh board isn't already won, a single
 * wrong symbol is caught, and the rule ladder alone walks the givens all the way
 * to the solution without ever needing to guess.
 */
import {DIFFICULTIES} from "@games/core";
import {DEFAULT_SIZE} from "../lib/tango/generator";
import {practicePuzzle} from "../lib/tango";
import {brokenLinks, findConflicts, isSolved, startingCells} from "../lib/tango/game";
import {buildCtx, nextDeduction} from "../lib/tango/solver";
import {other, type Cell, type Sym} from "../lib/tango/types";

const ROUNDS = Number(process.env.ROUNDS ?? 6);
let failures = 0;

function check(name: string, ok: boolean) {
    if (!ok) {
        failures++;
        console.log(`  FAIL  ${name}`);
    }
}

for (const difficulty of DIFFICULTIES) {
    const n = DEFAULT_SIZE[difficulty];
    for (let round = 0; round < ROUNDS; round++) {
        const p = practicePuzzle(difficulty, n);
        const solved = p.solution.slice() as Cell[];

        check(`${difficulty}: solution obeys the rules`, isSolved(p, solved));
        check(`${difficulty}: solution has no conflicts`, findConflicts(p, solved).size === 0);
        check(`${difficulty}: solution breaks no sign`, brokenLinks(p, solved).size === 0);
        check(
            `${difficulty}: givens agree with the solution`,
            p.givens.every((g, i) => g === 0 || g === p.solution[i]),
        );
        check(`${difficulty}: a fresh board is not already won`, !isSolved(p, startingCells(p)));

        // One wrong symbol has to show up as a conflict — otherwise the board
        // would let you finish it wrong and say nothing.
        const open = p.givens.findIndex((g) => g === 0);
        const wrong = solved.slice();
        wrong[open] = other(wrong[open] as Sym);
        check(`${difficulty}: a single wrong symbol is caught`, findConflicts(p, wrong).size > 0);
        check(`${difficulty}: a wrong board is not solved`, !isSolved(p, wrong));

        // The whole promise of the game: no guessing required.
        const ctx = buildCtx(p.n, p.links);
        const g = Int8Array.from(p.givens);
        let steps = 0;
        while (g.includes(0) && steps++ < 500) {
            const step = nextDeduction(ctx, g);
            if (!step) break;
            for (const f of step.fills) g[f.i] = f.v;
        }
        check(`${difficulty}: the rule ladder finishes the board`, !g.includes(0));
        check(
            `${difficulty}: the ladder lands on the one real solution`,
            [...g].every((v, i) => v === p.solution[i]),
        );
    }
    console.log(`${difficulty.padEnd(7)} ${ROUNDS} boards checked`);
}

console.log(failures ? `\n${failures} FAILURES` : "\nAll invariants hold.");
process.exit(failures ? 1 : 0);
