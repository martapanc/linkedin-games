import type {Difficulty} from "@games/core";

/**
 * Queens rules: exactly one queen per row, per column and per colour region,
 * and no two queens may touch — including diagonally.
 *
 * Because every row holds exactly one queen, two queens can only ever touch if
 * they sit in *adjacent rows* with |Δcolumn| <= 1. That single observation makes
 * the exhaustive solver a tiny row-by-row backtracker.
 */

// ---------------------------------------------------------------------------
// Exhaustive solver — used to prove a generated board has exactly one solution.
// ---------------------------------------------------------------------------

export function findSolutions(
    n: number,
    regions: number[][],
    limit = 2,
): number[][] {
    const found: number[][] = [];
    const cur = new Array<number>(n).fill(-1);

    const rec = (r: number, usedCols: number, usedRegions: number, prev: number) => {
        if (found.length >= limit) return;
        if (r === n) {
            found.push(cur.slice());
            return;
        }
        for (let c = 0; c < n; c++) {
            if (usedCols & (1 << c)) continue;
            if (prev >= 0 && Math.abs(c - prev) <= 1) continue;
            const g = regions[r][c];
            if (usedRegions & (1 << g)) continue;
            cur[r] = c;
            rec(r + 1, usedCols | (1 << c), usedRegions | (1 << g), c);
            if (found.length >= limit) return;
        }
    };

    rec(0, 0, 0, -1);
    return found;
}

export function hasUniqueSolution(n: number, regions: number[][]): boolean {
    return findSolutions(n, regions, 2).length === 1;
}

// ---------------------------------------------------------------------------
// Logical solver — grades difficulty by *which deduction techniques* a solve
// requires, rather than by board size. Rules are ordered easiest-first; the
// rating is the hardest rule the puzzle actually forces you to use.
// ---------------------------------------------------------------------------

export const TIER_NAMES = [
    "none",
    "Single", // only one legal cell left in a row / column / region
    "Locked candidates", // a region confined to one row (and the converse)
    "Adjacency squeeze", // a cell that would strand a whole unit if used
    "Hall set", // k units whose candidates span exactly k other units
    "Contradiction", // assume-and-refute; the "I had to test it" tier
] as const;

interface Units {
    n: number;
    regionOf: Int32Array;
    rowOf: Int32Array;
    colOf: Int32Array;
    rowCells: Int32Array[];
    colCells: Int32Array[];
    regCells: Int32Array[];
    neighbors: Int32Array[]; // king-move neighbours
}

interface State {
    cand: Uint8Array;
    placed: Uint8Array;
    rowDone: Uint8Array;
    colDone: Uint8Array;
    regDone: Uint8Array;
    placedCount: number;
    contradiction: boolean;
}

function buildUnits(n: number, regions: number[][]): Units {
    const size = n * n;
    const regionOf = new Int32Array(size);
    const rowOf = new Int32Array(size);
    const colOf = new Int32Array(size);
    const rowBuf: number[][] = Array.from({length: n}, () => []);
    const colBuf: number[][] = Array.from({length: n}, () => []);
    const regBuf: number[][] = Array.from({length: n}, () => []);
    const neighbors: Int32Array[] = new Array(size);

    for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
            const i = r * n + c;
            const g = regions[r][c];
            regionOf[i] = g;
            rowOf[i] = r;
            colOf[i] = c;
            rowBuf[r].push(i);
            colBuf[c].push(i);
            regBuf[g].push(i);
            const nb: number[] = [];
            for (let dr = -1; dr <= 1; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                    if (!dr && !dc) continue;
                    const rr = r + dr;
                    const cc = c + dc;
                    if (rr < 0 || cc < 0 || rr >= n || cc >= n) continue;
                    nb.push(rr * n + cc);
                }
            }
            neighbors[i] = Int32Array.from(nb);
        }
    }

    return {
        n,
        regionOf,
        rowOf,
        colOf,
        rowCells: rowBuf.map((a) => Int32Array.from(a)),
        colCells: colBuf.map((a) => Int32Array.from(a)),
        regCells: regBuf.map((a) => Int32Array.from(a)),
        neighbors,
    };
}

function newState(n: number): State {
    return {
        cand: new Uint8Array(n * n).fill(1),
        placed: new Uint8Array(n * n),
        rowDone: new Uint8Array(n),
        colDone: new Uint8Array(n),
        regDone: new Uint8Array(n),
        placedCount: 0,
        contradiction: false,
    };
}

function cloneState(s: State): State {
    return {
        cand: s.cand.slice(),
        placed: s.placed.slice(),
        rowDone: s.rowDone.slice(),
        colDone: s.colDone.slice(),
        regDone: s.regDone.slice(),
        placedCount: s.placedCount,
        contradiction: s.contradiction,
    };
}

function eliminate(s: State, i: number): boolean {
    if (s.placed[i]) {
        s.contradiction = true;
        return false;
    }
    if (!s.cand[i]) return false;
    s.cand[i] = 0;
    return true;
}

function place(u: Units, s: State, i: number): void {
    if (!s.cand[i]) {
        s.contradiction = true;
        return;
    }
    s.placed[i] = 1;
    s.placedCount++;
    const r = u.rowOf[i];
    const c = u.colOf[i];
    const g = u.regionOf[i];
    s.rowDone[r] = 1;
    s.colDone[c] = 1;
    s.regDone[g] = 1;
    for (const j of u.rowCells[r]) if (j !== i) eliminate(s, j);
    for (const j of u.colCells[c]) if (j !== i) eliminate(s, j);
    for (const j of u.regCells[g]) if (j !== i) eliminate(s, j);
    for (const j of u.neighbors[i]) eliminate(s, j);
}

function candidatesOf(s: State, cells: Int32Array): number[] {
    const out: number[] = [];
    for (const i of cells) if (s.cand[i] && !s.placed[i]) out.push(i);
    return out;
}

/** Every unit a queen at `x` would wipe out. */
function kills(u: Units, x: number, y: number): boolean {
    return (
        u.rowOf[x] === u.rowOf[y] ||
        u.colOf[x] === u.colOf[y] ||
        u.regionOf[x] === u.regionOf[y] ||
        (Math.abs(u.rowOf[x] - u.rowOf[y]) <= 1 &&
            Math.abs(u.colOf[x] - u.colOf[y]) <= 1)
    );
}

/** Tier 1 — a unit with a single remaining candidate must hold the queen. */
function applySingles(u: Units, s: State): boolean {
    let progress = false;
    const groups: [Int32Array[], Uint8Array][] = [
        [u.rowCells, s.rowDone],
        [u.colCells, s.colDone],
        [u.regCells, s.regDone],
    ];
    for (const [cells, done] of groups) {
        for (let k = 0; k < u.n; k++) {
            if (done[k]) continue;
            const cs = candidatesOf(s, cells[k]);
            if (cs.length === 0) {
                s.contradiction = true;
                return progress;
            }
            if (cs.length === 1) {
                place(u, s, cs[0]);
                if (s.contradiction) return true;
                progress = true;
            }
        }
    }
    return progress;
}

/**
 * Tier 2 — locked candidates. If a region's remaining cells all sit in one row,
 * that row's queen belongs to the region, so every other cell of the row goes.
 * And the converse (a row confined to one region).
 */
function applyLocked(u: Units, s: State): boolean {
    // region -> row / column
    for (let g = 0; g < u.n; g++) {
        if (s.regDone[g]) continue;
        const cs = candidatesOf(s, u.regCells[g]);
        if (!cs.length) continue;
        const r0 = u.rowOf[cs[0]];
        if (cs.every((i) => u.rowOf[i] === r0)) {
            let hit = false;
            for (const j of u.rowCells[r0]) {
                if (u.regionOf[j] !== g && s.cand[j] && eliminate(s, j)) hit = true;
            }
            if (hit) return true;
        }
        const c0 = u.colOf[cs[0]];
        if (cs.every((i) => u.colOf[i] === c0)) {
            let hit = false;
            for (const j of u.colCells[c0]) {
                if (u.regionOf[j] !== g && s.cand[j] && eliminate(s, j)) hit = true;
            }
            if (hit) return true;
        }
    }
    // row / column -> region
    const lines: [Int32Array[], Uint8Array][] = [
        [u.rowCells, s.rowDone],
        [u.colCells, s.colDone],
    ];
    for (const [cells, done] of lines) {
        for (let k = 0; k < u.n; k++) {
            if (done[k]) continue;
            const cs = candidatesOf(s, cells[k]);
            if (!cs.length) continue;
            const g0 = u.regionOf[cs[0]];
            if (!cs.every((i) => u.regionOf[i] === g0)) continue;
            const inLine = new Set(cs);
            let hit = false;
            for (const j of u.regCells[g0]) {
                if (!inLine.has(j) && s.cand[j] && eliminate(s, j)) hit = true;
            }
            if (hit) return true;
        }
    }
    return false;
}

/**
 * Tier 3 — adjacency squeeze. If putting a queen on cell x would knock out every
 * remaining candidate of some *other* unit, x cannot be a queen. In practice
 * this is the "both cells of that region touch this square" deduction.
 */
function applyAdjacency(u: Units, s: State): boolean {
    const all: [Int32Array[], Uint8Array, "row" | "col" | "reg"][] = [
        [u.rowCells, s.rowDone, "row"],
        [u.colCells, s.colDone, "col"],
        [u.regCells, s.regDone, "reg"],
    ];
    for (const [cells, done, kind] of all) {
        for (let k = 0; k < u.n; k++) {
            if (done[k]) continue;
            const cs = candidatesOf(s, cells[k]);
            // Cap the fan-out: humans only spot this on small candidate sets.
            if (cs.length < 2 || cs.length > 4) continue;
            for (let x = 0; x < u.n * u.n; x++) {
                if (!s.cand[x] || s.placed[x]) continue;
                // A queen inside the unit satisfies it rather than stranding it.
                if (kind === "row" && u.rowOf[x] === k) continue;
                if (kind === "col" && u.colOf[x] === k) continue;
                if (kind === "reg" && u.regionOf[x] === k) continue;
                let doomed = true;
                for (const y of cs) {
                    if (!kills(u, x, y)) {
                        doomed = false;
                        break;
                    }
                }
                if (doomed && eliminate(s, x)) return true;
            }
        }
    }
    return false;
}

type UnitKind = "row" | "col" | "reg";

function unitIdOf(u: Units, kind: UnitKind, i: number): number {
    return kind === "row" ? u.rowOf[i] : kind === "col" ? u.colOf[i] : u.regionOf[i];
}

function unitCellsOf(u: Units, kind: UnitKind): Int32Array[] {
    return kind === "row" ? u.rowCells : kind === "col" ? u.colCells : u.regCells;
}

function unitDoneOf(s: State, kind: UnitKind): Uint8Array {
    return kind === "row" ? s.rowDone : kind === "col" ? s.colDone : s.regDone;
}

/**
 * Tier 4 — Hall sets. If k rows can only draw their queens from exactly k
 * regions, those regions are spoken for: every other row's cells inside them go.
 * Checked for k = 2 and 3, which is the realistic human range.
 */
function hallPass(u: Units, s: State, xk: UnitKind, yk: UnitKind): boolean {
    const xCells = unitCellsOf(u, xk);
    const xDone = unitDoneOf(s, xk);
    const yCells = unitCellsOf(u, yk);
    const yDone = unitDoneOf(s, yk);

    const active: number[] = [];
    const mask: number[] = new Array(u.n).fill(0);
    for (let k = 0; k < u.n; k++) {
        if (xDone[k]) continue;
        let m = 0;
        for (const i of candidatesOf(s, xCells[k])) {
            const y = unitIdOf(u, yk, i);
            if (!yDone[y]) m |= 1 << y;
        }
        if (!m) continue;
        mask[k] = m;
        active.push(k);
    }

    const tryGroup = (group: number[]): boolean => {
        let m = 0;
        for (const g of group) m |= mask[g];
        let bits = 0;
        for (let b = 0; b < u.n; b++) if (m & (1 << b)) bits++;
        if (bits !== group.length) return false;
        const inGroup = new Set(group);
        let hit = false;
        for (let y = 0; y < u.n; y++) {
            if (!(m & (1 << y))) continue;
            for (const i of yCells[y]) {
                if (!s.cand[i] || s.placed[i]) continue;
                if (!inGroup.has(unitIdOf(u, xk, i)) && eliminate(s, i)) hit = true;
            }
        }
        return hit;
    };

    for (let a = 0; a < active.length; a++) {
        for (let b = a + 1; b < active.length; b++) {
            if (tryGroup([active[a], active[b]])) return true;
            for (let c = b + 1; c < active.length; c++) {
                if (tryGroup([active[a], active[b], active[c]])) return true;
            }
        }
    }
    return false;
}

function applyHall(u: Units, s: State): boolean {
    const pairs: [UnitKind, UnitKind][] = [
        ["row", "reg"],
        ["reg", "row"],
        ["col", "reg"],
        ["reg", "col"],
        ["row", "col"],
        ["col", "row"],
    ];
    for (const [x, y] of pairs) if (hallPass(u, s, x, y)) return true;
    return false;
}

/** Cheap propagation used inside the trial rule. */
function propagateEasy(u: Units, s: State): void {
    for (let guard = 0; guard < 200; guard++) {
        if (s.contradiction || s.placedCount === u.n) return;
        if (applySingles(u, s)) continue;
        if (s.contradiction) return;
        if (applyLocked(u, s)) continue;
        return;
    }
}

/** Tier 5 — assume a queen, propagate, and eliminate it if that explodes. */
function applyTrial(u: Units, s: State): boolean {
    for (let x = 0; x < u.n * u.n; x++) {
        if (!s.cand[x] || s.placed[x]) continue;
        const t = cloneState(s);
        place(u, t, x);
        if (!t.contradiction) propagateEasy(u, t);
        if (t.contradiction) {
            if (eliminate(s, x)) return true;
        }
    }
    return false;
}

export interface Analysis {
    solved: boolean;
    tier: number;
    score: number;
    /** score per row — lets one threshold table serve every board size. */
    effort: number;
    counts: number[];
    difficulty: Difficulty;
}

const TIER_COST = [0, 0, 3, 10, 18, 30];

export function analyze(n: number, regions: number[][]): Analysis {
    const u = buildUnits(n, regions);
    const s = newState(n);
    const counts = [0, 0, 0, 0, 0, 0];
    let tier = 0;

    for (let guard = 0; guard < 500; guard++) {
        if (s.contradiction || s.placedCount === n) break;
        let used = 0;
        if (applySingles(u, s)) used = 1;
        else if (s.contradiction) break;
        else if (applyLocked(u, s)) used = 2;
        else if (applyAdjacency(u, s)) used = 3;
        else if (applyHall(u, s)) used = 4;
        else if (applyTrial(u, s)) used = 5;
        if (!used) break;
        counts[used]++;
        if (used > tier) tier = used;
    }

    const solved = !s.contradiction && s.placedCount === n;
    let score = 0;
    for (let t = 1; t <= 5; t++) score += counts[t] * TIER_COST[t];
    const effort = score / n;

    return {solved, tier, score, effort, counts, difficulty: rate(tier, effort)};
}

/**
 * Thresholds calibrated against ~1700 generated boards (n = 7..10). The tier —
 * the hardest technique the puzzle *forces* — dominates; `effort` (how much of
 * that technique you need, normalised by board size) splits a tier in two.
 *
 * Tier 5 gets a band to itself. Trial reasoning is a different *kind* of move
 * from the rest of the ladder — you stop reading the board and start assuming
 * — so grading it by volume alongside tier 4 buried a real step change.
 */
function rate(tier: number, effort: number): Difficulty {
    if (tier <= 2) return "easy";
    if (tier === 3) return effort < 12 ? "medium" : "hard";
    if (tier === 4) return effort < 14 ? "hard" : "expert";
    return "master";
}

// ---------------------------------------------------------------------------
// Hints. The same rule ladder used for grading, but each rule reports *why* it
// fired so the player learns the technique instead of being handed an answer.
// ---------------------------------------------------------------------------

export type RuleName = "single" | "locked" | "adjacency" | "hall" | "trial";

export interface Deduction {
    rule: RuleName;
    /** Short name for the technique, shown as a badge. */
    title: string;
    text: string;
    /** The squares that make the argument work. */
    evidence: number[];
    /** What the argument lets you fill in. */
    targets: number[];
    action: "place" | "cross";
}

const RULE_TITLE: Record<RuleName, string> = {
    single: "Last square",
    locked: "Locked area",
    adjacency: "Squeeze",
    hall: "Paired areas",
    trial: "What if…",
};

/**
 * Hint wording leans on the highlighting rather than naming things. Once the
 * squares in question are lit up and everything else is dimmed, "the salmon
 * area" is just a second, worse way of pointing at them — "this colour" is
 * shorter and cannot be misread. Rows and columns keep their numbers, which
 * are short and unambiguous.
 */
function unitName(kind: UnitKind, k: number): string {
    if (kind === "row") return `row ${k + 1}`;
    if (kind === "col") return `column ${k + 1}`;
    return "this colour";
}

function groupLabel(kind: UnitKind, ids: number[]): string {
    if (kind === "reg") return `these ${ids.length} colours`;
    const nums = joinList(ids.map((k) => String(k + 1)));
    return kind === "row" ? `rows ${nums}` : `columns ${nums}`;
}

const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "a", "a and b", "a, b and c" — never "a and b and c". */
function joinList(items: string[]): string {
    if (items.length <= 1) return items[0] ?? "";
    return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

const UNIT_GROUPS: [
    (u: Units) => Int32Array[],
    (s: State) => Uint8Array,
    UnitKind,
][] = [
    [(u) => u.rowCells, (s) => s.rowDone, "row"],
    [(u) => u.colCells, (s) => s.colDone, "col"],
    [(u) => u.regCells, (s) => s.regDone, "reg"],
];

/** Tier 1 — a unit down to one square. */
function findSingle(u: Units, s: State): Deduction | null {
    for (const [cellsOf, doneOf, kind] of UNIT_GROUPS) {
        const cells = cellsOf(u);
        const done = doneOf(s);
        for (let k = 0; k < u.n; k++) {
            if (done[k]) continue;
            const cs = candidatesOf(s, cells[k]);
            if (cs.length !== 1) continue;
            return {
                rule: "single",
                title: RULE_TITLE.single,
                text: `${sentence(unitName(kind, k))} has one square left — its queen goes here.`,
                evidence: Array.from(cells[k]),
                targets: [cs[0]],
                action: "place",
            };
        }
    }
    return null;
}

/** Tier 2 — locked candidates, in both directions. */
function findLocked(u: Units, s: State): Deduction | null {
    for (let g = 0; g < u.n; g++) {
        if (s.regDone[g]) continue;
        const cs = candidatesOf(s, u.regCells[g]);
        if (cs.length < 2) continue;
        const axes: [Int32Array, Int32Array[], string][] = [
            [u.rowOf, u.rowCells, "row"],
            [u.colOf, u.colCells, "column"],
        ];
        for (const [of, lineCells, label] of axes) {
            const v = of[cs[0]];
            if (!cs.every((i) => of[i] === v)) continue;
            const targets = candidatesOf(s, lineCells[v]).filter(
                (i) => u.regionOf[i] !== g,
            );
            if (!targets.length) continue;
            return {
                rule: "locked",
                title: RULE_TITLE.locked,
                text: `This colour only fits in ${label} ${v + 1} — so the rest of that ${label} is out.`,
                evidence: cs,
                targets,
                action: "cross",
            };
        }
    }

    const lines: [Int32Array[], Uint8Array, UnitKind][] = [
        [u.rowCells, s.rowDone, "row"],
        [u.colCells, s.colDone, "col"],
    ];
    for (const [cells, done, kind] of lines) {
        for (let k = 0; k < u.n; k++) {
            if (done[k]) continue;
            const cs = candidatesOf(s, cells[k]);
            if (cs.length < 2) continue;
            const g0 = u.regionOf[cs[0]];
            if (!cs.every((i) => u.regionOf[i] === g0)) continue;
            const inLine = new Set(cs);
            const targets = candidatesOf(s, u.regCells[g0]).filter(
                (i) => !inLine.has(i),
            );
            if (!targets.length) continue;
            return {
                rule: "locked",
                title: RULE_TITLE.locked,
                text: `${sentence(unitName(kind, k))} only fits in one colour — so that colour's other squares are out.`,
                evidence: cs,
                targets,
                action: "cross",
            };
        }
    }
    return null;
}

/** Tier 3 — a square that would strand a whole unit. */
function findAdjacency(u: Units, s: State): Deduction | null {
    for (const [cellsOf, doneOf, kind] of UNIT_GROUPS) {
        const cells = cellsOf(u);
        const done = doneOf(s);
        for (let k = 0; k < u.n; k++) {
            if (done[k]) continue;
            const cs = candidatesOf(s, cells[k]);
            if (cs.length < 2 || cs.length > 4) continue;
            for (let x = 0; x < u.n * u.n; x++) {
                if (!s.cand[x] || s.placed[x]) continue;
                if (unitIdOf(u, kind, x) === k) continue;
                if (!cs.every((y) => kills(u, x, y))) continue;
                return {
                    rule: "adjacency",
                    title: RULE_TITLE.adjacency,
                    text: `A queen here would leave ${unitName(kind, k)} nowhere to go.`,
                    evidence: cs,
                    targets: [x],
                    action: "cross",
                };
            }
        }
    }
    return null;
}

/** Tier 4 — k units that between them can only use k others. */
function findHall(u: Units, s: State): Deduction | null {
    const pairs: [UnitKind, UnitKind][] = [
        ["reg", "col"],
        ["reg", "row"],
        ["row", "reg"],
        ["col", "reg"],
        ["row", "col"],
        ["col", "row"],
    ];

    for (const [xk, yk] of pairs) {
        const xCells = unitCellsOf(u, xk);
        const xDone = unitDoneOf(s, xk);
        const yCells = unitCellsOf(u, yk);
        const yDone = unitDoneOf(s, yk);

        const active: number[] = [];
        const mask = new Array<number>(u.n).fill(0);
        for (let k = 0; k < u.n; k++) {
            if (xDone[k]) continue;
            let m = 0;
            for (const i of candidatesOf(s, xCells[k])) {
                const y = unitIdOf(u, yk, i);
                if (!yDone[y]) m |= 1 << y;
            }
            if (!m) continue;
            mask[k] = m;
            active.push(k);
        }

        const attempt = (group: number[]): Deduction | null => {
            let m = 0;
            for (const g of group) m |= mask[g];
            let bits = 0;
            for (let b = 0; b < u.n; b++) if (m & (1 << b)) bits++;
            if (bits !== group.length) return null;

            const inGroup = new Set(group);
            const ys: number[] = [];
            for (let y = 0; y < u.n; y++) if (m & (1 << y)) ys.push(y);

            const evidence: number[] = [];
            for (const g of group) evidence.push(...candidatesOf(s, xCells[g]));
            const targets: number[] = [];
            for (const y of ys) {
                for (const i of candidatesOf(s, yCells[y])) {
                    if (!inGroup.has(unitIdOf(u, xk, i))) targets.push(i);
                }
            }
            if (!targets.length) return null;

            const xs = groupLabel(xk, group);
            const yl = groupLabel(yk, ys);
            return {
                rule: "hall",
                title: RULE_TITLE.hall,
                text: `${sentence(xs)} need ${yl} between them — nothing else there can be a queen.`,
                evidence,
                targets,
                action: "cross",
            };
        };

        for (let a = 0; a < active.length; a++) {
            for (let b = a + 1; b < active.length; b++) {
                const two = attempt([active[a], active[b]]);
                if (two) return two;
                for (let c = b + 1; c < active.length; c++) {
                    const three = attempt([active[a], active[b], active[c]]);
                    if (three) return three;
                }
            }
        }
    }
    return null;
}

/** Tier 5 — assume and refute. */
function findTrial(u: Units, s: State): Deduction | null {
    for (let x = 0; x < u.n * u.n; x++) {
        if (!s.cand[x] || s.placed[x]) continue;
        const t = cloneState(s);
        place(u, t, x);
        if (!t.contradiction) propagateEasy(u, t);
        if (!t.contradiction) continue;
        return {
            rule: "trial",
            title: RULE_TITLE.trial,
            text: `Follow a queen here through and it hits a dead end.`,
            evidence: [],
            targets: [x],
            action: "cross",
        };
    }
    return null;
}

/**
 * The next forced step from the board as it actually stands.
 *
 * Seeded with the player's own queens and crosses, so the hint follows their
 * reasoning rather than restarting from an empty grid. Callers must check the
 * marks against the solution first — feeding in a wrong one would produce a
 * confidently bogus deduction.
 */
export function nextDeduction(
    n: number,
    regions: number[][],
    marks: number[],
): Deduction | null {
    const u = buildUnits(n, regions);
    const s = newState(n);

    for (let i = 0; i < n * n; i++) {
        if (marks[i] === 2) {
            place(u, s, i);
            if (s.contradiction) return null;
        }
    }
    for (let i = 0; i < n * n; i++) {
        if (marks[i] === 1 && s.cand[i] && !s.placed[i]) eliminate(s, i);
    }
    if (s.contradiction) return null;

    return (
        findSingle(u, s) ??
        findLocked(u, s) ??
        findAdjacency(u, s) ??
        findHall(u, s) ??
        findTrial(u, s)
    );
}
