"use client";

import {useCallback, useEffect, useRef} from "react";
import {REGION_COLORS, type Mark, type Puzzle} from "@/lib/queens";

function XMark({className}: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
            <path
                d="M5 5 L19 19 M19 5 L5 19"
                fill="none"
                stroke="currentColor"
                strokeWidth="4.5"
                strokeLinecap="round"
            />
        </svg>
    );
}

function Crown({className}: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
            <path
                fill="currentColor"
                d="M3 8.5a1.3 1.3 0 1 1 1.9 1.14l1.4 3.4 3.3-3.06a1.3 1.3 0 1 1 2.8 0l3.3 3.06 1.4-3.4A1.3 1.3 0 1 1 21 8.5c0 .5-.28.93-.7 1.15l-1.5 7.1a1 1 0 0 1-.98.79H6.18a1 1 0 0 1-.98-.79l-1.5-7.1A1.3 1.3 0 0 1 3 8.5Z"
            />
            <rect x="5.2" y="18.4" width="13.6" height="2.1" rx="1" fill="currentColor"/>
        </svg>
    );
}

interface BoardProps {
    puzzle: Puzzle;
    marks: Mark[];
    conflicts: Set<number>;
    attacked: Set<number>;
    /** Squares backing the current hint's argument. */
    hintEvidence: Set<number>;
    /** Squares the current hint resolves. */
    hintTargets: Set<number>;
    /** What the hint says to do with its targets. */
    hintAction: "place" | "cross" | null;
    /** Crosses derived from the placed queens, rendered but never stored. */
    autoCross: boolean;
    disabled?: boolean;
    /** Cycles the cell and reports the mark it landed on. */
    onTap: (index: number) => Mark;
    /** Crosses out every listed cell that is currently empty. */
    onPaint: (indices: number[], newStroke: boolean) => void;
}

/** Every cell between two points, so a fast swipe doesn't skip any. */
function lineBetween(n: number, from: number, to: number): number[] {
    const r0 = (from / n) | 0;
    const c0 = from % n;
    const r1 = (to / n) | 0;
    const c1 = to % n;
    const steps = Math.max(Math.abs(r1 - r0), Math.abs(c1 - c0));
    const out: number[] = [];
    for (let s = 1; s <= steps; s++) {
        const r = Math.round(r0 + ((r1 - r0) * s) / steps);
        const c = Math.round(c0 + ((c1 - c0) * s) / steps);
        out.push(r * n + c);
    }
    return out;
}

export default function Board({
                                  puzzle,
                                  marks,
                                  conflicts,
                                  attacked,
                                  hintEvidence,
                                  hintTargets,
                                  hintAction,
                                  autoCross,
                                  disabled,
                                  onTap,
                                  onPaint,
                              }: BoardProps) {
    const {n, regions} = puzzle;
    // Dragging paints crosses across empty cells, like the original. All mark
    // logic lives in the parent, which holds the authoritative, always-fresh
    // state — a drag fires many events between renders, so props go stale.
    //
    // A press is not resolved on pointerdown, because at that moment a tap and
    // the start of a drag are indistinguishable. Committing the cycle early meant
    // beginning a sweep on an existing ✕ turned it into a queen. So the press is
    // held pending: leaving the origin cell makes it a drag, releasing without
    // leaving makes it a tap.
    const pending = useRef<number | null>(null);
    const painting = useRef(false);
    const lastCell = useRef<number | null>(null);

    useEffect(() => {
        const end = (commit: boolean) => {
            if (commit && pending.current !== null) onTap(pending.current);
            pending.current = null;
            painting.current = false;
            lastCell.current = null;
        };
        const up = () => end(true);
        const cancel = () => end(false);
        window.addEventListener("pointerup", up);
        window.addEventListener("pointercancel", cancel);
        return () => {
            window.removeEventListener("pointerup", up);
            window.removeEventListener("pointercancel", cancel);
        };
    }, [onTap]);

    const handleDown = useCallback(
        (e: React.PointerEvent<HTMLButtonElement>, i: number) => {
            if (disabled) return;
            e.preventDefault();
            // Touch implicitly captures the pointer to this button, which would stop
            // every other cell from ever seeing pointerenter. Hand it back.
            e.currentTarget.releasePointerCapture?.(e.pointerId);

            pending.current = i;
            lastCell.current = i;
            painting.current = false;
        },
        [disabled],
    );

    const handleEnter = useCallback(
        (i: number) => {
            const from = lastCell.current;
            // lastCell is only set while a pointer is down, so this ignores hover.
            if (disabled || from === null || i === from) return;

            const starting = pending.current !== null;
            if (starting) {
                // Left the origin cell — a drag, so the press never cycles.
                painting.current = true;
                pending.current = null;
            }
            if (!painting.current) return;

            lastCell.current = i;
            // `from` is included so the cell the sweep began on gets crossed too.
            onPaint([from, ...lineBetween(n, from, i)], starting);
        },
        [disabled, n, onPaint],
    );

    return (
        <div
            className="board grid touch-none select-none overflow-hidden rounded-lg"
            style={{gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`}}
            role="grid"
            aria-label={`Queens board, ${n} by ${n}`}
        >
            {/*
        One idea instead of two competing decorations: while a hint is showing,
        everything irrelevant is dimmed. Bright = part of the reasoning, ringed
        with a ghost mark = where to act. No legend needed.
      */}
            {Array.from({length: n * n}, (_, i) => {
                const r = (i / n) | 0;
                const c = i % n;
                const g = regions[r][c];
                const mark = marks[i];
                const bad = conflicts.has(i);
                // Auto and manual crosses render identically: a two-tier ✕ just reads
                // as "some of these are hard to see".
                const auto = autoCross && mark === 0 && attacked.has(i);
                const hinting = hintEvidence.size > 0 || hintTargets.size > 0;
                const isTarget = hintTargets.has(i);
                const faded = hinting && !isTarget && !hintEvidence.has(i);

                const strong = "var(--edge-strong)";
                const weak = "var(--edge-weak)";
                const topStrong = r === 0 || regions[r - 1][c] !== g;
                const leftStrong = c === 0 || regions[r][c - 1] !== g;

                return (
                    <button
                        key={i}
                        type="button"
                        role="gridcell"
                        aria-label={`Row ${r + 1}, column ${c + 1}${
                            mark === 2
                                ? ", queen"
                                : mark === 1
                                    ? ", marked"
                                    : auto
                                        ? ", ruled out"
                                        : ""
                        }`}
                        disabled={disabled}
                        onPointerDown={(e) => handleDown(e, i)}
                        onPointerEnter={() => handleEnter(i)}
                        className="relative flex aspect-square items-center justify-center"
                        style={{
                            backgroundColor: REGION_COLORS[g % REGION_COLORS.length],
                            borderTop: `${topStrong ? 3 : 1}px solid ${topStrong ? strong : weak}`,
                            borderLeft: `${leftStrong ? 3 : 1}px solid ${leftStrong ? strong : weak}`,
                            borderRight: c === n - 1 ? `3px solid ${strong}` : undefined,
                            borderBottom: r === n - 1 ? `3px solid ${strong}` : undefined,
                        }}
                    >
                        {(mark === 1 || auto) && (
                            <XMark className="h-[36%] w-[36%] text-black/55"/>
                        )}
                        {mark === 2 && (
                            <Crown
                                className={`h-[62%] w-[62%] drop-shadow-sm ${
                                    bad ? "text-red-600" : "text-neutral-900"
                                }`}
                            />
                        )}
                        {bad && (
                            <span className="pointer-events-none absolute inset-0 bg-red-500/25"/>
                        )}
                        {faded && (
                            <span className="pointer-events-none absolute inset-0 bg-[var(--background)]/70"/>
                        )}
                        {isTarget && (
                            <>
                                <span
                                    className="pointer-events-none absolute inset-0 ring-[3px] ring-inset ring-sky-600"/>
                                {mark === 0 &&
                                    (hintAction === "place" ? (
                                        <Crown
                                            className="pointer-events-none absolute h-[62%] w-[62%] animate-pulse text-sky-700/55"/>
                                    ) : (
                                        <XMark
                                            className="pointer-events-none absolute h-[36%] w-[36%] animate-pulse text-sky-700/60"/>
                                    ))}
                            </>
                        )}
                    </button>
                );
            })}
        </div>
    );
}
