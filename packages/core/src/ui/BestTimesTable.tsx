import {DIFFICULTIES, DIFFICULTY_LABEL} from "../difficulty";
import {formatTime} from "../format";
import type {BestTimes} from "../storage";

/** All 5 difficulties always list, with an em dash for anything not yet
 * recorded — reads as a stat card rather than a sparse list. */
export function BestTimesTable({best}: {best: BestTimes}) {
    return (
        <table className="w-full text-left">
            <thead>
                <tr className="text-[var(--muted)]">
                    <th className="font-medium">Difficulty</th>
                    <th className="font-medium text-right">Daily</th>
                    <th className="font-medium text-right">Practice</th>
                </tr>
            </thead>
            <tbody>
                {DIFFICULTIES.map((d) => (
                    <tr key={d}>
                        <td>{DIFFICULTY_LABEL[d]}</td>
                        <td className="text-right tabular-nums">
                            {best.daily[d] != null ? formatTime(best.daily[d]) : "—"}
                        </td>
                        <td className="text-right tabular-nums">
                            {best.practice[d] != null ? formatTime(best.practice[d]) : "—"}
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}
