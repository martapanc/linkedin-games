import {DIFFICULTIES, rngFromSeed, shuffle, type Rng} from "@games/core";
import {analyze, findSolutions} from "./solver";
import type {Difficulty, Puzzle} from "./types";

/**
 * Generation runs backwards from the finished board:
 *
 *   1. draw a random valid queen placement (the solution),
 *   2. grow n connected colour regions outward from those queens, one seed each,
 *   3. *repair* the regions until that solution is the only one,
 *   4. grade it with the logical solver and keep it only if the rating matches.
 *
 * Step 3 is what makes this work at all. Raw flood-filled regions are almost
 * never unique — roughly 99% of them admit a second solution — so instead of
 * rerolling we hunt down each rival solution and reshape one cell to kill it.
 *
 * Region *shape* is the difficulty dial: compact blobs give you easy boards,
 * long interleaved tendrils force the harder deductions.
 */

interface GrowthStyle {
    /** Chance of extending the region we just grew — makes snaking shapes. */
    stick: number;
    /** Chance of feeding the smallest region — makes even, compact shapes. */
    balance: number;
}

/**
 * Measured, not guessed — and the opposite of the intuitive answer. Snaking,
 * uneven regions (high stick, low balance) tend to produce *easier* boards:
 * a long region that wanders across many rows constrains little, and the size
 * spread leaves small regions that resolve immediately. Even, compact regions
 * interlock and force the deeper deductions.
 */
const STYLE: Record<Difficulty, GrowthStyle> = {
    easy: {stick: 0.7, balance: 0.15},
    medium: {stick: 0.6, balance: 0.3},
    hard: {stick: 0.4, balance: 0.55},
    expert: {stick: 0.15, balance: 0.85},
    // Pushing past expert's settings doesn't help: sampling says stick 0.05 /
    // balance 0.95 yields *fewer* tier-5 boards, not more. Master is reached by
    // being choosier about the result, not by growing weirder regions.
    master: {stick: 0.15, balance: 0.85},
};

/**
 * Board sizes that yield a good supply of each rating.
 *
 * Size is a feel dial, not a difficulty dial — `effort` is normalised per row,
 * so a compact 10x10 grades the same as a compact 8x8 and only costs more to
 * generate. The ladder widens anyway because a bigger grid *looks* like the
 * step up the rating just earned.
 */
export const DEFAULT_SIZE: Record<Difficulty, number> = {
    easy: 7,
    medium: 8,
    hard: 9,
    expert: 9,
    master: 10,
};

/** One queen per row and column, with |Δcolumn| >= 2 between adjacent rows. */
export function randomSolution(n: number, rng: Rng): number[] | null {
    const sol = new Array<number>(n).fill(-1);
    const cols = Array.from({length: n}, (_, i) => i);

    const rec = (r: number, used: number, prev: number): boolean => {
        if (r === n) return true;
        for (const c of shuffle(cols, rng)) {
            if (used & (1 << c)) continue;
            if (prev >= 0 && Math.abs(c - prev) <= 1) continue;
            sol[r] = c;
            if (rec(r + 1, used | (1 << c), c)) return true;
        }
        sol[r] = -1;
        return false;
    };

    return rec(0, 0, -1) ? sol : null;
}

/**
 * A one-cell region hands you a queen for free, so every region is grown to at
 * least this size before shaping begins.
 */
export const MIN_REGION = 2;

/** Randomised multi-source flood fill: each region owns exactly one queen. */
export function growRegions(
    n: number,
    solution: number[],
    rng: Rng,
    style: GrowthStyle,
): number[][] {
    const owner = new Int32Array(n * n).fill(-1);
    const size = new Int32Array(n);
    for (let r = 0; r < n; r++) {
        owner[r * n + solution[r]] = r;
        size[r] = 1;
    }

    const frontier = (g: number): number[] => {
        const out = new Set<number>();
        for (let i = 0; i < owner.length; i++) {
            if (owner[i] !== g) continue;
            const r = (i / n) | 0;
            const c = i % n;
            if (r > 0 && owner[i - n] < 0) out.add(i - n);
            if (r < n - 1 && owner[i + n] < 0) out.add(i + n);
            if (c > 0 && owner[i - 1] < 0) out.add(i - 1);
            if (c < n - 1 && owner[i + 1] < 0) out.add(i + 1);
        }
        return [...out];
    };

    let remaining = n * n - n;
    let last = -1;

    // Phase 1: bring every region up to MIN_REGION before shaping starts.
    for (let pass = 1; pass < MIN_REGION; pass++) {
        for (let g = 0; g < n; g++) {
            if (size[g] > pass || remaining === 0) continue;
            const f = frontier(g);
            if (!f.length) continue;
            owner[f[Math.floor(rng() * f.length)]] = g;
            size[g]++;
            remaining--;
        }
    }

    // Phase 2: shape the regions according to the difficulty style.
    while (remaining > 0) {
        let pick = -1;
        let cells: number[] = [];

        if (last >= 0 && rng() < style.stick) {
            const f = frontier(last);
            if (f.length) {
                pick = last;
                cells = f;
            }
        }

        if (pick < 0) {
            const open: { g: number; cells: number[] }[] = [];
            for (let g = 0; g < n; g++) {
                const f = frontier(g);
                if (f.length) open.push({g, cells: f});
            }
            if (!open.length) break; // unreachable on a rectangular board
            let chosen: { g: number; cells: number[] };
            if (rng() < style.balance) {
                let best = open[0];
                for (const o of open) if (size[o.g] < size[best.g]) best = o;
                chosen = best;
            } else {
                chosen = open[Math.floor(rng() * open.length)];
            }
            pick = chosen.g;
            cells = chosen.cells;
        }

        const cell = cells[Math.floor(rng() * cells.length)];
        owner[cell] = pick;
        size[pick]++;
        remaining--;
        last = pick;
    }

    const regions: number[][] = [];
    for (let r = 0; r < n; r++) {
        regions.push(Array.from(owner.subarray(r * n, r * n + n)));
    }
    return regions;
}

/** Would region `g` stay in one piece if cell `drop` left it? */
function staysConnected(
    n: number,
    regions: number[][],
    g: number,
    drop: number,
    anchor: number,
): boolean {
    let total = 0;
    for (let i = 0; i < n * n; i++) {
        if (regions[(i / n) | 0][i % n] === g && i !== drop) total++;
    }
    if (total < MIN_REGION) return false;

    const seen = new Uint8Array(n * n);
    const stack = [anchor];
    seen[anchor] = 1;
    let reached = 0;
    while (stack.length) {
        const i = stack.pop()!;
        reached++;
        const r = (i / n) | 0;
        const c = i % n;
        const nbs = [
            r > 0 ? i - n : -1,
            r < n - 1 ? i + n : -1,
            c > 0 ? i - 1 : -1,
            c < n - 1 ? i + 1 : -1,
        ];
        for (const j of nbs) {
            if (j < 0 || seen[j] || j === drop) continue;
            if (regions[(j / n) | 0][j % n] !== g) continue;
            seen[j] = 1;
            stack.push(j);
        }
    }
    return reached === total;
}

/**
 * Reshape regions until `solution` is the only solution.
 *
 * Each pass finds a rival solution S2 and picks one of its queens that our
 * solution does not use. Moving that single cell into a neighbouring region
 * that already holds another S2 queen makes S2 illegal (two queens, one
 * region) while leaving our solution untouched — it never owned that cell.
 */
export function repairToUnique(
    n: number,
    regions: number[][],
    solution: number[],
    rng: Rng,
    maxSteps = 80,
): boolean {
    for (let step = 0; step < maxSteps; step++) {
        const sols = findSolutions(n, regions, 2);
        if (sols.length === 0) return false; // shouldn't happen
        if (sols.length === 1) return true;

        const mine = solution.join();
        const rival = sols.find((s) => s.join() !== mine);
        if (!rival) return true;

        // Which regions does the rival already occupy?
        const rivalRegionRows = new Map<number, number[]>();
        for (let r = 0; r < n; r++) {
            const g = regions[r][rival[r]];
            const list = rivalRegionRows.get(g);
            if (list) list.push(r);
            else rivalRegionRows.set(g, [r]);
        }

        const movable = shuffle(
            Array.from({length: n}, (_, r) => r).filter((r) => rival[r] !== solution[r]),
            rng,
        );

        let moved = false;
        for (const r of movable) {
            const c = rival[r];
            const cell = r * n + c;
            const g = regions[r][c];
            const anchorCell = regionAnchor(n, regions, solution, g);
            if (anchorCell < 0 || anchorCell === cell) continue;
            if (!staysConnected(n, regions, g, cell, anchorCell)) continue;

            const neighbours = shuffle(
                [
                    r > 0 ? regions[r - 1][c] : -1,
                    r < n - 1 ? regions[r + 1][c] : -1,
                    c > 0 ? regions[r][c - 1] : -1,
                    c < n - 1 ? regions[r][c + 1] : -1,
                ].filter((h) => h >= 0 && h !== g),
                rng,
            );

            for (const h of neighbours) {
                // Moving here only helps if the rival already has a queen in h.
                const rows = rivalRegionRows.get(h);
                if (!rows || rows.length === 0) continue;
                regions[r][c] = h;
                moved = true;
                break;
            }
            if (moved) break;
        }

        // No legal killing move from here — nudge one boundary cell and retry
        // rather than throwing the whole board away.
        if (!moved && !perturb(n, regions, solution, rng)) return false;
    }
    return findSolutions(n, regions, 2).length === 1;
}

/** Move one arbitrary boundary cell to a neighbouring region, legally. */
function perturb(
    n: number,
    regions: number[][],
    solution: number[],
    rng: Rng,
): boolean {
    const queenCells = new Set(solution.map((c, r) => r * n + c));
    const cells = shuffle(
        Array.from({length: n * n}, (_, i) => i).filter((i) => !queenCells.has(i)),
        rng,
    );

    for (const cell of cells) {
        const r = (cell / n) | 0;
        const c = cell % n;
        const g = regions[r][c];
        const anchor = regionAnchor(n, regions, solution, g);
        if (anchor < 0) continue;
        const targets = shuffle(
            [
                r > 0 ? regions[r - 1][c] : -1,
                r < n - 1 ? regions[r + 1][c] : -1,
                c > 0 ? regions[r][c - 1] : -1,
                c < n - 1 ? regions[r][c + 1] : -1,
            ].filter((h) => h >= 0 && h !== g),
            rng,
        );
        if (!targets.length) continue;
        if (!staysConnected(n, regions, g, cell, anchor)) continue;
        regions[r][c] = targets[0];
        return true;
    }
    return false;
}

/** The cell holding our solution's queen for region `g`. */
function regionAnchor(
    n: number,
    regions: number[][],
    solution: number[],
    g: number,
): number {
    for (let r = 0; r < n; r++) {
        if (regions[r][solution[r]] === g) return r * n + solution[r];
    }
    return -1;
}

/**
 * Repair is free to reshape regions, and left alone it happily grows one blob
 * over a third of the board. Average region size is always n, so cap the
 * largest at twice that — it keeps boards looking like hand-made ones.
 */
function regionSizesOk(n: number, regions: number[][]): boolean {
    const size = new Int32Array(n);
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) size[regions[r][c]]++;
    for (const s of size) {
        if (s < MIN_REGION || s > 2 * n) return false;
    }
    return true;
}

export interface GenerateOptions {
    n: number;
    difficulty: Difficulty;
    seed: string;
    /** Give up on the exact rating after this long and return the closest match. */
    budgetMs?: number;
    maxAttempts?: number;
}

export function generatePuzzle({
                                   n,
                                   difficulty,
                                   seed,
                                   // Cost per attempt climbs steeply with n while the hit rate falls, so a
                                   // flat budget quietly demotes big boards: at 10x10 a 2.5s cap handed back
                                   // an expert board roughly one run in twenty. Buy the tail more time.
                                   budgetMs = n >= 10 ? 6000 : 2500,
                                   maxAttempts = 600,
                               }: GenerateOptions): Puzzle {
    const rng = rngFromSeed(seed);
    const target = DIFFICULTIES.indexOf(difficulty);
    const started = Date.now();

    let best: Puzzle | null = null;
    let bestGap = Infinity;
    let solution = randomSolution(n, rng);

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        // Refresh the underlying placement periodically so we explore new shapes.
        if (attempt > 0 && attempt % 12 === 0) {
            solution = randomSolution(n, rng) ?? solution;
        }
        if (!solution) break;

        const regions = growRegions(n, solution, rng, STYLE[difficulty]);
        if (!repairToUnique(n, regions, solution, rng)) continue;
        if (!regionSizesOk(n, regions)) continue;

        const a = analyze(n, regions);
        // A board the logical solver cannot finish would need guessing — drop it.
        if (!a.solved) continue;

        const candidate: Puzzle = {
            n,
            regions,
            solution: solution.slice(),
            difficulty: a.difficulty,
            tier: a.tier,
            score: a.score,
            seed,
        };
        if (a.difficulty === difficulty) return candidate;

        const gap = Math.abs(DIFFICULTIES.indexOf(a.difficulty) - target);
        if (gap < bestGap) {
            best = candidate;
            bestGap = gap;
        }
        if (Date.now() - started > budgetMs && best) break;
    }

    if (best) return best;
    throw new Error(`Could not generate a ${difficulty} ${n}x${n} board`);
}

