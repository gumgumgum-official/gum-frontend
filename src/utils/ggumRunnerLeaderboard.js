const STORAGE_KEY = "ggumRunner_leaderboard_v1";
const MAX_ENTRIES = 50;

/** @returns {{ name: string, avatarKey: string, score: number, at: number }[]} */
export function readLeaderboardEntries() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (row) =>
          row &&
          typeof row.name === "string" &&
          typeof row.avatarKey === "string" &&
          typeof row.score === "number" &&
          Number.isFinite(row.at),
      )
      .map((row) => ({
        name: row.name,
        avatarKey: row.avatarKey,
        score: Math.max(0, Math.floor(row.score)),
        at: row.at,
      }));
  } catch {
    return [];
  }
}

/**
 * @param {{ name: string, avatarKey: string, score: number }} entry
 * @returns {{ name: string, avatarKey: string, score: number, at: number }[]}
 */
export function appendLeaderboardEntry(entry) {
  const at = Date.now();
  const row = {
    name: entry.name,
    avatarKey: entry.avatarKey,
    score: Math.max(0, Math.floor(entry.score)),
    at,
  };
  const next = [...readLeaderboardEntries(), row]
    .sort((a, b) => b.score - a.score || b.at - a.at)
    .slice(0, MAX_ENTRIES);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore quota / private mode
  }
  return next;
}
