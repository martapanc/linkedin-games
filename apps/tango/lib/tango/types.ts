import type {Difficulty} from "@games/core";

export {DIFFICULTIES, DIFFICULTY_LABEL, type Difficulty} from "@games/core";

/**
 * What a cell holds. `EMPTY` is a *player* state — a solved board has none —
 * which is why the solved grid is typed as `Sym` and the board as `Cell`.
 * The numbering matches Queens' `Mark` on purpose: 0 is always "untouched",
 * so a tap cycles 0 → 1 → 2 → 0 in both games.
 */
export type Cell = 0 | 1 | 2;
export type Sym = 1 | 2;

export const EMPTY = 0 as const;
export const SUN = 1 as const;
export const MOON = 2 as const;

export const other = (s: Sym): Sym => (s === SUN ? MOON : SUN);

/**
 * A sign drawn on the edge between two orthogonally adjacent cells:
 * `=` when they must match, `×` when they must differ.
 *
 * `a` is always the lower index, so `b` is `a + 1` for a vertical edge between
 * two cells in the same row, or `a + n` for a horizontal one.
 */
export interface Link {
    a: number;
    b: number;
    same: boolean;
}

export interface Puzzle {
    /** Even — every row and column holds exactly `n / 2` of each symbol. */
    n: number;
    solution: Sym[];
    /** The cells that start filled in; `EMPTY` everywhere the player works. */
    givens: Cell[];
    links: Link[];
    difficulty: Difficulty;
    /** Hardest deduction tier the logical solver needed (see TIER_NAMES). */
    tier: number;
    /** Weighted cost of the logical solve — used to grade within a tier. */
    score: number;
    seed: string;
}
