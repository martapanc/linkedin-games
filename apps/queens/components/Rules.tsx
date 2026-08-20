"use client";

import {RulesDialog as Dialog} from "@games/core/ui";

/**
 * The rules, written once and rendered in two places: the first-run dialog and
 * the always-available disclosure at the bottom of the game. Keeping a single
 * copy is the point — two versions of the rules drift.
 */
export function RulesBody() {
    return (
        <div className="space-y-3 leading-relaxed">
            <p>
                Place one queen in every row, every column, and every colour region —
                and no two queens may touch, not even diagonally.
            </p>
            <ul className="space-y-1.5">
                <li className="flex gap-2">
                    <span aria-hidden="true">👑</span>
                    <span>
                        <b className="font-semibold text-[var(--foreground)]">Tap</b> a cell to
                        cycle it empty → ✕ → 👑.
                    </span>
                </li>
                <li className="flex gap-2">
                    <span aria-hidden="true">✕</span>
                    <span>
                        <b className="font-semibold text-[var(--foreground)]">Drag</b> to sweep ✕
                        across a run of cells. The whole sweep is one undo step.
                    </span>
                </li>
                <li className="flex gap-2">
                    <span aria-hidden="true">💡</span>
                    <span>
                        <b className="font-semibold text-[var(--foreground)]">Hint</b> explains
                        the next forced step rather than giving it away, and holds the board to
                        that step until you have done it — or dismiss it.
                    </span>
                </li>
            </ul>
            <p>
                Placing a queen crosses out its row, column, colour and touching cells for
                you. Removing it puts them back, keeping any ✕ you placed yourself or that
                another queen still rules out.
            </p>
        </div>
    );
}

/** Shown once, the first time someone opens the game. */
export function RulesDialog({onClose}: {onClose: () => void}) {
    return (
        <Dialog onClose={onClose}>
            <RulesBody/>
        </Dialog>
    );
}
