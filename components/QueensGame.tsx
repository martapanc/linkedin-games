"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

  const setBoard = useCallback((next: Mark[]) => {
    marksRef.current = next;
    setMarks(next);
  }, []);

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
      setHint(null);
      setBusy(false);
    },
    [setBoard],
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
    saveProgress(puzzle.seed, { marks, elapsed, won, fp: fingerprint(puzzle) });
  }, [puzzle, marks, elapsed, won, busy]);

  // --- actions --------------------------------------------------------------
  const tap = useCallback(
    (index: number): Mark => {
      const prev = marksRef.current;
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
      setHint(null);

      // Recording the win belongs in the handler that caused it, not an effect.
      if (puzzle && recordedRef.current !== puzzle.seed && isSolved(puzzle, next)) {
        recordedRef.current = puzzle.seed;
        setStats(recordWin(puzzle.difficulty, elapsedRef.current, mode === "daily" ? today : null));
      }
      return mark;
    },
    [puzzle, mode, today, autoCross, setBoard],
  );

  // Crosses can never complete a board, so no win check is needed here.
  const strokePushed = useRef(false);
  const paint = useCallback(
    (indices: number[], newStroke: boolean) => {
      if (newStroke) strokePushed.current = false;
      const prev = marksRef.current;
      let next: Mark[] | null = null;
      for (const i of indices) {
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
      setHint(null);
    },
    [setBoard],
  );

  const undo = () => {
    if (!history.length) return;
    setBoard(history[history.length - 1]);
    setHistory(history.slice(0, -1));
  };

  const clear = () => {
    if (!puzzle) return;
    setHistory((h) => [...h.slice(-200), marksRef.current]);
    setBoard(new Array<Mark>(puzzle.n * puzzle.n).fill(0));
  };

  const askHint = () => {
    if (puzzle) setHint(getHint(puzzle, marks));
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
          <span className="rounded-full bg-[var(--chip)] px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide">
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
            autoCross={autoCross}
            disabled={won}
            onTap={tap}
            onPaint={paint}
          />
          {won && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-lg bg-[var(--surface)]/85 backdrop-blur-[2px]">
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
          <span className="mr-2 rounded bg-sky-600 px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-white">
            {hint.title}
          </span>
          <span className="text-sky-800 dark:text-sky-200">{hint.text}</span>
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
