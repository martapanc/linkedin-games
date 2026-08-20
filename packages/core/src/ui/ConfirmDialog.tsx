"use client";

import {useEffect, useRef} from "react";

/**
 * A small yes/no gate for destructive actions (Clear, New). Two focusable
 * buttons means the trap has to cycle Tab between them rather than pin focus
 * to one, unlike the single-button `RulesDialog`.
 */
export function ConfirmDialog({
    title,
    body,
    confirmLabel,
    onConfirm,
    onCancel,
}: {
    title: string;
    body: string;
    confirmLabel: string;
    onConfirm: () => void;
    onCancel: () => void;
}) {
    const cancelRef = useRef<HTMLButtonElement>(null);
    const confirmRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        const previous = document.activeElement as HTMLElement | null;
        cancelRef.current?.focus();

        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault();
                onCancel();
            }
            if (e.key === "Tab") {
                e.preventDefault();
                const onCancelBtn = document.activeElement === cancelRef.current;
                (onCancelBtn ? confirmRef : cancelRef).current?.focus();
            }
        };

        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("keydown", onKey);
            previous?.focus?.();
        };
    }, [onCancel]);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]"
            onClick={onCancel}
        >
            <div
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="confirm-title"
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-sm rounded-2xl bg-[var(--surface)] p-5 text-sm text-[var(--muted)] shadow-xl"
            >
                <h2
                    id="confirm-title"
                    className="mb-2 text-lg font-bold text-[var(--foreground)]"
                >
                    {title}
                </h2>
                <p className="leading-relaxed">{body}</p>
                <div className="mt-5 grid grid-cols-2 gap-2">
                    <button
                        ref={cancelRef}
                        onClick={onCancel}
                        className="rounded-lg bg-[var(--chip)] py-2.5 font-semibold text-[var(--foreground)]"
                    >
                        Cancel
                    </button>
                    <button
                        ref={confirmRef}
                        onClick={onConfirm}
                        className="rounded-lg bg-red-600 py-2.5 font-semibold text-white"
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
