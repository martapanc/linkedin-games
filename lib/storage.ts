import {hashString, type Difficulty, type Mark, type Puzzle} from "@/lib/queens";

const PREFIX = "queens:v1";

export interface Progress {
    marks: Mark[];
    elapsed: number;
    won: boolean;
    /** Identifies the exact board these marks belong to. */
    fp: string;
}

/**
 * A seed alone is not enough to key saved progress: any change to the generator
 * makes the same seed produce a different board, and restoring stale marks onto
 * it silently corrupts the game. Fingerprint the regions themselves.
 */
export function fingerprint(puzzle: Puzzle): string {
    const shape = `${puzzle.n}:${puzzle.regions.map((r) => r.join(",")).join("|")}`;
    return hashString(shape).toString(36);
}

export interface Stats {
    played: number;
    won: number;
    best: Partial<Record<Difficulty, number>>;
    streak: number;
    lastDailyWon: string | null;
}

const EMPTY_STATS: Stats = {
    played: 0,
    won: 0,
    best: {},
    streak: 0,
    lastDailyWon: null,
};

function read<T>(key: string, fallback: T): T {
    if (typeof window === "undefined") return fallback;
    try {
        const raw = window.localStorage.getItem(key);
        return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
        return fallback;
    }
}

function write(key: string, value: unknown) {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
        /* private mode / quota — progress is a nicety, not a requirement */
    }
}

/** Returns saved marks only if they belong to this exact board. */
export function loadProgress(puzzle: Puzzle): Progress | null {
    const p = read<Progress | null>(`${PREFIX}:progress:${puzzle.seed}`, null);
    if (!p || p.fp !== fingerprint(puzzle)) return null;
    if (!Array.isArray(p.marks) || p.marks.length !== puzzle.n * puzzle.n) return null;
    return p;
}

export const saveProgress = (seed: string, p: Progress) =>
    write(`${PREFIX}:progress:${seed}`, p);

export const loadStats = () => read<Stats>(`${PREFIX}:stats`, EMPTY_STATS);

function yesterdayKey(today: string): string {
    const d = new Date(`${today}T12:00:00`);
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
}

/** Records a win; daily wins also advance the streak (once per day). */
export function recordWin(
    difficulty: Difficulty,
    elapsed: number,
    dailyKey: string | null,
): Stats {
    const s = loadStats();
    const best = s.best[difficulty];
    const next: Stats = {
        ...s,
        played: s.played + 1,
        won: s.won + 1,
        best: {...s.best, [difficulty]: best == null ? elapsed : Math.min(best, elapsed)},
    };

    if (dailyKey && s.lastDailyWon !== dailyKey) {
        next.streak = s.lastDailyWon === yesterdayKey(dailyKey) ? s.streak + 1 : 1;
        next.lastDailyWon = dailyKey;
    }

    write(`${PREFIX}:stats`, next);
    return next;
}

export function formatTime(ms: number): string {
    const total = Math.floor(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
}
