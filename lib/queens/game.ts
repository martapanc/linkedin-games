import { nextDeduction } from "./solver";
import type { Mark, Puzzle } from "./types";

export function queenIndices(marks: Mark[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < marks.length; i++) if (marks[i] === 2) out.push(i);
  return out;
}

/** Queens that break a rule, so the board can flag them live. */
export function findConflicts(puzzle: Puzzle, marks: Mark[]): Set<number> {
  const { n, regions } = puzzle;
  const qs = queenIndices(marks);
  const bad = new Set<number>();

  for (let a = 0; a < qs.length; a++) {
    for (let b = a + 1; b < qs.length; b++) {
      const i = qs[a];
      const j = qs[b];
      const ri = (i / n) | 0;
      const ci = i % n;
      const rj = (j / n) | 0;
      const cj = j % n;
      const clash =
        ri === rj ||
        ci === cj ||
        regions[ri][ci] === regions[rj][cj] ||
        (Math.abs(ri - rj) <= 1 && Math.abs(ci - cj) <= 1);
      if (clash) {
        bad.add(i);
        bad.add(j);
      }
    }
  }
  return bad;
}

/** Cells ruled out by the queens already on the board (display aid). */
export function attackedCells(puzzle: Puzzle, marks: Mark[]): Set<number> {
  const { n, regions } = puzzle;
  const out = new Set<number>();
  for (const i of queenIndices(marks)) {
    const r = (i / n) | 0;
    const c = i % n;
    const g = regions[r][c];
    for (let k = 0; k < n; k++) {
      out.add(r * n + k);
      out.add(k * n + c);
    }
    for (let rr = 0; rr < n; rr++) {
      for (let cc = 0; cc < n; cc++) {
        if (regions[rr][cc] === g) out.add(rr * n + cc);
        if (Math.abs(rr - r) <= 1 && Math.abs(cc - c) <= 1) out.add(rr * n + cc);
      }
    }
    out.delete(i);
  }
  return out;
}

export function isSolved(puzzle: Puzzle, marks: Mark[]): boolean {
  const qs = queenIndices(marks);
  return qs.length === puzzle.n && findConflicts(puzzle, marks).size === 0;
}

export interface Hint {
  /** Badge label: the technique, or the kind of mistake. */
  title: string;
  text: string;
  /** Squares that make the argument work. */
  evidence: number[];
  /** Squares the argument resolves. */
  targets: number[];
}

/**
 * Explain the next step rather than give it away.
 *
 * Mistakes come first: `nextDeduction` reasons from the marks on the board, so
 * a single wrong one would let it "prove" something false. Once the board is
 * known-consistent, the logical solver supplies the next forced move together
 * with the technique that justifies it.
 */
export function getHint(puzzle: Puzzle, marks: Mark[]): Hint {
  const { n, regions, solution } = puzzle;
  const truth = new Set(solution.map((c, r) => r * n + c));

  for (let i = 0; i < marks.length; i++) {
    if (marks[i] === 2 && !truth.has(i)) {
      return {
        title: "Mistake",
        text: "This queen can't be right — everything you work out from it will be off. Try removing it.",
        evidence: [],
        targets: [i],
      };
    }
  }
  for (let i = 0; i < marks.length; i++) {
    if (marks[i] === 1 && truth.has(i)) {
      return {
        title: "Mistake",
        text: "You've ruled out a square that actually holds a queen.",
        evidence: [],
        targets: [i],
      };
    }
  }

  const d = nextDeduction(n, regions, marks);
  if (d) return { title: d.title, text: d.text, evidence: d.evidence, targets: d.targets };

  const remaining = [...truth].filter((i) => marks[i] !== 2);
  if (!remaining.length) {
    return { title: "All set", text: "Nothing left to work out — you're done.", evidence: [], targets: [] };
  }
  // Every technique the solver knows is exhausted; fall back to showing one.
  return {
    title: "Queen",
    text: `No single technique forces the next move here, so: R${((remaining[0] / n) | 0) + 1}C${(remaining[0] % n) + 1} holds a queen.`,
    evidence: [],
    targets: [remaining[0]],
  };
}
