import { getSessionId } from "./session.js";

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
 * @returns {Promise<VoteAggregate>}
 */
export async function fetchVoteResults() {
  const base = getGumServerBaseUrl();
  const res = await fetch(`${base}/api/votes/results`, {
    method: "GET",
    headers: { Accept: "application/json" },
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

  const res = await fetch(`${base}/api/votes`, {
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

// TODO: 투표 변경/취소 기능 구현 후 GgumddiVoteSection.tsx에서 호출 예정
//       (deleteMyVote: 취소, updateMyVote: 후보 변경)
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
  const res = await fetch(`${base}/api/votes/my`, {
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
  const res = await fetch(`${base}/api/votes/my`, {
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
