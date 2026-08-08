"use client";

import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import Board from "./Board";
import {RulesBody, RulesDialog} from "./Rules";
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
    hasSeenRules,
    loadStats,
    markRulesSeen,
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
    // Starts closed so the prerendered pass and the first hydration agree; the
    // deferred effect below is what may open it.
    const [showRules, setShowRules] = useState(false);
    const [busy, setBusy] = useState(true);

    const today = useMemo(() => dailySeed(), []);

    // The authoritative copy of the board. A drag fires many events between
    // renders, so handlers read and write this rather than the props/state copy.
    const marksRef = useRef<Mark[]>([]);
    /**
     * Elapsed time is counted from the clock, not by counting ticks: `elapsedRef`
     * banks the time from finished run segments and `segmentAt` is when the
     * current one started, or null while stopped. Adding 1000 per interval was
     * already drifting — background tabs get throttled to a crawl and a long
     * synchronous board generation swallows ticks outright — and pausing an
     * inaccurate counter would only have hidden that better.
     */
    const elapsedRef = useRef(0);
    const segmentAt = useRef<number | null>(null);
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

    /**
     * The one mark a hint is asking for, or null when it isn't asking for one.
     * Mistake hints carry `action: null` — they point at a square you got wrong
     * without prescribing what belongs there, so they must not be folded into
     * "cross" the way a `place ? 2 : 1` ternary would.
     */
    const wantedMark = (h: Hint): Mark | null =>
        h.action === "place" ? 2 : h.action === "cross" ? 1 : null;

    // --- puzzle loading -------------------------------------------------------
    const install = useCallback(
        (p: Puzzle, restore = true) => {
            const saved = restore ? loadProgress(p) : null;
            const start = saved?.marks ?? new Array<Mark>(p.n * p.n).fill(0);
            setPuzzle(p);
            setBoard(start);
            // Clear the in-flight segment too, or the new board inherits the time
            // since the old one's last tick.
            segmentAt.current = null;
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
            if (!hasSeenRules()) setShowRules(true);
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
    // lock is that this number is visible instead of remembered. A hint that
    // prescribes no mark has nothing to count.
    const hintLeft = useMemo(() => {
        if (!hint) return 0;
        const want = wantedMark(hint);
        return want === null ? 0 : hint.targets.filter((t) => marks[t] !== want).length;
    }, [hint, marks]);
    // A hint with no targets (the "All set" case) must not lock anything, or the
    // board would freeze with nothing that could possibly release it.
    const hintLock = !!hint && hint.targets.length > 0;
    // A finished board is fully described by its marks — no separate win flag.
    const won = useMemo(
        () => (puzzle && !busy ? isSolved(puzzle, marks) : false),
        [puzzle, marks, busy],
    );

    // --- timer ----------------------------------------------------------------
    // Switch tabs and the clock stops. `visibilitychange` rather than window
    // blur: it is the signal that fires for a tab switch and for a phone being
    // locked or backgrounded, and it will not stop the clock while the board is
    // still on screen — which blur does the moment you click the address bar.
    const [hidden, setHidden] = useState(false);
    useEffect(() => {
        const sync = () => setHidden(document.hidden);
        sync();
        document.addEventListener("visibilitychange", sync);
        return () => document.removeEventListener("visibilitychange", sync);
    }, []);

    const running = !!puzzle && !won && !busy && !hidden && !showRules;

    const readElapsed = useCallback(
        () =>
            elapsedRef.current +
            (segmentAt.current === null ? 0 : Date.now() - segmentAt.current),
        [],
    );

    useEffect(() => {
        if (!running) return;
        segmentAt.current = Date.now();
        const id = setInterval(() => setElapsed(readElapsed()), 500);
        return () => {
            clearInterval(id);
            // Bank the part-second on the way out, so a pause loses nothing and
            // resuming does not double-count what was already banked.
            elapsedRef.current = readElapsed();
            segmentAt.current = null;
            setElapsed(elapsedRef.current);
        };
    }, [running, readElapsed]);

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
                // Read the clock, not the last tick — the winning tap lands
                // somewhere inside the current interval.
                setStats(recordWin(puzzle.difficulty, readElapsed(), mode === "daily" ? today : null));
            }
        },
        [puzzle, mode, today, readElapsed],
    );

    /** empty → ✕ → 👑, the plain cycle a tap does when no hint is steering it. */
    const cycled = useCallback(
        (prev: Mark[], index: number): Mark => {
            // A cell already showing an auto cross cycles on from that cross, so a
            // tap on it gives you a queen rather than a redundant manual mark.
            const showing =
                prev[index] === 0 && autoCross && puzzle && attackedCells(puzzle, prev).has(index)
                    ? 1
                    : prev[index];
            return (((showing as number) + 1) % 3) as Mark;
        },
        [puzzle, autoCross],
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

                if (want === null) {
                    // A mistake hint prescribes nothing — it points at a square you
                    // got wrong. So the cell cycles normally, which is also the fix:
                    // ✕ → 👑 on a square that does hold a queen. Treating this as a
                    // "cross" hint made the tap wipe the ✕ back to empty and then
                    // pulse a ghost ✕ over it, advising the very mark it faulted.
                    const cycledNext = prev.slice();
                    cycledNext[index] = cycled(prev, index);
                    setHistory((h) => [...h.slice(-200), prev]);
                    setBoard(cycledNext);
                    // The diagnosis no longer describes the board — drop it.
                    setActiveHint(null);
                    recordIfWon(cycledNext);
                    return cycledNext[index];
                }

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

            const next = prev.slice();
            next[index] = cycled(prev, index);

            setHistory((h) => [...h.slice(-200), prev]);
            setBoard(next);
            recordIfWon(next);
            return next[index];
        },
        [cycled, setBoard, setActiveHint, recordIfWon],
    );

    // Crosses can never complete a board, so no win check is needed here.
    const strokePushed = useRef(false);
    const paint = useCallback(
        (indices: number[], newStroke: boolean) => {
            if (newStroke) strokePushed.current = false;
            const active = hintRef.current;
            // Sweeping is how you satisfy a long cross hint quickly. "place" and
            // mistake hints have a single target and nothing to sweep across.
            if (active && active.action !== "cross") return;
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

    const dismissRules = useCallback(() => {
        setShowRules(false);
        markRulesSeen();
    }, []);

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
                        hintLock={hintLock}
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
                        {hint.action === null
                            ? hintLock
                                ? "Change that square to carry on, or dismiss."
                                : "Nothing to do here."
                            : hintLeft > 0
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
                <summary className="cursor-pointer font-medium">Rules</summary>
                <div className="mt-2">
                    <RulesBody/>
                </div>
            </details>

            {/* Diagnostics, not prose — kept out of the rules it used to sit inside. */}
            {puzzle && (
                <p className="font-mono text-xs text-[var(--muted)]">
                    seed {puzzle.seed} · tier {puzzle.tier} ({TIER_NAMES[puzzle.tier]}) ·
                    effort {(puzzle.score / puzzle.n).toFixed(1)}
                </p>
            )}

            {showRules && <RulesDialog onClose={dismissRules}/>}
        </main>
    );
}
