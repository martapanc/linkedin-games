"use client";

import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import Board from "./Board";
import {
    DEFAULT_SIZE,
    DIFFICULTIES,
    DIFFICULTY_LABEL,
    TIER_NAMES,
    attackedCells,
    dailyPuzzle,
    dailySeed,
    findConflicts,
    getHint,
    isSolved,
    practicePuzzle,
    type Difficulty,
    type Hint,
    type Mark,
    type Puzzle,
} from "@/lib/queens";
import {
    formatTime,
    fingerprint,
    loadProgress,
    loadStats,
    recordWin,
    saveProgress,
    type Stats,
} from "@/lib/storage";

type Mode = "daily" | "practice";

export default function QueensGame() {
    const [mode, setMode] = useState<Mode>("daily");
    // Only the practice selector — the daily's rating comes from the puzzle.
    const [difficulty, setDifficulty] = useState<Difficulty>("medium");
    const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
    const [marks, setMarks] = useState<Mark[]>([]);
    const [history, setHistory] = useState<Mark[][]>([]);
    const [elapsed, setElapsed] = useState(0);
    const [hint, setHint] = useState<Hint | null>(null);
    const [autoCross, setAutoCross] = useState(true);
    const [stats, setStats] = useState<Stats | null>(null);
    const [busy, setBusy] = useState(true);

    const today = useMemo(() => dailySeed(), []);

    // The authoritative copy of the board. A drag fires many events between
    // renders, so handlers read and write this rather than the props/state copy.
    const marksRef = useRef<Mark[]>([]);
    const elapsedRef = useRef(0);
    const recordedRef = useRef<string | null>(null);
    // Read by the pointer handlers for the same reason as `marksRef` — and so the
    // handlers keep a stable identity instead of re-registering on every hint.
    const hintRef = useRef<Hint | null>(null);

    const setBoard = useCallback((next: Mark[]) => {
        marksRef.current = next;
        setMarks(next);
    }, []);

    const setActiveHint = useCallback((h: Hint | null) => {
        hintRef.current = h;
        setHint(h);
    }, []);

    /** The one mark a hint is asking for. Hints never ask you to clear a cell. */
    const wantedMark = (h: Hint): Mark => (h.action === "place" ? 2 : 1);

    // --- puzzle loading -------------------------------------------------------
    const install = useCallback(
        (p: Puzzle, restore = true) => {
            const saved = restore ? loadProgress(p) : null;
            const start = saved?.marks ?? new Array<Mark>(p.n * p.n).fill(0);
            setPuzzle(p);
            setBoard(start);
            elapsedRef.current = saved?.elapsed ?? 0;
            setElapsed(elapsedRef.current);
            recordedRef.current = saved?.won ? p.seed : null;
            setHistory([]);
            setActiveHint(null);
            setBusy(false);
        },
        [setBoard, setActiveHint],
    );

    useEffect(() => {
        // Deferred so the "generating" state can paint, and so the localStorage
        // reads stay out of the server-rendered pass.
        const id = setTimeout(() => {
            setStats(loadStats());
            install(
                mode === "daily"
                    ? dailyPuzzle()
                    : practicePuzzle(difficulty, DEFAULT_SIZE[difficulty]),
                mode === "daily",
            );
        }, 16);
        return () => clearTimeout(id);
        // In daily mode the practice selector must not trigger a regeneration.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode, mode === "practice" ? difficulty : null, install]);

    // --- derived --------------------------------------------------------------
    const conflicts = useMemo(
        () => (puzzle ? findConflicts(puzzle, marks) : new Set<number>()),
        [puzzle, marks],
    );
    // Derived, never stored. Pulling a queen off the board therefore removes
    // exactly its own crosses — ones another queen still justifies stay, and
    // crosses you placed by hand are untouched.
    const attacked = useMemo(
        () => (puzzle && autoCross ? attackedCells(puzzle, marks) : new Set<number>()),
        [puzzle, marks, autoCross],
    );
    const queensPlaced = marks.filter((m) => m === 2).length;
    const hintEvidence = useMemo(() => new Set(hint?.evidence ?? []), [hint]);
    const hintTargets = useMemo(() => new Set(hint?.targets ?? []), [hint]);
    // How much of the hint is still outstanding — the whole point of holding the
    // lock is that this number is visible instead of remembered.
    const hintLeft = useMemo(
        () => (hint ? hint.targets.filter((t) => marks[t] !== wantedMark(hint)).length : 0),
        [hint, marks],
    );
    // A finished board is fully described by its marks — no separate win flag.
    const won = useMemo(
        () => (puzzle && !busy ? isSolved(puzzle, marks) : false),
        [puzzle, marks, busy],
    );

    // --- timer ----------------------------------------------------------------
    const running = !!puzzle && !won && !busy;
    useEffect(() => {
        if (!running) return;
        const id = setInterval(() => {
            elapsedRef.current += 1000;
            setElapsed(elapsedRef.current);
        }, 1000);
        return () => clearInterval(id);
    }, [running]);

    // --- persistence ----------------------------------------------------------
    useEffect(() => {
        if (!puzzle || busy) return;
        saveProgress(puzzle.seed, {marks, elapsed, won, fp: fingerprint(puzzle)});
    }, [puzzle, marks, elapsed, won, busy]);

    // --- actions --------------------------------------------------------------
    // Recording the win belongs in the handler that caused it, not an effect.
    const recordIfWon = useCallback(
        (next: Mark[]) => {
            if (puzzle && recordedRef.current !== puzzle.seed && isSolved(puzzle, next)) {
                recordedRef.current = puzzle.seed;
                setStats(recordWin(puzzle.difficulty, elapsedRef.current, mode === "daily" ? today : null));
            }
        },
        [puzzle, mode, today],
    );

    const tap = useCallback(
        (index: number): Mark => {
            const prev = marksRef.current;
            const active = hintRef.current;

            // While a hint is up the board is locked to that hint's squares. A
            // "cross out these six cells" hint used to vanish on the first tap,
            // leaving the other five to be remembered from a message that was no
            // longer on screen. Dismiss is the way back to free play.
            if (active) {
                if (!active.targets.includes(index)) return prev[index];
                const want = wantedMark(active);
                // Toggle, not cycle: the hint asks for one specific mark, so a
                // mis-tap needs an escape that isn't "some third mark".
                const mark: Mark = prev[index] === want ? 0 : want;
                const next = prev.slice();
                next[index] = mark;

                setHistory((h) => [...h.slice(-200), prev]);
                setBoard(next);
                if (active.targets.every((t) => next[t] === want)) setActiveHint(null);
                recordIfWon(next);
                return mark;
            }

            // A cell already showing an auto cross cycles on from that cross, so a
            // tap on it gives you a queen rather than a redundant manual mark.
            const showing =
                prev[index] === 0 && autoCross && puzzle && attackedCells(puzzle, prev).has(index)
                    ? 1
                    : prev[index];
            const mark = (((showing as number) + 1) % 3) as Mark;
            const next = prev.slice();
            next[index] = mark;

            setHistory((h) => [...h.slice(-200), prev]);
            setBoard(next);
            recordIfWon(next);
            return mark;
        },
        [puzzle, autoCross, setBoard, setActiveHint, recordIfWon],
    );

    // Crosses can never complete a board, so no win check is needed here.
    const strokePushed = useRef(false);
    const paint = useCallback(
        (indices: number[], newStroke: boolean) => {
            if (newStroke) strokePushed.current = false;
            const active = hintRef.current;
            // Sweeping is how you satisfy a long cross hint quickly. A "place"
            // hint has a single target, so there is nothing to sweep.
            if (active && active.action === "place") return;
            const allowed = active ? new Set(active.targets) : null;

            const prev = marksRef.current;
            let next: Mark[] | null = null;
            for (const i of indices) {
                if (allowed && !allowed.has(i)) continue;
                if (prev[i] === 0) {
                    next = next ?? prev.slice();
                    next[i] = 1;
                }
            }
            if (!next) return;
            // One undo entry per sweep, opened at its first real change — a stroke
            // that starts over already-marked cells must still be undoable.
            if (!strokePushed.current) {
                setHistory((h) => [...h.slice(-200), prev]);
                strokePushed.current = true;
            }
            setBoard(next);
            if (active && active.targets.every((t) => next![t] === 1)) setActiveHint(null);
        },
        [setBoard, setActiveHint],
    );

    // Undo and Clear step outside what the hint is asking for, so they release
    // the lock rather than leaving it pointing at a board that moved.
    const undo = () => {
        if (!history.length) return;
        setActiveHint(null);
        setBoard(history[history.length - 1]);
        setHistory(history.slice(0, -1));
    };

    const clear = () => {
        if (!puzzle) return;
        setActiveHint(null);
        setHistory((h) => [...h.slice(-200), marksRef.current]);
        setBoard(new Array<Mark>(puzzle.n * puzzle.n).fill(0));
    };

    const askHint = () => {
        if (puzzle) setActiveHint(getHint(puzzle, marks));
    };

    const changeMode = (m: Mode) => {
        if (m === mode) return;
        setBusy(true);
        setMode(m);
    };

    const changeDifficulty = (d: Difficulty) => {
        if (d === difficulty && mode === "practice") return;
        setBusy(true);
        setDifficulty(d);
    };

    const newPractice = () => {
        setBusy(true);
        setTimeout(
            () => install(practicePuzzle(difficulty, DEFAULT_SIZE[difficulty]), false),
            16,
        );
    };

    // --- render ---------------------------------------------------------------
    return (
        <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 px-4 py-5">
            <header className="flex items-center justify-between">
                <h1 className="text-2xl font-bold tracking-tight">
                    Queens
                    <span className="ml-2 align-middle text-xs font-medium text-[var(--muted)]">
            unlimited
          </span>
                </h1>
                {stats && stats.streak > 0 && (
                    <span className="rounded-full bg-[var(--chip)] px-3 py-1 text-sm font-semibold">
            🔥 {stats.streak}
          </span>
                )}
            </header>

            <div className="flex rounded-lg bg-[var(--chip)] p-1 text-sm font-medium">
                {(["daily", "practice"] as Mode[]).map((m) => (
                    <button
                        key={m}
                        onClick={() => changeMode(m)}
                        className={`flex-1 rounded-md px-3 py-1.5 capitalize transition ${
                            mode === m ? "bg-[var(--surface)] shadow-sm" : "text-[var(--muted)]"
                        }`}
                    >
                        {m}
                    </button>
                ))}
            </div>

            {mode === "practice" && (
                <div className="flex flex-wrap gap-1.5">
                    {DIFFICULTIES.map((d) => (
                        <button
                            key={d}
                            onClick={() => changeDifficulty(d)}
                            className={`rounded-full px-3 py-1 text-sm font-medium transition ${
                                difficulty === d
                                    ? "bg-[var(--accent)] text-white"
                                    : "bg-[var(--chip)] text-[var(--muted)]"
                            }`}
                        >
                            {DIFFICULTY_LABEL[d]}
                        </button>
                    ))}
                </div>
            )}

            <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
          <span className="font-semibold">
            {puzzle ? `${puzzle.n}×${puzzle.n}` : "—"}
          </span>
                    <span
                        className="rounded-full bg-[var(--chip)] px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide">
            {DIFFICULTY_LABEL[puzzle?.difficulty ?? difficulty]}
          </span>
                    {mode === "daily" && (
                        <span className="text-xs text-[var(--muted)]">{today}</span>
                    )}
                </div>
                <div className="flex items-center gap-3">
          <span className="text-[var(--muted)]">
            {queensPlaced}/{puzzle?.n ?? 0} 👑
          </span>
                    <span className="tabular-nums font-semibold">{formatTime(elapsed)}</span>
                </div>
            </div>

            {busy || !puzzle ? (
                <div className="flex aspect-square w-full items-center justify-center rounded-lg bg-[var(--chip)]">
          <span className="animate-pulse text-sm text-[var(--muted)]">
            Generating a board…
          </span>
                </div>
            ) : (
                <div className="relative">
                    <Board
                        puzzle={puzzle}
                        marks={marks}
                        conflicts={conflicts}
                        attacked={attacked}
                        hintEvidence={hintEvidence}
                        hintTargets={hintTargets}
                        hintAction={hint?.action ?? null}
                        hintLock={!!hint}
                        autoCross={autoCross}
                        disabled={won}
                        onTap={tap}
                        onPaint={paint}
                    />
                    {won && (
                        <div
                            className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-lg bg-[var(--surface)]/85 backdrop-blur-[2px]">
                            <span className="text-4xl">👑</span>
                            <p className="text-xl font-bold">Solved in {formatTime(elapsed)}</p>
                            <p className="text-sm text-[var(--muted)]">
                                {DIFFICULTY_LABEL[puzzle.difficulty]} · needed{" "}
                                {TIER_NAMES[puzzle.tier].toLowerCase()} logic
                            </p>
                            <button
                                onClick={mode === "practice" ? newPractice : () => changeMode("practice")}
                                className="mt-2 rounded-lg bg-[var(--accent)] px-5 py-2 font-semibold text-white"
                            >
                                {mode === "practice" ? "Next puzzle" : "Keep playing"}
                            </button>
                        </div>
                    )}
                </div>
            )}

            {hint && (
                <div className="rounded-lg bg-sky-500/10 px-3 py-2.5 text-sm">
                    <div className="flex items-start gap-2">
                        <p className="flex-1">
              <span
                  className="mr-2 rounded bg-sky-600 px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-white">
                {hint.title}
              </span>
                            <span className="text-sky-800 dark:text-sky-200">{hint.text}</span>
                        </p>
                        <button
                            onClick={() => setActiveHint(null)}
                            className="shrink-0 rounded-md bg-sky-600/15 px-2 py-1 text-xs font-semibold text-sky-800 dark:text-sky-200"
                        >
                            Dismiss
                        </button>
                    </div>
                    <p className="mt-1.5 text-xs text-sky-700/80 dark:text-sky-300/80">
                        {hintLeft > 0
                            ? `${hintLeft} ${hint.action === "place" ? "queen" : "✕"}${
                                hintLeft > 1 ? "s" : ""
                            } left — the rest of the board is locked until you place ${
                                hintLeft > 1 ? "them" : "it"
                            }, or dismiss.`
                            : "Done — unlocking."}
                    </p>
                </div>
            )}

            <div className="grid grid-cols-4 gap-2 text-sm font-medium">
                <button
                    onClick={undo}
                    disabled={!history.length || won}
                    className="rounded-lg bg-[var(--chip)] py-2.5 disabled:opacity-40"
                >
                    Undo
                </button>
                <button
                    onClick={clear}
                    disabled={won}
                    className="rounded-lg bg-[var(--chip)] py-2.5 disabled:opacity-40"
                >
                    Clear
                </button>
                <button
                    onClick={askHint}
                    disabled={won}
                    className="rounded-lg bg-[var(--chip)] py-2.5 disabled:opacity-40"
                >
                    Hint
                </button>
                <button
                    onClick={newPractice}
                    disabled={mode === "daily"}
                    className="rounded-lg bg-[var(--chip)] py-2.5 disabled:opacity-40"
                >
                    New
                </button>
            </div>

            <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
                <input
                    type="checkbox"
                    checked={autoCross}
                    onChange={(e) => setAutoCross(e.target.checked)}
                    className="h-4 w-4 accent-[var(--accent)]"
                />
                Auto-mark ✕ on cells your queens rule out
            </label>

            <details className="text-sm text-[var(--muted)]">
                <summary className="cursor-pointer font-medium">How it works</summary>
                <div className="mt-2 space-y-2 leading-relaxed">
                    <p>
                        One queen per row, per column and per colour — and no two queens may
                        touch, not even diagonally. Tap a cell to cycle empty → ✕ → 👑, or
                        drag to sweep ✕ across a run of cells. Placing a queen crosses out
                        its row, column, colour and touching cells for you; removing it puts
                        them back, keeping any ✕ you placed yourself or that another queen
                        still rules out.
                    </p>
                    <p>
                        Boards are built backwards: a random valid solution first, then colour
                        regions grown around it, then reshaped until that solution is the only
                        one. Difficulty is measured, not assumed — a logical solver replays
                        each board and the rating is the hardest technique it was forced to
                        use.
                    </p>
                    {puzzle && (
                        <p className="font-mono text-xs">
                            seed {puzzle.seed} · tier {puzzle.tier} ({TIER_NAMES[puzzle.tier]}) ·
                            effort {(puzzle.score / puzzle.n).toFixed(1)}
                        </p>
                    )}
                </div>
            </details>
        </main>
    );
}
