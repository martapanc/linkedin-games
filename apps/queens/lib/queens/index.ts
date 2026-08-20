export * from "./types";
export * from "./palette";
export * from "./solver";
export * from "./generator";
export * from "./game";

// Re-exported so the rest of the app keeps importing its puzzle vocabulary
// from one place, even though these now live in the shared package.
export {dailySeed, rngFromSeed, hashString, shuffle, type Rng} from "@games/core";

import {dailySeed} from "@games/core";
import {DEFAULT_SIZE, generatePuzzle} from "./generator";
import type {Difficulty, Puzzle} from "./types";

/** Mon → Sun ramp, so the week gets progressively meaner. */
const DAILY_RAMP: Difficulty[] = [
    "hard", // Sun
    "easy", // Mon
    "easy",
    "medium",
    "medium",
    "hard",
    "master", // Sat
];

export function dailyDifficulty(date: Date = new Date()): Difficulty {
    return DAILY_RAMP[date.getDay()];
}

export function dailyPuzzle(date: Date = new Date()): Puzzle {
    const difficulty = dailyDifficulty(date);
    const n = DEFAULT_SIZE[difficulty];
    return generatePuzzle({n, difficulty, seed: `daily:${dailySeed(date)}`});
}

export function practicePuzzle(difficulty: Difficulty, n: number): Puzzle {
    const seed = `practice:${difficulty}:${n}:${Math.random().toString(36).slice(2)}`;
    return generatePuzzle({n, difficulty, seed});
}
