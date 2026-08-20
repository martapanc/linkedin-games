"use client";

import {MOON, SUN, type Cell, type Puzzle} from "@/lib/tango";

/** Rays at 45° steps, all the same length — the shape has to read at 20px. */
function Sun({className, style}: {className?: string; style?: React.CSSProperties}) {
    return (
        <svg viewBox="0 0 24 24" className={className} style={style} aria-hidden="true">
            <circle cx="12" cy="12" r="5.2" fill="currentColor"/>
            <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M12 1.6v3M12 19.4v3M1.6 12h3M19.4 12h3"/>
                <path d="M4.7 4.7l2.1 2.1M17.2 17.2l2.1 2.1M19.3 4.7l-2.1 2.1M6.8 17.2l-2.1 2.1"/>
            </g>
        </svg>
    );
}

/**
 * One filled path rather than a disc with a bite taken out of it: a two-circle
 * mask needs a background colour to punch through, and the cell behind this one
 * changes with the wash, the hint dimming and the conflict flash.
 */
function Moon({className, style}: {className?: string; style?: React.CSSProperties}) {
    return (
        <svg viewBox="0 0 24 24" className={className} style={style} aria-hidden="true">
            <path
                fill="currentColor"
                d="M20.2 15.1A8.6 8.6 0 0 1 8.9 3.8a8.6 8.6 0 1 0 11.3 11.3Z"
            />
        </svg>
    );
}

interface BoardProps {
    puzzle: Puzzle;
    cells: Cell[];
    /** Squares breaking a rule right now. */
    conflicts: Set<number>;
    /** Indices into `puzzle.links` of signs the board currently contradicts. */
    broken: Set<number>;
    /** Solved — send a wave of pops across the board. */
    celebrate?: boolean;
    disabled?: boolean;
    /** Cycles the square empty → sun → moon → empty. */
    onTap: (index: number) => void;
}

const LABEL: Record<Cell, string> = {0: "empty", [SUN]: "sun", [MOON]: "moon"};

export default function Board({
    puzzle,
    cells,
    conflicts,
    broken,
    celebrate,
    disabled,
    onTap,
}: BoardProps) {
    const {n, givens, links} = puzzle;

    return (
        <div className="relative">
            {/*
              The 2px gaps are the grid lines: the container's background shows
              through them. Real borders would need mitring where a thick line
              meets a thin one, and there is no such meeting here — every line on
              a Tango board is the same weight.
            */}
            <div
                className="grid touch-none select-none overflow-hidden rounded-lg"
                style={{
                    gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`,
                    gap: 2,
                    padding: 3,
                    background: "var(--edge-strong)",
                }}
                role="grid"
                aria-label={`Tango board, ${n} by ${n}`}
            >
                {cells.map((cell, i) => {
                    const r = (i / n) | 0;
                    const c = i % n;
                    const given = givens[i] !== 0;
                    const bad = conflicts.has(i);
                    const wash =
                        cell === SUN
                            ? "var(--sun-wash)"
                            : cell === MOON
                              ? "var(--moon-wash)"
                              : given
                                ? "var(--cell-given)"
                                : "var(--cell)";

                    return (
                        <button
                            key={i}
                            type="button"
                            role="gridcell"
                            // A given is part of the puzzle, not a move you made, so it
                            // says so rather than just refusing to respond.
                            aria-label={`Row ${r + 1}, column ${c + 1}, ${LABEL[cell]}${
                                given ? ", fixed" : ""
                            }`}
                            aria-disabled={given || undefined}
                            disabled={disabled || given}
                            onClick={() => onTap(i)}
                            className={`relative flex aspect-square items-center justify-center ${
                                given && !disabled ? "cursor-default" : ""
                            }`}
                            style={{backgroundColor: wash}}
                        >
                            {cell === SUN && (
                                <Sun
                                    className={`h-[54%] w-[54%] ${
                                        bad ? "text-red-600" : "text-[var(--sun-ink)]"
                                    } ${celebrate ? "cell-pop" : ""}`}
                                    // Delay by the anti-diagonal, so the pop sweeps
                                    // across the board instead of firing at once.
                                    style={celebrate ? {animationDelay: `${(r + c) * 30}ms`} : undefined}
                                />
                            )}
                            {cell === MOON && (
                                <Moon
                                    className={`h-[50%] w-[50%] ${
                                        bad ? "text-red-600" : "text-[var(--moon-ink)]"
                                    } ${celebrate ? "cell-pop" : ""}`}
                                    style={celebrate ? {animationDelay: `${(r + c) * 30}ms`} : undefined}
                                />
                            )}
                            {bad && (
                                <span className="pointer-events-none absolute inset-0 bg-red-500/25"/>
                            )}
                            {/* A given is dimmed at its corner rather than washed over,
                                so the symbol colour still carries the counting. */}
                            {given && (
                                <span
                                    className="pointer-events-none absolute left-0 top-0 border-[6px] border-transparent border-l-black/25 border-t-black/25"
                                />
                            )}
                        </button>
                    );
                })}
            </div>

            {/*
              Signs live in their own layer above the grid, placed by fraction of
              the board rather than inserted between cells — a sign belongs to the
              *edge*, and an edge is exactly where two cells stop and the gap
              between them begins.
            */}
            <div className="pointer-events-none absolute inset-0">
                {links.map((l, k) => {
                    const horizontal = l.b === l.a + 1;
                    const r = (l.a / n) | 0;
                    const c = l.a % n;
                    const x = horizontal ? c + 1 : c + 0.5;
                    const y = horizontal ? r + 0.5 : r + 1;
                    const wrong = broken.has(k);

                    return (
                        <span
                            key={k}
                            aria-hidden="true"
                            // A ring, not just a fill: the disc sits over cells that
                            // may be washed sun-amber, moon-indigo, given-grey or
                            // conflict-red, and only an outline holds its shape
                            // against all four.
                            className={`absolute flex items-center justify-center rounded-full text-center leading-none ${
                                wrong ? "text-white" : "text-[var(--sign)]"
                            }`}
                            style={{
                                left: `${(x / n) * 100}%`,
                                top: `${(y / n) * 100}%`,
                                width: `${(1 / n) * 48}%`,
                                height: `${(1 / n) * 48}%`,
                                transform: "translate(-50%, -50%)",
                                background: wrong ? "#dc2626" : "var(--surface)",
                                boxShadow: `0 0 0 1.5px ${wrong ? "#dc2626" : "var(--edge-strong)"}`,
                                fontWeight: 800,
                                fontSize: `clamp(11px, ${(1 / n) * 30}vw, 19px)`,
                            }}
                        >
                            {l.same ? "=" : "×"}
                        </span>
                    );
                })}
            </div>
        </div>
    );
}
