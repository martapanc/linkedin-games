"use client";

import {useEffect, useRef, type ReactNode} from "react";

/**
 * The first-run "how to play" shell. Each game supplies its own rules as
 * children; only the chrome, the focus trap and the dismiss button live here.
 *
 * Only the close button is focusable inside, so the trap is just "keep Tab in
 * here" — without it, tabbing walks off into the page behind the dialog, which
 * a screen reader has been told is inert.
 */
export function RulesDialog({
    title = "How to play",
    children,
    onClose,
}: {
    title?: string;
    children: ReactNode;
    onClose: () => void;
}) {
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
                <h2 id="rules-title" className="mb-3 text-lg font-bold text-[var(--foreground)]">
                    {title}
                </h2>
                {children}
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
