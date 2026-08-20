export function formatTime(ms: number): string {
    const total = Math.floor(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
}

/** Stable per-day key so everyone gets the same "daily" board. */
export function dailySeed(date: Date = new Date()): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

/** The day before `today` ("YYYY-MM-DD"), used to decide whether a streak survives. */
export function previousDay(today: string): string {
    // Noon, so a DST shift in either direction still lands on the right date.
    const d = new Date(`${today}T12:00:00`);
    d.setDate(d.getDate() - 1);
    return dailySeed(d);
}
