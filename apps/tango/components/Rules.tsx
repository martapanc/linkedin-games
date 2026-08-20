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
                Fill every square with a sun or a moon. Each row and each column ends up
                with the same number of each — three and three on a 6×6 board.
            </p>
            <ul className="space-y-1.5">
                <li className="flex gap-2">
                    <span aria-hidden="true">🚫</span>
                    <span>
                        <b className="font-semibold text-[var(--foreground)]">Never three</b> of
                        the same symbol in a row, across or down. Two side by side is fine.
                    </span>
                </li>
                <li className="flex gap-2">
                    <span aria-hidden="true">=</span>
                    <span>
                        An <b className="font-semibold text-[var(--foreground)]">=</b> between two
                        squares means they hold the same symbol.
                    </span>
                </li>
                <li className="flex gap-2">
                    <span aria-hidden="true">×</span>
                    <span>
                        A <b className="font-semibold text-[var(--foreground)]">×</b> between two
                        squares means they hold different ones.
                    </span>
                </li>
                <li className="flex gap-2">
                    <span aria-hidden="true">☀</span>
                    <span>
                        <b className="font-semibold text-[var(--foreground)]">Tap</b> a square to
                        cycle it empty → sun → moon. The shaded squares come with the puzzle and
                        can&apos;t be changed.
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
                Every board has exactly one answer, and you never have to guess to find it —
                the rules alone are always enough.
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
