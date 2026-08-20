"use client";

import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {hintCooldownMs} from "@games/core";
import {BestTimesTable, ConfirmDialog} from "@games/core/ui";
import Board from "./Board";
import {RulesBody, RulesDialog} from "./Rules";
import {
    DEFAULT_SIZE,
    DIFFICULTIES,
    DIFFICULTY_LABEL,
    TIER_NAMES,
    brokenLinks,
    dailyPuzzle,
    dailySeed,
    findConflicts,
    getHint,
    isSolved,
    practicePuzzle,
    startingCells,
    type Cell,
    type Difficulty,
    type Hint,
    type Puzzle,
} from "@/lib/tango";
import {
    formatTime,
    fingerprint,
    hasSeenRules,
    loadProgress,
    loadStats,
    markRulesSeen,
    recordWin,
    saveProgress,
    type Stats,
} from "@/lib/storage";

type Mode = "daily" | "practice";

/**
 * Placing a moon is two taps (empty → sun → moon), so the cell spends a frame
 * as a sun on the way there. Real Tango doesn't flag a conflict born from that
 * frame — three-in-a-row briefly forming mid-cycle isn't a mistake, it's the
 * gesture in progress — so the cell you just tapped gets a grace window before
 * it can count against a rule, giving the second tap time to land first.
 */
const CONFLICT_GRACE_MS = 1000;

export default function TangoGame() {
    const [mode, setMode] = useState<Mode>("daily");
    // Only the practice selector — the daily's rating comes from the puzzle.
    const [difficulty, setDifficulty] = useState<Difficulty>("medium");
    const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
    const [cells, setCells] = useState<Cell[]>([]);
    const [history, setHistory] = useState<Cell[][]>([]);
    const [elapsed, setElapsed] = useState(0);
    const [hint, setHint] = useState<Hint | null>(null);
    const [hintsUsed, setHintsUsed] = useState(0);
    // Epoch ms the next hint unlocks at; 0 means "available now".
    const [hintAvailableAt, setHintAvailableAt] = useState(0);
    const [now, setNow] = useState(() => Date.now());
    const [stats, setStats] = useState<Stats | null>(null);
    // Starts closed so the prerendered pass and the first hydration agree; the
    // deferred effect below is what may open it.
    const [showRules, setShowRules] = useState(false);
    const [busy, setBusy] = useState(true);
    // Which destructive action is pending a yes/no, or null for none.
    const [confirmAction, setConfirmAction] = useState<"clear" | "new" | null>(null);

    const today = useMemo(() => dailySeed(), []);

    /**
     * Elapsed time is counted from the clock, not by counting ticks:
     * `elapsedRef` banks the time from finished run segments and `segmentAt` is
     * when the current one started, or null while stopped. Adding 1000 per
     * interval drifts — background tabs get throttled to a crawl, and a long
     * synchronous board generation swallows ticks outright.
     */
    const elapsedRef = useRef(0);
    const segmentAt = useRef<number | null>(null);
    const recordedRef = useRef<string | null>(null);

    /**
     * The authoritative copy of the board. Handlers read and write this rather
     * than the state copy: the previous version folded the history push and the
     * win check into a `setCells` updater, which React is free to run during
     * render — and does run twice in development, double-pushing every move onto
     * the undo stack.
     */
    const cellsRef = useRef<Cell[]>([]);

    const setBoard = useCallback((next: Cell[]) => {
        cellsRef.current = next;
        setCells(next);
    }, []);

    // Read by the tap handler for the same reason as `cellsRef` — and so the
    // handler keeps a stable identity instead of re-registering on every hint.
    const hintRef = useRef<Hint | null>(null);

    const setActiveHint = useCallback((h: Hint | null) => {
        hintRef.current = h;
        setHint(h);
    }, []);

    // The cell mid-cycle, and the timer that will release it — see
    // `CONFLICT_GRACE_MS`. A ref because the timeout callback needs to clear
    // itself without becoming a dependency of every effect that touches it.
    const [settling, setSettling] = useState<number | null>(null);
    const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const releaseSettling = useCallback(() => {
        if (settleTimer.current) clearTimeout(settleTimer.current);
        settleTimer.current = null;
        setSettling(null);
    }, []);

    useEffect(() => releaseSettling, [releaseSettling]);

    // --- puzzle loading -------------------------------------------------------
    const install = useCallback((p: Puzzle, restore = true) => {
        const saved = restore ? loadProgress(p) : null;
        setPuzzle(p);
        setBoard(saved?.marks ?? startingCells(p));
        releaseSettling();
        setActiveHint(null);
        setHintsUsed(saved?.hintsUsed ?? 0);
        setHintAvailableAt(saved?.hintAvailableAt ?? 0);
        // Clear the in-flight segment too, or the new board inherits the time
        // since the old one's last tick.
        segmentAt.current = null;
        elapsedRef.current = saved?.elapsed ?? 0;
        setElapsed(elapsedRef.current);
        recordedRef.current = saved?.won ? p.seed : null;
        setHistory([]);
        setBusy(false);
    }, [setBoard, releaseSettling, setActiveHint]);

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
    // While a cell is settling, judge every rule as if it were still empty —
    // its real value still shows, only the verdict is deferred.
    const gracedCells = useMemo(() => {
        if (settling === null) return cells;
        const view = cells.slice();
        view[settling] = 0;
        return view;
    }, [cells, settling]);
    const conflicts = useMemo(
        () => (puzzle ? findConflicts(puzzle, gracedCells) : new Set<number>()),
        [puzzle, gracedCells],
    );
    const broken = useMemo(
        () => (puzzle ? brokenLinks(puzzle, gracedCells) : new Set<number>()),
        [puzzle, gracedCells],
    );
    // Keeps `now` fresh so the hint cooldown countdown (and its unlock) render
    // live. A conditional interval that only ran while `hintAvailableAt` was in
    // the future left `now` stuck at its mount-time value whenever a hint had no
    // cooldown at all, showing a countdown that could never reach zero.
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 250);
        return () => clearInterval(id);
    }, []);
    const hintWaitMs = Math.max(0, hintAvailableAt - now);
    const hintCooling = hintWaitMs > 0;

    const hintEvidence = useMemo(() => new Set(hint?.evidence ?? []), [hint]);
    const hintTargets = useMemo(() => new Set(hint?.targets ?? []), [hint]);
    const hintFills = useMemo(
        () => new Map((hint?.fills ?? []).map((f) => [f.i, f.v])),
        [hint],
    );
    // How much of the hint is still outstanding — the whole point of holding the
    // lock is that this number is visible instead of remembered. A mistake hint
    // prescribes nothing, so it has nothing to count.
    const hintLeft = useMemo(() => {
        if (!hint?.fills) return 0;
        return hint.fills.filter((f) => cells[f.i] !== f.v).length;
    }, [hint, cells]);
    // A hint with no targets (the "All set" case) must not lock anything, or the
    // board would freeze with nothing that could possibly release it.
    const hintLock = !!hint && hint.targets.length > 0;

    const filled = cells.filter((c) => c !== 0).length;
    // A finished board is fully described by its cells — no separate win flag.
    const won = useMemo(
        () => (puzzle && !busy ? isSolved(puzzle, cells) : false),
        [puzzle, cells, busy],
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
        saveProgress(puzzle.seed, {
            marks: cells,
            elapsed,
            won,
            fp: fingerprint(puzzle),
            hintsUsed,
            hintAvailableAt,
        });
    }, [puzzle, cells, elapsed, won, busy, hintsUsed, hintAvailableAt]);

    // --- actions --------------------------------------------------------------
    // Recording the win belongs in the handler that caused it, not an effect.
    const recordIfWon = useCallback(
        (next: Cell[]) => {
            if (puzzle && recordedRef.current !== puzzle.seed && isSolved(puzzle, next)) {
                recordedRef.current = puzzle.seed;
                // Read the clock, not the last tick — the winning tap lands
                // somewhere inside the current interval.
                setStats(
                    recordWin(puzzle.difficulty, readElapsed(), mode === "daily" ? today : null),
                );
            }
        },
        [puzzle, mode, today, readElapsed],
    );

    const tap = useCallback(
        (index: number) => {
            if (!puzzle || won || puzzle.givens[index] !== 0) return;
            const prev = cellsRef.current;
            const active = hintRef.current;

            // While a hint is up the board is locked to that hint's squares. A
            // multi-square hint used to vanish on the first tap, leaving the rest
            // to be remembered from a message no longer on screen. Dismiss is the
            // way back to free play.
            if (active) {
                if (!active.targets.includes(index)) return;

                if (!active.fills) {
                    // A mistake hint prescribes nothing — it points at a square
                    // you got wrong. So the cell cycles normally, which is also
                    // the fix.
                    const next = prev.slice();
                    next[index] = ((prev[index] + 1) % 3) as Cell;
                    setHistory((h) => [...h.slice(-200), prev]);
                    setBoard(next);
                    setActiveHint(null);
                    recordIfWon(next);
                    return;
                }

                // Toggle, not cycle: the hint asks for one specific symbol, so a
                // mis-tap needs an escape that isn't "some third mark".
                const want = active.fills.find((f) => f.i === index)!.v;
                const next = prev.slice();
                next[index] = (prev[index] === want ? 0 : want) as Cell;

                setHistory((h) => [...h.slice(-200), prev]);
                setBoard(next);
                if (active.fills.every((f) => next[f.i] === f.v)) setActiveHint(null);
                recordIfWon(next);
                return;
            }

            const next = prev.slice();
            next[index] = ((prev[index] + 1) % 3) as Cell;
            setHistory((h) => [...h.slice(-200), prev]);
            setBoard(next);
            recordIfWon(next);

            // Re-arm the grace window on this cell rather than start a second,
            // independent one — a same-cell double-tap is one gesture, and the
            // clock should run from its last tap, not its first.
            if (settleTimer.current) clearTimeout(settleTimer.current);
            setSettling(index);
            settleTimer.current = setTimeout(() => setSettling(null), CONFLICT_GRACE_MS);
        },
        [puzzle, won, setBoard, setActiveHint, recordIfWon],
    );

    const undo = () => {
        if (!history.length) return;
        releaseSettling();
        setActiveHint(null);
        setBoard(history[history.length - 1]);
        setHistory(history.slice(0, -1));
    };

    // Clear goes back to the givens, not to an empty grid — the givens are the
    // puzzle, not something you filled in.
    const clear = () => {
        if (!puzzle) return;
        releaseSettling();
        setActiveHint(null);
        setHistory((h) => [...h.slice(-200), cells]);
        setBoard(startingCells(puzzle));
    };

    // Your own marks are the visible cost of Clear or New — an untouched board
    // has nothing to lose, so only ask when there is actually something at stake.
    const hasProgress = !!puzzle && cells.some((c, i) => c !== puzzle.givens[i]);

    const requestClear = () => {
        if (!hasProgress) {
            clear();
            return;
        }
        setConfirmAction("clear");
    };

    const askHint = () => {
        if (!puzzle || hintCooling) return;
        setActiveHint(getHint(puzzle, cellsRef.current));
        const used = hintsUsed + 1;
        setHintsUsed(used);
        setHintAvailableAt(Date.now() + hintCooldownMs(used));
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

    // Only the toolbar's "New" swaps out a board still in progress — the win
    // panel's "Next puzzle" replaces one already solved, so it skips this.
    const requestNewPractice = () => {
        if (!hasProgress) {
            newPractice();
            return;
        }
        setConfirmAction("new");
    };

    const confirmPending = () => {
        if (confirmAction === "clear") clear();
        if (confirmAction === "new") newPractice();
        setConfirmAction(null);
    };

    // --- render ---------------------------------------------------------------
    return (
        <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 px-4 py-5">
            <header className="flex items-center justify-between">
                <h1 className="text-2xl font-bold tracking-tight">
                    Tango
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
                    <span className="font-semibold">{puzzle ? `${puzzle.n}×${puzzle.n}` : "—"}</span>
                    <span className="rounded-full bg-[var(--chip)] px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide">
                        {DIFFICULTY_LABEL[puzzle?.difficulty ?? difficulty]}
                    </span>
                    {mode === "daily" && <span className="text-xs text-[var(--muted)]">{today}</span>}
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-[var(--muted)]">
                        {filled}/{puzzle ? puzzle.n * puzzle.n : 0}
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
                        cells={cells}
                        conflicts={conflicts}
                        broken={broken}
                        hintEvidence={hintEvidence}
                        hintTargets={hintTargets}
                        hintFills={hintFills}
                        hintLock={hintLock}
                        celebrate={won}
                        disabled={won}
                        onTap={tap}
                    />
                    {won && (
                        <div
                            // Held back so the wave of symbols lands first. The panel
                            // still fades in over the tail of it, which keeps the whole
                            // celebration under a second.
                            style={{animationDelay: "420ms"}}
                            className="win-panel absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-lg bg-[var(--surface)]/85 backdrop-blur-[2px]"
                        >
                            <span className="win-crown text-4xl" style={{animationDelay: "500ms"}}>
                                ☀️
                            </span>
                            <p className="text-xl font-bold">Solved in {formatTime(elapsed)}</p>
                            <p className="text-sm text-[var(--muted)]">
                                {DIFFICULTY_LABEL[puzzle.difficulty]} · needed{" "}
                                {TIER_NAMES[puzzle.tier].toLowerCase()} reasoning
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
                            <span className="mr-2 rounded bg-sky-600 px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-white">
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
                        {!hint.fills
                            ? hintLock
                                ? "Change that square to carry on, or dismiss."
                                : "Nothing to do here."
                            : hintLeft > 0
                                ? `${hintLeft} square${hintLeft > 1 ? "s" : ""} left — the rest of the board is locked until you fill ${
                                    hintLeft > 1 ? "them" : "it"
                                } in, or dismiss.`
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
                    onClick={requestClear}
                    disabled={won}
                    className="rounded-lg bg-[var(--chip)] py-2.5 disabled:opacity-40"
                >
                    Clear
                </button>
                <button
                    onClick={askHint}
                    disabled={won || hintCooling}
                    className="rounded-lg bg-[var(--chip)] py-2.5 tabular-nums disabled:opacity-40"
                >
                    {hintCooling ? `Hint (${Math.ceil(hintWaitMs / 1000)}s)` : "Hint"}
                </button>
                <button
                    onClick={requestNewPractice}
                    disabled={mode === "daily"}
                    className="rounded-lg bg-[var(--chip)] py-2.5 disabled:opacity-40"
                >
                    New
                </button>
            </div>

            <details className="text-sm text-[var(--muted)]">
                <summary className="cursor-pointer font-medium">Rules</summary>
                <div className="mt-2">
                    <RulesBody/>
                </div>
            </details>

            {stats && (
                <details className="text-sm text-[var(--muted)]">
                    <summary className="cursor-pointer font-medium">Best times</summary>
                    <div className="mt-2">
                        <BestTimesTable best={stats.best}/>
                    </div>
                </details>
            )}

            {/* Diagnostics, not prose — kept out of the rules. */}
            {puzzle && (
                <p className="font-mono text-xs text-[var(--muted)]">
                    seed {puzzle.seed} · tier {puzzle.tier} ({TIER_NAMES[puzzle.tier]}) · effort{" "}
                    {(puzzle.score / puzzle.n).toFixed(1)} · {puzzle.links.length} signs
                </p>
            )}

            {showRules && <RulesDialog onClose={dismissRules}/>}

            {confirmAction && (
                <ConfirmDialog
                    title={confirmAction === "clear" ? "Clear the board?" : "Start a new board?"}
                    body={
                        confirmAction === "clear"
                            ? "Every square you've filled in will be wiped."
                            : "This board's progress will be lost for a fresh one."
                    }
                    confirmLabel={confirmAction === "clear" ? "Clear" : "New board"}
                    onConfirm={confirmPending}
                    onCancel={() => setConfirmAction(null)}
                />
            )}
        </main>
    );
}
