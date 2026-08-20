/**
 * One difficulty ladder for every game in the repo. The rungs mean the same
 * thing everywhere — "how hard is the reasoning", never "how big is the board"
 * — so the shared stats and best-times UI can key off a single vocabulary.
 */
export const DIFFICULTIES = ["easy", "medium", "hard", "expert", "master"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
    easy: "Easy",
    medium: "Medium",
    hard: "Hard",
    expert: "Expert",
    master: "Master",
};
