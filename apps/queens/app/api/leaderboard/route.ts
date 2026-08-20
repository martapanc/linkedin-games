import {getStore} from "@netlify/blobs";
import {NextRequest, NextResponse} from "next/server";
import {dailyPuzzle, dailySeed, isSolved, type Mark} from "@/lib/queens";
import {
    isPlausibleElapsed,
    LEADERBOARD_VISIBLE,
    sanitizeName,
    upsertEntry,
    type LeaderboardEntry,
} from "@games/core";

const DAY_MS = 24 * 60 * 60 * 1000;

function leaderboardStore() {
    return getStore("leaderboard");
}

/**
 * A submitted date only has to fall within a day of the server's own clock,
 * not match it exactly — `dailySeed()`'s default is the caller's *local*
 * calendar date, and timezones alone can put that up to a day ahead of or
 * behind the server's UTC date. This still bounds acceptance to "the current
 * global day", so it can't be used to backfill arbitrary past dates.
 */
function isAcceptableDate(date: string): boolean {
    const now = Date.now();
    return [-DAY_MS, 0, DAY_MS].some((offset) => dailySeed(new Date(now + offset)) === date);
}

/**
 * `dailySeed`/`dailyPuzzle` read a `Date`'s *local* year/month/day, so a
 * "YYYY-MM-DD" string has to be turned back into a `Date` whose local
 * components land on that same day regardless of the server's own timezone.
 * Noon UTC is far enough from midnight in either direction to survive any
 * real-world offset.
 */
function dateFromKey(date: string): Date {
    return new Date(`${date}T12:00:00Z`);
}

function isValidMarks(marks: unknown, size: number): marks is Mark[] {
    return (
        Array.isArray(marks) &&
        marks.length === size &&
        marks.every((m) => m === 0 || m === 1 || m === 2)
    );
}

export async function GET(request: NextRequest) {
    const date = request.nextUrl.searchParams.get("date") ?? dailySeed();
    const entries = ((await leaderboardStore().get(date, {type: "json"})) as
        | LeaderboardEntry[]
        | null) ?? [];

    return NextResponse.json({
        date,
        entries: entries
            .slice(0, LEADERBOARD_VISIBLE)
            .map((e) => ({name: e.name, elapsedMs: e.elapsedMs})),
    });
}

export async function POST(request: NextRequest) {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
        return NextResponse.json({error: "Invalid body"}, {status: 400});
    }

    const {date, playerId, name, elapsed, marks} = body as Record<string, unknown>;

    if (typeof date !== "string" || !isAcceptableDate(date)) {
        return NextResponse.json({error: "Invalid or stale date"}, {status: 400});
    }
    if (typeof playerId !== "string" || playerId.length < 8 || playerId.length > 64) {
        return NextResponse.json({error: "Invalid player id"}, {status: 400});
    }
    if (typeof name !== "string") {
        return NextResponse.json({error: "Invalid name"}, {status: 400});
    }
    const cleanName = sanitizeName(name);
    if (!cleanName) {
        return NextResponse.json({error: "Name is empty"}, {status: 400});
    }
    if (!isPlausibleElapsed(elapsed)) {
        return NextResponse.json({error: "Invalid elapsed time"}, {status: 400});
    }

    // Re-derives the exact board the client played — the daily puzzle is a
    // pure function of the date, so there is nothing else to trust here.
    const puzzle = dailyPuzzle(dateFromKey(date));

    if (!isValidMarks(marks, puzzle.n * puzzle.n)) {
        return NextResponse.json({error: "Marks do not match this board"}, {status: 400});
    }
    if (!isSolved(puzzle, marks)) {
        return NextResponse.json({error: "Board is not solved"}, {status: 400});
    }

    const store = leaderboardStore();
    const existing =
        ((await store.get(date, {type: "json"})) as LeaderboardEntry[] | null) ?? [];
    const next = upsertEntry(existing, {
        playerId,
        name: cleanName,
        elapsedMs: elapsed,
        submittedAt: Date.now(),
    });
    await store.setJSON(date, next);

    const stored = next.find((e) => e.playerId === playerId)!;
    const rank = next.findIndex((e) => e.playerId === playerId) + 1;

    return NextResponse.json({
        entry: {name: stored.name, elapsedMs: stored.elapsedMs},
        rank,
    });
}
