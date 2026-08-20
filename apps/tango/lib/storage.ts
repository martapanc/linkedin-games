import {createStorage, hashString, type Progress} from "@games/core";
import type {Cell, Puzzle} from "@/lib/tango";

export {formatTime} from "@games/core";
export type {BestTimes, Stats} from "@games/core";

const store = createStorage("tango:v1");

export const {
    loadStats,
    recordWin,
    hasSeenRules,
    markRulesSeen,
    getPlayerId,
    getPlayerName,
    setPlayerName,
} = store;

export type TangoProgress = Progress<Cell>;

/**
 * A seed alone is not enough to key saved progress: any change to the generator
 * makes the same seed produce a different board, and restoring stale marks onto
 * it silently corrupts the game. Fingerprint the board itself — its givens and
 * its signs, which together are what the player is actually looking at.
 */
export function fingerprint(puzzle: Puzzle): string {
    const shape = [
        puzzle.n,
        puzzle.givens.join(""),
        puzzle.links.map((l) => `${l.a}-${l.b}${l.same ? "=" : "x"}`).join(","),
    ].join(":");
    return hashString(shape).toString(36);
}

/** Returns saved cells only if they belong to this exact board. */
export function loadProgress(puzzle: Puzzle): TangoProgress | null {
    const p = store.readProgress<Cell>(puzzle.seed);
    if (!p || p.fp !== fingerprint(puzzle)) return null;
    if (p.marks.length !== puzzle.n * puzzle.n) return null;
    return p;
}

export const saveProgress = (seed: string, p: TangoProgress) => store.saveProgress(seed, p);
