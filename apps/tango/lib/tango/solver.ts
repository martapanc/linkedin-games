import type {Difficulty} from "@games/core";
import {MOON, SUN, other, type Cell, type Link, type Sym} from "./types";

/**
 * Tango's rules, in the order the solver leans on them:
 *
 *   1. every row and column holds exactly n/2 suns and n/2 moons,
 *   2. no three of the same symbol sit consecutively in a row or column,
 *   3. an `=` sign between two cells means they match, a `×` means they differ.
 *
 * Two solvers live here, as in Queens. The exhaustive one proves a generated
 * board has exactly one solution. The logical one grades it, by recording
 * *which* techniques a solve is forced to use — and each of its rules reports
 * why it fired, so the same ladder can explain a step to a player.
 */

/** A grid mid-solve: `0` unknown, `SUN`, or `MOON`. */
export type Grid = Int8Array;

// ---------------------------------------------------------------------------
// Geometry — derived once per board, then shared by every solve of it.
// ---------------------------------------------------------------------------

export interface Ctx {
    n: number;
    /** How many of each symbol a line must end up holding. */
    half: number;
    /** Every row, then every column, as the cell indices along it. */
    lines: number[][];
    links: Link[];
    /** For each cell, the signs touching it: the neighbour and what it demands. */
    linked: {o: number; same: boolean}[][];
    /** `linkKey(a, b)` → the sign on that edge, for adjacent a &lt; b. */
    edge: Map<number, boolean>;
}

const linkKey = (a: number, b: number) => a * 4096 + b;

export function buildCtx(n: number, links: Link[]): Ctx {
    const lines: number[][] = [];
    for (let r = 0; r < n; r++) {
        lines.push(Array.from({length: n}, (_, c) => r * n + c));
    }
    for (let c = 0; c < n; c++) {
        lines.push(Array.from({length: n}, (_, r) => r * n + c));
    }

    const linked: {o: number; same: boolean}[][] = Array.from({length: n * n}, () => []);
    const edge = new Map<number, boolean>();
    for (const l of links) {
        linked[l.a].push({o: l.b, same: l.same});
        linked[l.b].push({o: l.a, same: l.same});
        edge.set(linkKey(l.a, l.b), l.same);
    }

    return {n, half: n / 2, lines, links, linked, edge};
}

/** Row indices come first in `lines`, so anything past `n` is a column. */
export function lineName(ctx: Ctx, li: number): string {
    return li < ctx.n ? `row ${li + 1}` : `column ${li - ctx.n + 1}`;
}

export const symName = (v: Sym, plural = false) =>
    v === SUN ? (plural ? "suns" : "sun") : plural ? "moons" : "moon";

export const isComplete = (g: Grid) => !g.includes(0);

// ---------------------------------------------------------------------------
// Cheap propagation — the three "one glance" rules, applied in bulk. This is
// the hot path: the exhaustive search runs it at every node.
// ---------------------------------------------------------------------------

/** Fills everything the direct rules force. Returns false on a contradiction. */
export function propagate(ctx: Ctx, g: Grid): boolean {
    for (let guard = 0; guard < 500; guard++) {
        let changed = false;

        for (const l of ctx.links) {
            const a = g[l.a];
            const b = g[l.b];
            if (a && b) {
                if ((a === b) !== l.same) return false;
                continue;
            }
            if (!a && !b) continue;
            const known = (a || b) as Sym;
            const want = l.same ? known : other(known);
            if (a) g[l.b] = want;
            else g[l.a] = want;
            changed = true;
        }

        for (const line of ctx.lines) {
            for (let k = 0; k + 2 < line.length; k++) {
                const p0 = line[k];
                const p1 = line[k + 1];
                const p2 = line[k + 2];
                const v0 = g[p0];
                const v1 = g[p1];
                const v2 = g[p2];
                if (v0 && v0 === v1 && v0 === v2) return false;
                if (!v2 && v0 && v0 === v1) {
                    g[p2] = other(v0 as Sym);
                    changed = true;
                } else if (!v0 && v1 && v1 === v2) {
                    g[p0] = other(v1 as Sym);
                    changed = true;
                } else if (!v1 && v0 && v0 === v2) {
                    g[p1] = other(v0 as Sym);
                    changed = true;
                }
            }

            let suns = 0;
            let moons = 0;
            let unknown = 0;
            for (const p of line) {
                const v = g[p];
                if (v === SUN) suns++;
                else if (v === MOON) moons++;
                else unknown++;
            }
            if (suns > ctx.half || moons > ctx.half) return false;
            if (!unknown) continue;
            if (suns === ctx.half || moons === ctx.half) {
                const fill = suns === ctx.half ? MOON : SUN;
                for (const p of line) if (!g[p]) g[p] = fill;
                changed = true;
            }
        }

        if (!changed) return true;
    }
    return true;
}

// ---------------------------------------------------------------------------
// Exhaustive solver — used to prove a generated board has exactly one solution.
// ---------------------------------------------------------------------------

/**
 * Counts solutions, stopping at `limit`. Propagation does nearly all the work,
 * so the branching only ever has to guess at cells no rule can reach.
 */
export function countSolutions(ctx: Ctx, givens: readonly Cell[], limit = 2): number {
    const start = Int8Array.from(givens);
    let found = 0;

    const rec = (g: Grid): void => {
        if (found >= limit) return;
        if (!propagate(ctx, g)) return;
        const i = g.indexOf(0);
        // Propagation validates every rule it touches, so a full grid is a
        // solution outright — there is nothing left to check.
        if (i < 0) {
            found++;
            return;
        }
        for (const v of [SUN, MOON] as Sym[]) {
            const t = g.slice();
            t[i] = v;
            rec(t);
            if (found >= limit) return;
        }
    };

    rec(start);
    return found;
}

export const hasUniqueSolution = (ctx: Ctx, givens: readonly Cell[]) =>
    countSolutions(ctx, givens, 2) === 1;

// ---------------------------------------------------------------------------
// Logical solver. Rules are ordered easiest-first; a board's rating is the
// hardest one it actually forces you to use, split by how much of it you need.
// ---------------------------------------------------------------------------

export const TIER_NAMES = ["none", "Direct", "Quota", "Line logic", "What if…"] as const;

export type RuleName = "link" | "triple" | "count" | "quota" | "line" | "trial";

export const RULE_TIER: Record<RuleName, number> = {
    link: 1,
    triple: 1,
    count: 1,
    quota: 2,
    line: 3,
    trial: 4,
};

export interface Fill {
    i: number;
    v: Sym;
}

export interface Deduction {
    rule: RuleName;
    /** Badge label: the technique. */
    title: string;
    text: string;
    /** The cells that make the argument work. */
    evidence: number[];
    /** What the argument lets you fill in. */
    fills: Fill[];
}

const RULE_TITLE: Record<RuleName, string> = {
    link: "Sign",
    triple: "No three",
    count: "Line full",
    quota: "Counting",
    line: "Only way",
    trial: "What if…",
};

const deduce = (
    rule: RuleName,
    text: string,
    evidence: number[],
    fills: Fill[],
): Deduction => ({rule, title: RULE_TITLE[rule], text, evidence, fills});

/** Tier 1 — a filled cell and the sign beside it settle its neighbour. */
function findLink(ctx: Ctx, g: Grid): Deduction | null {
    for (const l of ctx.links) {
        const a = g[l.a];
        const b = g[l.b];
        if ((a && b) || (!a && !b)) continue;
        const from = a ? l.a : l.b;
        const to = a ? l.b : l.a;
        const known = g[from] as Sym;
        const want = l.same ? known : other(known);
        return deduce(
            "link",
            l.same
                ? `The = on this edge means both cells hold the same symbol.`
                : `The × on this edge means the two cells can't match.`,
            [from],
            [{i: to, v: want}],
        );
    }
    return null;
}

/** Tier 1 — three of a symbol in a row is banned, which settles the third cell. */
function findTriple(ctx: Ctx, g: Grid): Deduction | null {
    for (const line of ctx.lines) {
        for (let k = 0; k + 2 < line.length; k++) {
            const [p0, p1, p2] = [line[k], line[k + 1], line[k + 2]];
            const [v0, v1, v2] = [g[p0], g[p1], g[p2]];
            const pair = (a: number, b: number, target: number, v: Sym) =>
                deduce(
                    "triple",
                    `Two ${symName(v, true)} already sit side by side — a third in line would make three.`,
                    [a, b],
                    [{i: target, v: other(v)}],
                );
            if (!v2 && v0 && v0 === v1) return pair(p0, p1, p2, v0 as Sym);
            if (!v0 && v1 && v1 === v2) return pair(p1, p2, p0, v1 as Sym);
            if (!v1 && v0 && v0 === v2)
                return deduce(
                    "triple",
                    `Closing this gap with a ${symName(v0 as Sym)} would make three in a row.`,
                    [p0, p2],
                    [{i: p1, v: other(v0 as Sym)}],
                );
        }
    }
    return null;
}

/** Tier 1 — a line that already holds its quota of one symbol fills up with the other. */
function findCount(ctx: Ctx, g: Grid): Deduction | null {
    for (let li = 0; li < ctx.lines.length; li++) {
        const line = ctx.lines[li];
        const held: Record<number, number[]> = {[SUN]: [], [MOON]: []};
        const unknown: number[] = [];
        for (const p of line) {
            if (g[p]) held[g[p]].push(p);
            else unknown.push(p);
        }
        if (!unknown.length) continue;
        for (const v of [SUN, MOON] as Sym[]) {
            if (held[v].length !== ctx.half) continue;
            const fill = other(v);
            return deduce(
                "count",
                `${sentence(lineName(ctx, li))} already has all ${ctx.half} of its ${symName(v, true)}, so the rest are ${symName(fill, true)}.`,
                held[v],
                unknown.map((i) => ({i, v: fill})),
            );
        }
    }
    return null;
}

/**
 * Tier 2 — counting that takes the signs into account.
 *
 * Inside a line, an unfilled `×` pair always spends exactly one of each symbol
 * whichever way round it goes, and an `=` pair always spends two of one. So the
 * pairs can be budgeted for before their values are known: once the `×` pairs
 * have claimed every remaining sun, everything else in the line is a moon — and
 * when only one sun is left, no `=` pair can be the sun pair, because it would
 * need two.
 */
function findQuota(ctx: Ctx, g: Grid): Deduction | null {
    for (let li = 0; li < ctx.lines.length; li++) {
        const line = ctx.lines[li];
        let suns = 0;
        let moons = 0;
        for (const p of line) {
            if (g[p] === SUN) suns++;
            else if (g[p] === MOON) moons++;
        }

        // Split the line's empty cells into linked pairs and loners. Walking
        // left to right and never reusing a cell keeps the parts disjoint, which
        // is what makes the budget below add up — a cell caught between two
        // signs must count once, not twice.
        const samePairs: [number, number][] = [];
        const diffPairs: [number, number][] = [];
        const loners: number[] = [];
        for (let k = 0; k < line.length; k++) {
            const p = line[k];
            if (g[p]) continue;
            const q = k + 1 < line.length ? line[k + 1] : -1;
            const sign = q >= 0 && !g[q] ? ctx.edge.get(linkKey(Math.min(p, q), Math.max(p, q))) : undefined;
            if (sign === undefined) {
                loners.push(p);
                continue;
            }
            (sign ? samePairs : diffPairs).push([p, q]);
            k++;
        }
        if (!diffPairs.length && !samePairs.length) continue;

        const need = {[SUN]: ctx.half - suns, [MOON]: ctx.half - moons};
        const spoken = diffPairs.length; // one of each symbol, whichever way round
        const evidence = diffPairs.flat();

        for (const v of [SUN, MOON] as Sym[]) {
            const left = need[v] - spoken;
            const fill = other(v);
            if (left < 0) continue;

            if (left === 0 && (samePairs.length || loners.length)) {
                const targets = [...samePairs.flat(), ...loners];
                return deduce(
                    "quota",
                    `${sentence(lineName(ctx, li))} has ${need[v]} ${symName(v, need[v] !== 1)} left and the × pairs here claim every one of them, so everything else is a ${symName(fill)}.`,
                    evidence,
                    targets.map((i) => ({i, v: fill})),
                );
            }
            if (left === 1 && samePairs.length) {
                return deduce(
                    "quota",
                    `Only one ${symName(v)} is left for ${lineName(ctx, li)} once the × pairs take theirs — an = pair would need two, so it must be ${symName(fill, true)}.`,
                    evidence,
                    samePairs.flat().map((i) => ({i, v: fill})),
                );
            }
        }
    }
    return null;
}

/**
 * Tier 3 — take one line at a time and write out every filling of it that obeys
 * the rules. Wherever all of them agree, that cell is settled.
 *
 * Only signs with *both* ends inside the line are checked here; the ones
 * reaching out of it are what `link` is for. Returns `"broken"` when a line has
 * no legal filling at all, which the trial rule reads as a refutation.
 */
function lineForced(ctx: Ctx, g: Grid): Deduction | "broken" | null {
    for (let li = 0; li < ctx.lines.length; li++) {
        const line = ctx.lines[li];
        const unknown = line.filter((p) => !g[p]);
        if (!unknown.length || unknown.length > 16) continue;

        const inner: {x: number; y: number; same: boolean}[] = [];
        for (let k = 0; k + 1 < line.length; k++) {
            const a = Math.min(line[k], line[k + 1]);
            const b = Math.max(line[k], line[k + 1]);
            const sign = ctx.edge.get(linkKey(a, b));
            if (sign !== undefined) inner.push({x: k, y: k + 1, same: sign});
        }

        const vals = new Int8Array(line.length);
        for (let k = 0; k < line.length; k++) vals[k] = g[line[k]];
        const slots = line.map((p, k) => (g[p] ? -1 : k)).filter((k) => k >= 0);

        // Same value at a slot in every filling so far, or 0 once they disagree.
        const agreed = new Int8Array(slots.length);
        let ways = 0;

        for (let mask = 0; mask < 1 << slots.length; mask++) {
            for (let s = 0; s < slots.length; s++) {
                vals[slots[s]] = mask & (1 << s) ? MOON : SUN;
            }
            let suns = 0;
            for (const v of vals) if (v === SUN) suns++;
            if (suns !== ctx.half) continue;
            let ok = true;
            for (let k = 0; ok && k + 2 < vals.length; k++) {
                if (vals[k] === vals[k + 1] && vals[k] === vals[k + 2]) ok = false;
            }
            for (const c of inner) {
                if (!ok) break;
                if ((vals[c.x] === vals[c.y]) !== c.same) ok = false;
            }
            if (!ok) continue;

            if (!ways) for (let s = 0; s < slots.length; s++) agreed[s] = vals[slots[s]];
            else for (let s = 0; s < slots.length; s++) {
                if (agreed[s] !== vals[slots[s]]) agreed[s] = 0;
            }
            ways++;
        }

        if (!ways) return "broken";

        // A zero means the fillings disagreed there, so that cell stays open.
        const fills: Fill[] = [];
        for (let s = 0; s < slots.length; s++) {
            if (agreed[s]) fills.push({i: line[slots[s]], v: agreed[s] as Sym});
        }
        if (!fills.length) continue;

        return deduce(
            "line",
            ways === 1
                ? `There is only one way to finish ${lineName(ctx, li)} at all.`
                : `Only ${ways} fillings of ${lineName(ctx, li)} obey the rules, and they all agree here.`,
            line.filter((p) => g[p]),
            fills,
        );
    }
    return null;
}

const findLine = (ctx: Ctx, g: Grid): Deduction | null => {
    const d = lineForced(ctx, g);
    return d === "broken" ? null : d;
};

/** Everything up to tier 3, run to exhaustion — the reasoning trial assumes. */
function propagateLogic(ctx: Ctx, g: Grid): boolean {
    for (let guard = 0; guard < 400; guard++) {
        if (!propagate(ctx, g)) return false;
        if (isComplete(g)) return true;
        const d = findQuota(ctx, g) ?? lineForced(ctx, g);
        if (d === "broken") return false;
        if (!d) return true;
        for (const f of d.fills) g[f.i] = f.v;
    }
    return true;
}

/** Tier 4 — try a symbol in a cell; if the board falls apart, it's the other one. */
function findTrial(ctx: Ctx, g: Grid): Deduction | null {
    for (let i = 0; i < g.length; i++) {
        if (g[i]) continue;
        for (const v of [SUN, MOON] as Sym[]) {
            const t = g.slice();
            t[i] = v;
            if (propagateLogic(ctx, t)) continue;
            return deduce(
                "trial",
                `Put a ${symName(v)} here and the board runs out of legal moves, so it has to be a ${symName(other(v))}.`,
                [],
                [{i, v: other(v)}],
            );
        }
    }
    return null;
}

export function nextDeduction(ctx: Ctx, g: Grid): Deduction | null {
    return (
        findLink(ctx, g) ??
        findTriple(ctx, g) ??
        findCount(ctx, g) ??
        findQuota(ctx, g) ??
        findLine(ctx, g) ??
        findTrial(ctx, g)
    );
}

// ---------------------------------------------------------------------------
// Grading.
// ---------------------------------------------------------------------------

export interface Analysis {
    solved: boolean;
    tier: number;
    score: number;
    /** Score per line, so one threshold table serves every board size. */
    effort: number;
    counts: number[];
    difficulty: Difficulty;
}

/**
 * Tier 1 is free: every board is riddled with direct steps, so counting them
 * would grade boards by how *long* they are rather than how hard.
 */
const TIER_COST = [0, 0, 4, 10, 24];

export function analyze(ctx: Ctx, givens: readonly Cell[]): Analysis {
    const g = Int8Array.from(givens);
    const counts = [0, 0, 0, 0, 0];
    let tier = 0;

    for (let guard = 0; guard < 400; guard++) {
        if (isComplete(g)) break;
        const d = nextDeduction(ctx, g);
        if (!d) break;
        for (const f of d.fills) g[f.i] = f.v;
        const t = RULE_TIER[d.rule];
        counts[t]++;
        if (t > tier) tier = t;
    }

    const solved = isComplete(g);
    let score = 0;
    for (let t = 1; t <= 4; t++) score += counts[t] * TIER_COST[t];
    const effort = score / ctx.n;

    return {solved, tier, score, effort, counts, difficulty: rate(tier, effort)};
}

/**
 * The tier — the hardest technique the board *forces* — dominates; `effort`,
 * normalised by board size, splits a tier in two. Thresholds are calibrated
 * against the sample `pnpm bench` prints.
 */
function rate(tier: number, effort: number): Difficulty {
    if (tier <= 1) return "easy";
    if (tier === 2) return effort < 4 ? "easy" : "medium";
    if (tier === 3) return effort < 8 ? "medium" : "hard";
    return effort < 20 ? "expert" : "master";
}

const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
