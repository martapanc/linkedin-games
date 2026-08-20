/**
 * Pure, framework-free leaderboard logic — kept separate from Next.js the same
 * way `lib/queens/` is, so the rules (name limits, upsert-if-faster) are
 * testable and reusable without a request/response in scope.
 */

export interface LeaderboardEntry {
    playerId: string;
    name: string;
    elapsedMs: number;
    submittedAt: number;
}

/** How many entries are handed back to a `GET`. */
export const LEADERBOARD_VISIBLE = 20;

/** How many entries a day's blob keeps, well past what's shown. */
export const LEADERBOARD_STORED = 100;

const NAME_MAX = 24;

/** Strips control characters, trims, collapses whitespace, caps length. */
export function sanitizeName(raw: string): string {
    const printable = [...raw]
        .filter((ch) => {
            const code = ch.codePointAt(0) ?? 0;
            return code >= 0x20 && code !== 0x7f;
        })
        .join("");
    return printable.trim().replace(/\s+/g, " ").slice(0, NAME_MAX);
}

/** Rejects non-finite, non-positive, or implausibly large elapsed times. */
export function isPlausibleElapsed(ms: unknown): ms is number {
    return typeof ms === "number" && Number.isFinite(ms) && ms > 0 && ms < 24 * 60 * 60 * 1000;
}

/**
 * Replaces the caller's existing entry only if the new time is faster (or
 * they have none yet); otherwise the list comes back unchanged. Always
 * re-sorted fastest-first and capped at `LEADERBOARD_STORED`.
 */
export function upsertEntry(
    entries: LeaderboardEntry[],
    next: LeaderboardEntry,
): LeaderboardEntry[] {
    const existing = entries.find((e) => e.playerId === next.playerId);
    const kept =
        existing && existing.elapsedMs <= next.elapsedMs
            ? entries
            : [...entries.filter((e) => e.playerId !== next.playerId), next];

    return kept.sort((a, b) => a.elapsedMs - b.elapsedMs).slice(0, LEADERBOARD_STORED);
}
