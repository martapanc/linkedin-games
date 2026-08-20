import {DIFFICULTIES, rngFromSeed, shuffle, type Rng} from "@games/core";
import {analyze, buildCtx, hasUniqueSolution} from "./solver";
import {EMPTY, MOON, SUN, type Cell, type Difficulty, type Link, type Puzzle, type Sym} from "./types";

/**
 * Generation runs backwards from the finished board:
 *
 *   1. draw a random legal grid — that is the solution,
 *   2. write down *every* clue it implies: each cell as a given, and a sign on
 *      each of the board's edges,
 *   3. take clues away one at a time, in random order, keeping only the removals
 *      that leave the solution still unique,
 *   4. that minimal board is the hardest this solution can be. Put clues back
 *      until it grades at the difficulty asked for.
 *
 * Step 4 is the difficulty dial, and it only turns one way: adding a clue can
 * never make a board harder. So the minimal board sets the ceiling, and if that
 * ceiling is already below the target, this solution is abandoned for another.
 *
 * A board of pure signs is never solvable, by the way — flip every symbol on a
 * finished grid and the row and column counts still balance, no run of three
 * appears, and every `=` and `×` still holds. So at least one given always
 * survives step 3, without needing to be asked for.
 */

/**
 * Size is a feel dial rather than a difficulty one — `effort` is normalised per
 * line, so a 6x6 and an 8x8 needing the same techniques grade the same. The
 * ladder widens anyway because a bigger grid *looks* like the step up.
 */
export const DEFAULT_SIZE: Record<Difficulty, number> = {
    easy: 6,
    medium: 6,
    hard: 6,
    expert: 6,
    master: 8,
};

/** A legal completed grid: balanced lines, and never three of a symbol in a row. */
export function randomGrid(n: number, rng: Rng): Sym[] | null {
    const half = n / 2;
    const g = new Array<Sym | 0>(n * n).fill(0);
    const rowSuns = new Array<number>(n).fill(0);
    const colSuns = new Array<number>(n).fill(0);
    const rowMoons = new Array<number>(n).fill(0);
    const colMoons = new Array<number>(n).fill(0);

    const rec = (i: number): boolean => {
        if (i === n * n) return true;
        const r = (i / n) | 0;
        const c = i % n;
        for (const v of shuffle([SUN, MOON] as Sym[], rng)) {
            const rowUsed = v === SUN ? rowSuns : rowMoons;
            const colUsed = v === SUN ? colSuns : colMoons;
            if (rowUsed[r] === half || colUsed[c] === half) continue;
            // Only backwards runs can exist yet, so two behind is the whole check.
            if (c >= 2 && g[i - 1] === v && g[i - 2] === v) continue;
            if (r >= 2 && g[i - n] === v && g[i - 2 * n] === v) continue;

            g[i] = v;
            rowUsed[r]++;
            colUsed[c]++;
            if (rec(i + 1)) return true;
            g[i] = 0;
            rowUsed[r]--;
            colUsed[c]--;
        }
        return false;
    };

    return rec(0) ? (g as Sym[]) : null;
}

/** Every edge of the board, as the pair of cells it separates. */
export function allEdges(n: number): [number, number][] {
    const out: [number, number][] = [];
    for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
            const i = r * n + c;
            if (c + 1 < n) out.push([i, i + 1]);
            if (r + 1 < n) out.push([i, i + n]);
        }
    }
    return out;
}

/** A clue: either a cell revealed, or a sign drawn on an edge. */
type Clue = {kind: "cell"; i: number} | {kind: "edge"; k: number};

/**
 * Holds which clues are currently showing and answers the two questions
 * generation asks over and over: is this still unique, and how hard is it.
 */
class Draft {
    readonly cellOn: boolean[];
    readonly edgeOn: boolean[];

    constructor(
        readonly n: number,
        readonly solution: Sym[],
        readonly edges: [number, number][],
        cells = true,
        signs = true,
    ) {
        this.cellOn = new Array(n * n).fill(cells);
        this.edgeOn = new Array(edges.length).fill(signs);
    }

    set(c: Clue, on: boolean) {
        if (c.kind === "cell") this.cellOn[c.i] = on;
        else this.edgeOn[c.k] = on;
    }

    links(): Link[] {
        const out: Link[] = [];
        for (let k = 0; k < this.edges.length; k++) {
            if (!this.edgeOn[k]) continue;
            const [a, b] = this.edges[k];
            out.push({a, b, same: this.solution[a] === this.solution[b]});
        }
        return out;
    }

    givens(): Cell[] {
        return this.solution.map((v, i) => (this.cellOn[i] ? v : EMPTY));
    }

    ctx() {
        return buildCtx(this.n, this.links());
    }

    unique(): boolean {
        return hasUniqueSolution(this.ctx(), this.givens());
    }

    grade() {
        return analyze(this.ctx(), this.givens());
    }
}

export interface GenerateOptions {
    n: number;
    difficulty: Difficulty;
    seed: string;
    /** How many solutions to try before settling for the closest rating found. */
    attempts?: number;
}

export function generatePuzzle({
    n,
    difficulty,
    seed,
    attempts = 14,
}: GenerateOptions): Puzzle {
    if (n % 2) throw new Error(`Tango needs an even board size, got ${n}`);

    const rng = rngFromSeed(seed);
    const edges = allEdges(n);
    const target = DIFFICULTIES.indexOf(difficulty);

    let best: Puzzle | null = null;
    let bestGap = Infinity;

    for (let attempt = 0; attempt < attempts; attempt++) {
        const solution = randomGrid(n, rng);
        if (!solution) continue;

        const draft = new Draft(n, solution, edges);

        // Strip it back as far as it will go. Cells and signs are shuffled
        // together rather than in turn: try every cell first and the signs alone
        // pin the board down so all of them come off, leaving one lonely given;
        // try every sign first and the reverse happens.
        const clues: Clue[] = shuffle(
            [
                ...solution.map((_, i): Clue => ({kind: "cell", i})),
                ...edges.map((_, k): Clue => ({kind: "edge", k})),
            ],
            rng,
        );

        const removed: Clue[] = [];
        for (const c of clues) {
            draft.set(c, false);
            if (draft.unique()) removed.push(c);
            else draft.set(c, true);
        }

        // Put clues back until the board grades at the target. Givens go back
        // first — one more revealed cell eases a board far more naturally than
        // another sign, and it keeps the finished board from being a mess of
        // edge markings. (`pop` reads from the tail, so cells go in last.)
        const bag = [
            ...shuffle(removed.filter((c) => c.kind === "edge"), rng),
            ...shuffle(removed.filter((c) => c.kind === "cell"), rng),
        ];

        const rank = (g: {difficulty: Difficulty}) => DIFFICULTIES.indexOf(g.difficulty);
        let grade = draft.grade();
        // Clues are not interchangeable: one can drop a board clean past the
        // target where another lands on it. So an overshoot is taken straight
        // back off and a different clue tried instead, rather than abandoning
        // the whole solution — which is what made the middle ratings, whose
        // bands are narrowest, so expensive to hit.
        const skipped: Clue[] = [];
        let settling = false;

        while (!grade.solved || rank(grade) > target) {
            if (!bag.length) {
                if (!settling && skipped.length) {
                    // Nothing left that lands on the target — take the nearest
                    // overshoot rather than hand back an unfinishable board.
                    bag.push(...skipped.splice(0));
                    settling = true;
                    continue;
                }
                break;
            }
            const c = bag.pop()!;
            draft.set(c, true);
            const next = draft.grade();
            if (!settling && next.solved && rank(next) < target) {
                draft.set(c, false);
                skipped.push(c);
                continue;
            }
            grade = next;
        }

        if (!grade.solved) continue;

        const puzzle: Puzzle = {
            n,
            solution,
            givens: draft.givens(),
            links: draft.links(),
            difficulty: grade.difficulty,
            tier: grade.tier,
            score: grade.score,
            seed,
        };
        if (grade.difficulty === difficulty) return puzzle;

        // Nothing at the asked-for rating yet — hold on to the nearest miss so a
        // board always comes back, and keep looking.
        const gap = Math.abs(DIFFICULTIES.indexOf(grade.difficulty) - target);
        if (gap < bestGap) {
            bestGap = gap;
            best = puzzle;
        }
    }

    if (best) return best;
    throw new Error(`Could not generate a ${difficulty} ${n}x${n} board`);
}
