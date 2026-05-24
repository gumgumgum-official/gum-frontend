import { getSessionId } from "./session.js";
import { fetchWithRetry } from "./fetchWithRetry.js";

/** 게시판 껌딱지 투표 UX용 — `:${getSessionId()}` 접미로 localStorage 에 저장됨 */
export const GGUMDDI_MY_VOTE_STORAGE_PREFIX = "gum-ggumddi-my-vote";

/** ?monitor=N 파라미터를 읽어 모니터별 스토리지 키 접미사를 반환 */
function getMonitorSuffix() {
  if (typeof window === "undefined") return "";
  const m = new URLSearchParams(window.location.search).get("monitor");
  return m ? `:m${m}` : "";
}

/** clientId 저장 키 — prefix 아래에 두어 kiosk 리셋 시 자동 삭제됨. 모니터별로 분리됨 */
export function getVoteClientIdStorageKey() {
  return `${GGUMDDI_MY_VOTE_STORAGE_PREFIX}:clientId${getMonitorSuffix()}`;
}

/** 다음 이용자에게 '이미 투표함' 상태가 새지 않도록 해당 키만 제거 */
export function clearGgumddiMyVotesFromLocalStorage() {
  if (typeof window === "undefined" || !window.localStorage) return;
  const prefix = `${GGUMDDI_MY_VOTE_STORAGE_PREFIX}:`;
  const keys = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const k = window.localStorage.key(i);
    if (k != null && k.startsWith(prefix)) keys.push(k);
  }
  for (const k of keys) window.localStorage.removeItem(k);
}

/** 기존 clientId를 반환하거나 새 UUID를 생성·저장해 반환 */
export function getOrCreateVoteClientId() {
  const key = getVoteClientIdStorageKey();
  try {
    const stored = localStorage.getItem(key);
    if (stored && stored.trim()) return stored.trim();
    const id = window.crypto.randomUUID();
    localStorage.setItem(key, id);
    return id;
  } catch {
    return window.crypto.randomUUID();
  }
}

/** 서버 응답 clientId를 localStorage에 저장 */
export function saveVoteClientId(clientId) {
  try {
    localStorage.setItem(getVoteClientIdStorageKey(), clientId);
  } catch {
    /* ignore */
  }
}

/** 원격 예: .env 의 VITE_GUM_SERVER_URL. 미설정 시 Vite 오리진 폴백 → 로컬에 백이 없으면 실패(.env.example, vite 프록시 참고). */
function getGumServerBaseUrl() {
  const raw =
    import.meta.env.VITE_GUM_SERVER_URL || window.location.origin || "";
  return String(raw).replace(/\/$/, "");
}

/**
 * @typedef {{ candidate1?: number, candidate2?: number, candidate3?: number }} VoteResultsRaw
 * @typedef {{ votes: { 1: number, 2: number, 3: number }, totalVotes: number, updatedAt: string | null }} VoteAggregate
 */

/**
 * @param {VoteResultsRaw | undefined} results
 */
function normalizeVotes(results) {
  return {
    1: Number.isFinite(results?.candidate1) ? Number(results.candidate1) : 0,
    2: Number.isFinite(results?.candidate2) ? Number(results.candidate2) : 0,
    3: Number.isFinite(results?.candidate3) ? Number(results.candidate3) : 0,
  };
}

/**
 * @param {any} payload
 * @returns {VoteAggregate}
 */
function normalizeAggregate(payload) {
  const votes = normalizeVotes(payload?.results);
  const totalFromResults = votes[1] + votes[2] + votes[3];
  return {
    votes,
    totalVotes: Number.isFinite(payload?.totalVotes)
      ? Number(payload.totalVotes)
      : totalFromResults,
    updatedAt:
      typeof payload?.updatedAt === "string" && payload.updatedAt.trim()
        ? payload.updatedAt
        : null,
  };
}

/**
 * @param {string} clientId
 * @returns {Promise<1 | 2 | 3 | null>}
 */
export async function fetchMyVote(clientId) {
  const base = getGumServerBaseUrl();
  const res = await fetchWithRetry(
    `${base}/api/votes/my?clientId=${encodeURIComponent(clientId)}`,
    { headers: { Accept: "application/json" }, idempotent: true },
  );
  if (!res.ok) {
    throw new Error(`내 투표 조회 실패 (HTTP ${res.status})`);
  }
  const json = await res.json();
  const c = json?.candidate;
  return c === 1 || c === 2 || c === 3 ? c : null;
}

/**
 * @returns {Promise<VoteAggregate>}
 */
export async function fetchVoteResults() {
  const base = getGumServerBaseUrl();
  const res = await fetchWithRetry(`${base}/api/votes/results`, {
    method: "GET",
    headers: { Accept: "application/json" },
    idempotent: true,
  });
  if (!res.ok) {
    throw new Error(`투표 집계 조회 실패 (HTTP ${res.status})`);
  }
  const json = await res.json();
  return normalizeAggregate(json);
}

/**
 * @param {1 | 2 | 3} candidate
 * @param {{ sessionId?: string, clientId?: string }} [opts]
 * @returns {Promise<VoteAggregate & { selectedCandidate: 1 | 2 | 3 | null }>}
 */
export async function postVote(candidate, opts = {}) {
  const base = getGumServerBaseUrl();
  const body = { candidate };
  const sessionId = opts.sessionId ?? getSessionId();
  if (sessionId) body.sessionId = sessionId;
  if (opts.clientId) body.clientId = opts.clientId;

  const res = await fetchWithRetry(`${base}/api/votes`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
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
        : `투표 등록 실패 (HTTP ${res.status})`;
    const err = new Error(message);
    // @ts-expect-error - attach status for UI decisions
    err.status = res.status;
    throw err;
  }

  const aggregate = normalizeAggregate(json);
  const selectedCandidate =
    json?.selectedCandidate === 1 ||
    json?.selectedCandidate === 2 ||
    json?.selectedCandidate === 3
      ? json.selectedCandidate
      : null;
  return { ...aggregate, selectedCandidate };
}

/**
 * @param {{ sessionId?: string, clientId?: string }} [opts]
 * @returns {Promise<VoteAggregate>}
 */
export async function deleteMyVote(opts = {}) {
  const base = getGumServerBaseUrl();
  const body = {};
  const sessionId = opts.sessionId ?? getSessionId();
  if (sessionId) body.sessionId = sessionId;
  if (opts.clientId) body.clientId = opts.clientId;
  const res = await fetchWithRetry(`${base}/api/votes/my`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
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
        : `투표 취소 실패 (HTTP ${res.status})`;
    throw new Error(message);
  }
  const aggregate = normalizeAggregate(json);
  return aggregate;
}

/**
 * @param {1 | 2 | 3} candidate
 * @param {{ sessionId?: string, clientId?: string }} [opts]
 * @returns {Promise<VoteAggregate & { selectedCandidate: 1 | 2 | 3 | null }>}
 */
export async function updateMyVote(candidate, opts = {}) {
  const base = getGumServerBaseUrl();
  const body = { candidate };
  const sessionId = opts.sessionId ?? getSessionId();
  if (sessionId) body.sessionId = sessionId;
  if (opts.clientId) body.clientId = opts.clientId;
  const res = await fetchWithRetry(`${base}/api/votes/my`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
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
        : `투표 변경 실패 (HTTP ${res.status})`;
    throw new Error(message);
  }
  const aggregate = normalizeAggregate(json);
  const selectedCandidate =
    json?.selectedCandidate === 1 ||
    json?.selectedCandidate === 2 ||
    json?.selectedCandidate === 3
      ? json.selectedCandidate
      : null;
  return { ...aggregate, selectedCandidate };
}
