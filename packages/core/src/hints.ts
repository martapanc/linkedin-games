/**
 * Hints ramp up: the first couple are free, then each extra one locks the
 * button for longer, so a spammed Hint stops being the easy route to a win.
 * The schedule is shared — a player switching between games shouldn't have
 * to relearn what "asking for one more hint" costs.
 */
export const FREE_HINTS = 2;
const HINT_COOLDOWN_BASE_MS = 5000;
const HINT_COOLDOWN_STEP_MS = 5000;
const HINT_COOLDOWN_MAX_MS = 30000;

export function hintCooldownMs(hintsUsed: number): number {
    if (hintsUsed <= FREE_HINTS) return 0;
    return Math.min(
        HINT_COOLDOWN_MAX_MS,
        HINT_COOLDOWN_BASE_MS + HINT_COOLDOWN_STEP_MS * (hintsUsed - FREE_HINTS - 1),
    );
}
