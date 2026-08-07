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

/**
 * Every x is mirrored about 12 — outer points 3.4/20.6, valleys 8.15/15.85,
 * base 4.8/19.2, bar and dot centred — so the shape balances on its own axis.
 * The previous one was built from arcs that didn't mirror, which is what made
 * it look like it was leaning.
 */
function Crown({className}: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
            <circle cx="12" cy="3.8" r="1.35" fill="currentColor"/>
            <path
                fill="currentColor"
                d="M3.4 7.6 8.15 12.3 12 6.3 15.85 12.3 20.6 7.6 19.2 17.8 4.8 17.8Z"
            />
            <rect x="4" y="19.2" width="16" height="2.3" rx="1.15" fill="currentColor"/>
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
    /** While set, only `hintTargets` accept input — everything else is inert. */
    hintLock: boolean;
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
                                  hintLock,
                                  autoCross,
                                  disabled,
                                  onTap,
                                  onPaint,
                              }: BoardProps) {
    const {n, regions} = puzzle;
    // The lock is enforced in the parent too — this keeps the pointer plumbing
    // from starting sweeps that would be discarded cell by cell anyway.
    const locked = useCallback(
        (i: number) => disabled || (hintLock && !hintTargets.has(i)),
        [disabled, hintLock, hintTargets],
    );
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
            if (locked(i)) return;
            e.preventDefault();
            // Touch implicitly captures the pointer to this button, which would stop
            // every other cell from ever seeing pointerenter. Hand it back.
            e.currentTarget.releasePointerCapture?.(e.pointerId);

            pending.current = i;
            lastCell.current = i;
            painting.current = false;
        },
        [locked],
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
                // Only the last row/column draw their far edge; every other one is
                // the next cell's near edge, so each line has exactly one owner.
                const topW = topStrong ? 3 : 1;
                const leftW = leftStrong ? 3 : 1;
                const rightW = c === n - 1 ? 3 : 0;
                const bottomW = r === n - 1 ? 3 : 0;

                // Four edges meet at this cell's top-left vertex: our own top and
                // left, plus the two on the far side of it, which belong to the
                // cells above and to the left. Our spans stop at our own bounds, so
                // when a boundary *turns* through this vertex — dark down the right
                // and along the bottom of the cell up-left of us — both spans stop
                // short and leave a 3px notch in the elbow. Nobody owns that square
                // but us. Overhanging the spans instead would not work: cells are
                // isolated stacking contexts with opaque backgrounds, so anything
                // spilling into a later sibling is painted over by it.
                const cornerStrong =
                    r > 0 &&
                    c > 0 &&
                    (regions[r - 1][c - 1] !== regions[r - 1][c] ||
                        regions[r - 1][c - 1] !== regions[r][c - 1]);
                const needsCorner = !topStrong && !leftStrong && cornerStrong;

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
                        // Not the `disabled` attribute: a disabled button fires no
                        // pointer events, and a sweep across the hint's cells has to
                        // survive crossing the locked ones in between.
                        aria-disabled={locked(i) || undefined}
                        onPointerDown={(e) => handleDown(e, i)}
                        onPointerEnter={() => handleEnter(i)}
                        // `isolate` is load-bearing: `relative` alone leaves z-index
                        // auto, which is not a stacking context, so the edge spans'
                        // z-indices below would escape the cell and paint over the
                        // win overlay. This keeps them scoped to their own cell.
                        className={`relative isolate flex aspect-square items-center justify-center ${
                            locked(i) && !disabled ? "cursor-not-allowed" : ""
                        }`}
                        style={{backgroundColor: REGION_COLORS[g % REGION_COLORS.length]}}
                    >
                        {(mark === 1 || auto) && (
                            <XMark className="h-[27%] w-[27%] text-black/55"/>
                        )}
                        {mark === 2 && (
                            <Crown
                                className={`h-[50%] w-[50%] drop-shadow-sm ${
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

                        {/*
                          Grid lines are overlay spans rather than CSS borders. A 3px
                          border mitres diagonally into the 1px border beside it, which
                          notches a visible gap out of every crossing — the region
                          outlines came out looking dashed. Spans just butt together,
                          and the strong ones sit a layer above so a weak line can
                          never cut through one. Drawn after the washes so a dimmed
                          cell keeps its outline at full strength.
                        */}
                        <span
                            className="pointer-events-none absolute inset-x-0 top-0"
                            style={{
                                height: topW,
                                background: topStrong ? strong : weak,
                                zIndex: topStrong ? 2 : 1,
                            }}
                        />
                        <span
                            className="pointer-events-none absolute inset-y-0 left-0"
                            style={{
                                width: leftW,
                                background: leftStrong ? strong : weak,
                                zIndex: leftStrong ? 2 : 1,
                            }}
                        />
                        {rightW > 0 && (
                            <span
                                className="pointer-events-none absolute inset-y-0 right-0"
                                style={{width: rightW, background: strong, zIndex: 2}}
                            />
                        )}
                        {bottomW > 0 && (
                            <span
                                className="pointer-events-none absolute inset-x-0 bottom-0"
                                style={{height: bottomW, background: strong, zIndex: 2}}
                            />
                        )}
                        {needsCorner && (
                            <span
                                className="pointer-events-none absolute left-0 top-0"
                                style={{width: 3, height: 3, background: strong, zIndex: 2}}
                            />
                        )}

                        {isTarget && (
                            <>
                                {/* Inset by this cell's own lines so the ring sits inside
                                    them, the way it did when they were real borders. */}
                                <span
                                    className="pointer-events-none absolute ring-[3px] ring-inset ring-sky-600"
                                    style={{
                                        top: topW,
                                        left: leftW,
                                        right: rightW,
                                        bottom: bottomW,
                                        zIndex: 3,
                                    }}
                                />
                                {mark === 0 &&
                                    (hintAction === "place" ? (
                                        <Crown
                                            className="pointer-events-none absolute z-[3] h-[50%] w-[50%] animate-pulse text-sky-700/55"/>
                                    ) : (
                                        <XMark
                                            className="pointer-events-none absolute z-[3] h-[36%] w-[36%] animate-pulse text-sky-700/60"/>
                                    ))}
                            </>
                        )}
                    </button>
                );
            })}
        </div>
    );
}
