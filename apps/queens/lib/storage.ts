import {createStorage, hashString, type Progress} from "@games/core";
import type {Mark, Puzzle} from "@/lib/queens";

export {formatTime} from "@games/core";
export type {BestTimes, Stats} from "@games/core";

const store = createStorage("queens:v1");

export const {
    loadStats,
    recordWin,
    hasSeenRules,
    markRulesSeen,
    getPlayerId,
    getPlayerName,
    setPlayerName,
} = store;

export type QueensProgress = Progress<Mark>;

/**
 * A seed alone is not enough to key saved progress: any change to the generator
 * makes the same seed produce a different board, and restoring stale marks onto
 * it silently corrupts the game. Fingerprint the regions themselves.
 */
export function fingerprint(puzzle: Puzzle): string {
    const shape = `${puzzle.n}:${puzzle.regions.map((r) => r.join(",")).join("|")}`;
    return hashString(shape).toString(36);
}

/** Returns saved marks only if they belong to this exact board. */
export function loadProgress(puzzle: Puzzle): QueensProgress | null {
    const p = store.readProgress<Mark>(puzzle.seed);
    if (!p || p.fp !== fingerprint(puzzle)) return null;
    if (p.marks.length !== puzzle.n * puzzle.n) return null;
    return p;
}

export const saveProgress = (seed: string, p: QueensProgress) =>
    store.saveProgress(seed, p);
