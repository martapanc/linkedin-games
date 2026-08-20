import {buildCtx, isComplete, type Ctx} from "./solver";
import {EMPTY, MOON, SUN, type Cell, type Puzzle} from "./types";

/** The board's geometry, cached per puzzle — every helper here needs it. */
const ctxCache = new WeakMap<Puzzle, Ctx>();

export function ctxOf(puzzle: Puzzle): Ctx {
    let c = ctxCache.get(puzzle);
    if (!c) {
        c = buildCtx(puzzle.n, puzzle.links);
        ctxCache.set(puzzle, c);
    }
    return c;
}

/**
 * Cells breaking a rule, so the board can flag them live.
 *
 * Only *committed* breakages count: a half-filled row is not yet wrong, so a
 * line is faulted for holding too many of a symbol but never for holding too
 * few. Everything flagged here is something the player has to undo.
 */
export function findConflicts(puzzle: Puzzle, cells: Cell[]): Set<number> {
    const ctx = ctxOf(puzzle);
    const bad = new Set<number>();

    for (const line of ctx.lines) {
        const held: Record<number, number[]> = {[SUN]: [], [MOON]: []};
        for (const p of line) if (cells[p]) held[cells[p]].push(p);
        for (const v of [SUN, MOON]) {
            if (held[v].length > ctx.half) for (const p of held[v]) bad.add(p);
        }
        for (let k = 0; k + 2 < line.length; k++) {
            const [p0, p1, p2] = [line[k], line[k + 1], line[k + 2]];
            if (cells[p0] && cells[p0] === cells[p1] && cells[p0] === cells[p2]) {
                bad.add(p0);
                bad.add(p1);
                bad.add(p2);
            }
        }
    }

    for (const l of puzzle.links) {
        const a = cells[l.a];
        const b = cells[l.b];
        if (!a || !b) continue;
        if ((a === b) !== l.same) {
            bad.add(l.a);
            bad.add(l.b);
        }
    }

    return bad;
}

/** The signs the board currently contradicts, so they can be flagged too. */
export function brokenLinks(puzzle: Puzzle, cells: Cell[]): Set<number> {
    const out = new Set<number>();
    puzzle.links.forEach((l, k) => {
        const a = cells[l.a];
        const b = cells[l.b];
        if (a && b && (a === b) !== l.same) out.add(k);
    });
    return out;
}

export function isSolved(puzzle: Puzzle, cells: Cell[]): boolean {
    if (cells.length !== puzzle.n * puzzle.n) return false;
    if (cells.includes(EMPTY)) return false;
    return findConflicts(puzzle, cells).size === 0;
}

/** A board with only the givens showing — the state Clear returns you to. */
export const startingCells = (puzzle: Puzzle): Cell[] => puzzle.givens.slice();

export const isGiven = (puzzle: Puzzle, i: number) => puzzle.givens[i] !== EMPTY;

export {isComplete};
