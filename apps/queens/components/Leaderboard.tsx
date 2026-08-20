"use client";

import {useEffect, useRef, useState} from "react";
import {formatTime} from "@games/core";

/**
 * Asks for a display name before a daily win's time reaches the leaderboard.
 * Shown once — after a name is picked, later wins submit silently. Skipping
 * just means "not yet"; nothing is lost by declining.
 */
export function NamePromptDialog({
    onSubmit,
    onSkip,
}: {
    onSubmit: (name: string) => void;
    onSkip: () => void;
}) {
    const [name, setName] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        inputRef.current?.focus();
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault();
                onSkip();
            }
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [onSkip]);

    const submit = () => {
        const trimmed = name.trim();
        if (trimmed) onSubmit(trimmed);
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]"
            onClick={onSkip}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="name-prompt-title"
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-sm rounded-2xl bg-[var(--surface)] p-5 text-sm text-[var(--muted)] shadow-xl"
            >
                <h2
                    id="name-prompt-title"
                    className="mb-2 text-lg font-bold text-[var(--foreground)]"
                >
                    Save your time to the leaderboard?
                </h2>
                <p className="leading-relaxed">
                    Pick a name — it&apos;s shown next to today&apos;s fastest solves.
                </p>
                <input
                    ref={inputRef}
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") submit();
                    }}
                    maxLength={24}
                    placeholder="Your name"
                    className="mt-3 w-full rounded-lg border border-[var(--chip)] bg-transparent px-3 py-2 text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
                />
                <div className="mt-5 grid grid-cols-2 gap-2">
                    <button
                        onClick={onSkip}
                        className="rounded-lg bg-[var(--chip)] py-2.5 font-semibold text-[var(--foreground)]"
                    >
                        Skip
                    </button>
                    <button
                        onClick={submit}
                        disabled={!name.trim()}
                        className="rounded-lg bg-[var(--accent)] py-2.5 font-semibold text-white disabled:opacity-40"
                    >
                        Submit
                    </button>
                </div>
            </div>
        </div>
    );
}

interface LeaderboardResponse {
    date: string;
    entries: {name: string; elapsedMs: number}[];
}

/** Today's top times, fetched once per mount. A network hiccup just leaves
 * the panel empty rather than blocking anything else in the win screen. */
export function LeaderboardPanel({date}: {date: string}) {
    const [entries, setEntries] = useState<LeaderboardResponse["entries"] | null>(null);

    useEffect(() => {
        let cancelled = false;
        fetch(`/api/leaderboard?date=${date}`)
            .then((r) => (r.ok ? (r.json() as Promise<LeaderboardResponse>) : null))
            .then((d) => {
                if (!cancelled && d) setEntries(d.entries);
            })
            .catch(() => {
                /* offline or the API isn't reachable — leaderboard is a bonus */
            });
        return () => {
            cancelled = true;
        };
    }, [date]);

    if (!entries || entries.length === 0) return null;

    return (
        <div className="w-full rounded-lg bg-[var(--chip)] p-3 text-left text-sm">
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                Today&apos;s fastest
            </p>
            <ol className="space-y-0.5">
                {entries.map((e, i) => (
                    <li key={i} className="flex justify-between tabular-nums">
                        <span className="truncate pr-2">
                            {i + 1}. {e.name}
                        </span>
                        <span>{formatTime(e.elapsedMs)}</span>
                    </li>
                ))}
            </ol>
        </div>
    );
}
