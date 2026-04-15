/**
 * gum_server 모니터 REST
 * - 흐름: POST .../start → GET .../current 폴링 → POST .../complete
 * @see 요구사항.md, docs/MONITOR_USER_FLOW.md
 */

/** 모니터 현재 할당 폴링 간격 (ms) — Stage3와 동일 */
export const MONITOR_POLL_MS = 1500;

const JSON_EMPTY = "{}";

export function normalizeMonitorDeviceId(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return "monitor-1";
  if (s === "1" || s === "monitor-1") return "monitor-1";
  if (s === "2" || s === "monitor-2") return "monitor-2";
  if (s === "monitor-1" || s === "monitor-2") return s;
  return "monitor-1";
}

export function getGumServerBaseUrl() {
  const raw =
    import.meta.env.VITE_GUM_SERVER_URL || window.location.origin || "";
  return String(raw).replace(/\/$/, "");
}

export function getMonitorDeviceId() {
  const params = new URLSearchParams(window.location.search);
  const qsMonitor = params.get("monitor") || params.get("monitorId");
  return normalizeMonitorDeviceId(
    import.meta.env.VITE_MONITOR_DEVICE || qsMonitor || "monitor-1",
  );
}

/**
 * busy 응답의 worry로 도착 토스트 문구 생성 (필드 규칙은 Stage3 applyMonitorBusyWorry와 동일)
 * @param {object} worry
 * @returns {string | null}
 */
export function getMonitorArrivalMessage(worry) {
  if (!worry) return null;
  const seq = worry.displaySeq ?? worry.seq;
  if (typeof seq === "number" && Number.isInteger(seq) && seq >= 1) {
    return `${seq}번째 고민이 도착했습니다`;
  }
  return "고민이 도착했습니다";
}

/**
 * @returns {Promise<object | null>} JSON 본문, HTTP 오류 시 null
 */
export async function fetchMonitorCurrent() {
  const base = getGumServerBaseUrl();
  const monitorId = getMonitorDeviceId();
  const url = `${base}/api/monitors/${encodeURIComponent(monitorId)}/current`;
  const res = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    console.warn("[monitor current] HTTP 오류:", res.status);
    return null;
  }
  return res.json();
}

/**
 * 서버 상태 조회 (디버깅/운영 보조)
 * - API.md의 GET /status 응답에는 reservedWorry가 포함될 수 있음
 * @returns {Promise<object | null>}
 */
export async function fetchGumServerStatus() {
  const base = getGumServerBaseUrl();
  const url = `${base}/status`;
  const res = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    console.warn("[gum status] HTTP 오류:", res.status);
    return null;
  }
  return res.json();
}

/**
 * 체험 시작 — 이후 GET /current에서 busy + worry 가능
 * POST /api/monitors/:monitorId/start
 * @returns {Promise<boolean>} 성공 여부
 */
export async function postMonitorStart() {
  const base = getGumServerBaseUrl();
  const monitorId = getMonitorDeviceId();
  const url = `${base}/api/monitors/${encodeURIComponent(monitorId)}/start`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON_EMPTY,
  });
  if (!res.ok) {
    console.warn("[monitor start] HTTP 오류:", res.status);
    return false;
  }
  return true;
}

/**
 * 체험 완료 — 시작 화면 복귀 시
 * POST /api/monitors/:monitorId/complete
 * @returns {Promise<boolean>} 성공 여부
 */
export async function postMonitorComplete() {
  const base = getGumServerBaseUrl();
  const monitorId = getMonitorDeviceId();
  const url = `${base}/api/monitors/${encodeURIComponent(monitorId)}/complete`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON_EMPTY,
  });
  if (!res.ok) {
    console.warn("[monitor complete] HTTP 오류:", res.status);
    return false;
  }
  return true;
}
