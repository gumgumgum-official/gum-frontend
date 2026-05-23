import { fetchWithRetry } from "./fetchWithRetry.js";

function getGumServerBaseUrl() {
  const raw =
    import.meta.env.VITE_GUM_SERVER_URL || window.location.origin || "";
  return String(raw).replace(/\/$/, "");
}

/**
 * @param {string} userId
 * @param {number} score
 * @returns {Promise<{ ok: boolean, userId: string, score: number }>}
 * @throws {{ message: string, status: number }} HTTP 오류 시 throw
 */
export async function postScore(userId, score) {
  const base = getGumServerBaseUrl();
  const res = await fetchWithRetry(`${base}/api/scores`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, score }),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  if (!res.ok) {
    const message =
      typeof json?.error === "string" && json.error.trim()
        ? json.error
        : `점수 등록 실패 (HTTP ${res.status})`;
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }
  return json;
}

/**
 * @returns {Promise<{ id: number, userId: string, totalScore: number }[]>}
 */
export async function fetchLeaderboard() {
  const base = getGumServerBaseUrl();
  if (!base) return [];
  try {
    const res = await fetchWithRetry(`${base}/api/scores/leaderboard`, {
      headers: { Accept: "application/json" },
      idempotent: true,
    });
    if (!res.ok) {
      console.warn("[scoreApi] GET /api/scores/leaderboard 실패:", res.status);
      return [];
    }
    const json = await res.json();
    return Array.isArray(json?.leaderboard) ? json.leaderboard : [];
  } catch (e) {
    console.warn("[scoreApi] GET /api/scores/leaderboard 오류:", e);
    return [];
  }
}
