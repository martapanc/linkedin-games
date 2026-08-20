import {previousDay} from "./format";
import type {Difficulty} from "./difficulty";

/**
 * Everything a game keeps on the device: progress on the board in front of
 * you, personal bests, the daily streak, and the identity a leaderboard
 * submission travels under.
 *
 * It is a factory rather than a module of loose functions because two games
 * share this file and must not share a namespace — `createStorage("tango:v1")`
 * and `createStorage("queens:v1")` write disjoint keys into the same origin's
 * localStorage when both are served from one host, and stay independent when
 * they are not.
 */

/** Marks/cells are per-game, so the board state travels as a type parameter. */
export interface Progress<T> {
    marks: T[];
    elapsed: number;
    won: boolean;
    /** Identifies the exact board these marks belong to — see `fingerprint`. */
    fp: string;
    /** Hints taken on this board, and when the next one unlocks (epoch ms). */
    hintsUsed: number;
    hintAvailableAt: number;
}

export interface BestTimes {
    daily: Partial<Record<Difficulty, number>>;
    practice: Partial<Record<Difficulty, number>>;
}

export interface Stats {
    played: number;
    won: number;
    best: BestTimes;
    streak: number;
    lastDailyWon: string | null;
}

const EMPTY_STATS: Stats = {
    played: 0,
    won: 0,
    best: {daily: {}, practice: {}},
    streak: 0,
    lastDailyWon: null,
};

/**
 * Queens shipped before the daily/practice split, when `best` held one number
 * per difficulty regardless of mode. That old shape can't be told apart by
 * mode after the fact, so it folds into `practice` — the more common bucket,
 * and this is a soft personal-best number rather than data that has to be
 * exactly right. Harmless for any game that never wrote the old shape.
 */
function migrateBest(raw: unknown): BestTimes {
    if (raw && typeof raw === "object" && ("daily" in raw || "practice" in raw)) {
        const b = raw as Partial<BestTimes>;
        return {daily: b.daily ?? {}, practice: b.practice ?? {}};
    }
    return {daily: {}, practice: (raw as Partial<Record<Difficulty, number>>) ?? {}};
}

export interface GameStorage {
    read<T>(key: string, fallback: T): T;
    write(key: string, value: unknown): void;
    /** Raw board state for a seed — validating it belongs to the board is the caller's job. */
    readProgress<T>(seed: string): Progress<T> | null;
    saveProgress<T>(seed: string, p: Progress<T>): void;
    loadStats(): Stats;
    /** Records a win; daily wins also advance the streak (once per day). */
    recordWin(difficulty: Difficulty, elapsed: number, dailyKey: string | null): Stats;
    hasSeenRules(): boolean;
    markRulesSeen(): void;
    /** Stable per-device id, so a resubmission updates an entry instead of duplicating it. */
    getPlayerId(): string;
    getPlayerName(): string | null;
    setPlayerName(name: string): void;
}

export function createStorage(prefix: string): GameStorage {
    const read = <T,>(key: string, fallback: T): T => {
        if (typeof window === "undefined") return fallback;
        try {
            const raw = window.localStorage.getItem(`${prefix}:${key}`);
            return raw ? (JSON.parse(raw) as T) : fallback;
        } catch {
            return fallback;
        }
    };

    const write = (key: string, value: unknown) => {
        if (typeof window === "undefined") return;
        try {
            window.localStorage.setItem(`${prefix}:${key}`, JSON.stringify(value));
        } catch {
            /* private mode / quota — progress is a nicety, not a requirement */
        }
    };

    const loadStats = (): Stats => {
        const s = read<Stats>("stats", EMPTY_STATS);
        return {...s, best: migrateBest(s.best)};
    };

    return {
        read,
        write,

        readProgress<T>(seed: string) {
            const p = read<Progress<T> | null>(`progress:${seed}`, null);
            if (!p || !Array.isArray(p.marks)) return null;
            // Records saved before the hint cooldown shipped won't carry these.
            return {...p, hintsUsed: p.hintsUsed ?? 0, hintAvailableAt: p.hintAvailableAt ?? 0};
        },

        saveProgress<T>(seed: string, p: Progress<T>) {
            write(`progress:${seed}`, p);
        },

        loadStats,

        recordWin(difficulty, elapsed, dailyKey) {
            const s = loadStats();
            const bucket = dailyKey ? "daily" : "practice";
            const best = s.best[bucket][difficulty];
            const next: Stats = {
                ...s,
                played: s.played + 1,
                won: s.won + 1,
                best: {
                    ...s.best,
                    [bucket]: {
                        ...s.best[bucket],
                        [difficulty]: best == null ? elapsed : Math.min(best, elapsed),
                    },
                },
            };

            if (dailyKey && s.lastDailyWon !== dailyKey) {
                next.streak = s.lastDailyWon === previousDay(dailyKey) ? s.streak + 1 : 1;
                next.lastDailyWon = dailyKey;
            }

            write("stats", next);
            return next;
        },

        /**
         * Read from an effect, never during render — the page is prerendered at
         * build time with no `window`, and `read` answers `false` there, so a
         * render-time check would flash the dialog open on every hydration.
         */
        hasSeenRules: () => read<boolean>("seen-rules", false),
        markRulesSeen: () => write("seen-rules", true),

        getPlayerId() {
            const existing = read<string | null>("player-id", null);
            if (existing) return existing;
            const id = crypto.randomUUID();
            write("player-id", id);
            return id;
        },

        getPlayerName: () => read<string | null>("player-name", null),
        setPlayerName: (name: string) => write("player-name", name),
    };
}
