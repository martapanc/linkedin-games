import {buildCtx, isComplete, nextDeduction, type Ctx, type Fill} from "./solver";
import {EMPTY, MOON, SUN, type Cell, type Puzzle, type Sym} from "./types";

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

export interface Hint {
    /** Badge label: the technique, or the kind of mistake. */
    title: string;
    text: string;
    /** Squares that make the argument work. */
    evidence: number[];
    /** Squares the argument resolves. */
    targets: number[];
    /**
     * What to fill each target with. `null` for a mistake hint — it points at
     * a square you got wrong without prescribing what belongs there, since
     * Tango (unlike Queens) has no separate "deliberately wrong" mark: the
     * fix is just the other symbol, and the player has to see that for
     * themselves rather than be handed it.
     */
    fills: Fill[] | null;
}

/**
 * Explain the next step rather than give it away.
 *
 * Mistakes come first: `nextDeduction` reasons from the cells on the board, so
 * a single wrong one would let it "prove" something false. Once the board is
 * known-consistent, the rule ladder supplies the next forced fill together
 * with the technique that justifies it — the same ladder `analyze` uses to
 * grade the puzzle, so a hint never explains a step the generator wouldn't.
 */
export function getHint(puzzle: Puzzle, cells: Cell[]): Hint {
    const {solution} = puzzle;

    for (let i = 0; i < cells.length; i++) {
        if (cells[i] !== EMPTY && cells[i] !== solution[i]) {
            return {
                title: "Mistake",
                text: "This square can't be right — anything you work out from it will be off too.",
                evidence: [],
                targets: [i],
                fills: null,
            };
        }
    }

    const ctx = ctxOf(puzzle);
    const d = nextDeduction(ctx, Int8Array.from(cells));
    if (d) {
        return {
            title: d.title,
            text: d.text,
            evidence: d.evidence,
            targets: d.fills.map((f) => f.i),
            fills: d.fills,
        };
    }

    const remaining = cells.map((_, i) => i).filter((i) => cells[i] === EMPTY);
    if (!remaining.length) {
        return {
            title: "All set",
            text: "Nothing left to work out — you're done.",
            evidence: [],
            targets: [],
            fills: null,
        };
    }
    // Every technique the solver knows is exhausted; fall back to showing one.
    const i = remaining[0];
    return {
        title: "Square",
        text: "No single step forces the next move — but this one is set.",
        evidence: [],
        targets: [i],
        fills: [{i, v: solution[i] as Sym}],
    };
}
