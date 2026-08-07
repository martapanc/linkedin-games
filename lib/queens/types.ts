export const DIFFICULTIES = ["easy", "medium", "hard", "expert"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
    easy: "Easy",
    medium: "Medium",
    hard: "Hard",
    expert: "Expert",
};

/**
 * A Queens board: an n x n grid partitioned into n colour regions.
 * `regions[r][c]` is the region id (0..n-1) of that cell.
 * `solution[r]` is the column of the queen in row r (guaranteed unique).
 */
export interface Puzzle {
    n: number;
    regions: number[][];
    solution: number[];
    difficulty: Difficulty;
    /** Hardest deduction tier the logical solver needed (see TIER_NAMES). */
    tier: number;
    /** Weighted cost of the logical solve — used to grade within a tier. */
    score: number;
    seed: string;
}

export type Mark = 0 | 1 | 2; // empty | cross | queen
