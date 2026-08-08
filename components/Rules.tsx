"use client";

import {useEffect, useRef} from "react";

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

/**
 * Shown once, the first time someone opens the game.
 *
 * Only the close button is focusable inside, so the trap is just "keep Tab in
 * here" — without it, tabbing walks off into the page behind the dialog, which
 * a screen reader has been told is inert.
 */
export function RulesDialog({onClose}: { onClose: () => void }) {
    const closeRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        const previous = document.activeElement as HTMLElement | null;
        closeRef.current?.focus();

        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault();
                onClose();
            }
            if (e.key === "Tab") {
                // One focusable element means Tab has nowhere legitimate to go.
                e.preventDefault();
                closeRef.current?.focus();
            }
        };

        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("keydown", onKey);
            previous?.focus?.();
        };
    }, [onClose]);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]"
            onClick={onClose}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="rules-title"
                // The backdrop closes on click, so stop the panel's own clicks
                // from bubbling up to it.
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-sm rounded-2xl bg-[var(--surface)] p-5 text-sm text-[var(--muted)] shadow-xl"
            >
                <h2
                    id="rules-title"
                    className="mb-3 text-lg font-bold text-[var(--foreground)]"
                >
                    How to play
                </h2>
                <RulesBody/>
                <button
                    ref={closeRef}
                    onClick={onClose}
                    className="mt-5 w-full rounded-lg bg-[var(--accent)] py-2.5 font-semibold text-white"
                >
                    Got it
                </button>
            </div>
        </div>
    );
}
