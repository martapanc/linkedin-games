import {hashString, type Difficulty, type Mark, type Puzzle} from "@/lib/queens";

const PREFIX = "queens:v1";

export interface Progress {
    marks: Mark[];
    elapsed: number;
    won: boolean;
    /** Identifies the exact board these marks belong to. */
    fp: string;
    /** Hints taken on this board, and when the next one unlocks (epoch ms). */
    hintsUsed: number;
    hintAvailableAt: number;
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
 * Before the daily/practice split, `best` held one number per difficulty
 * regardless of mode. That old shape can't be told apart by mode after the
 * fact, so it folds into `practice` — the more common bucket, and this is a
 * soft personal-best number rather than data that needs to be exactly right.
 */
function migrateBest(raw: unknown): BestTimes {
    if (raw && typeof raw === "object" && ("daily" in raw || "practice" in raw)) {
        const b = raw as Partial<BestTimes>;
        return {daily: b.daily ?? {}, practice: b.practice ?? {}};
    }
    return {daily: {}, practice: (raw as Partial<Record<Difficulty, number>>) ?? {}};
}

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
    // Records saved before the hint cooldown shipped won't carry these.
    return {...p, hintsUsed: p.hintsUsed ?? 0, hintAvailableAt: p.hintAvailableAt ?? 0};
}

export const saveProgress = (seed: string, p: Progress) =>
    write(`${PREFIX}:progress:${seed}`, p);

export function loadStats(): Stats {
    const s = read<Stats>(`${PREFIX}:stats`, EMPTY_STATS);
    return {...s, best: migrateBest(s.best)};
}

/**
 * Whether the rules have been shown once already. Read from an effect, never
 * during render — the page is prerendered at build time with no `window`, and
 * `read` answers `false` there, so a render-time check would flash the dialog
 * open on every hydration.
 */
export const hasSeenRules = () => read<boolean>(`${PREFIX}:seen-rules`, false);

export const markRulesSeen = () => write(`${PREFIX}:seen-rules`, true);

/** Stable per-device id so a leaderboard resubmission updates the same entry
 * instead of creating a duplicate. Created on first use. */
export function getPlayerId(): string {
    const existing = read<string | null>(`${PREFIX}:player-id`, null);
    if (existing) return existing;
    const id = crypto.randomUUID();
    write(`${PREFIX}:player-id`, id);
    return id;
}

export const getPlayerName = () => read<string | null>(`${PREFIX}:player-name`, null);

export const setPlayerName = (name: string) => write(`${PREFIX}:player-name`, name);

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
