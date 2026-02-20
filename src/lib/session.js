/**
 * 세션 ID 관리
 * 우선순위: URL 파라미터 > 환경변수 > 기본값
 */

/**
 * 세션 ID 가져오기
 * @returns {string}
 */
export function getSessionId() {
  // URL 파라미터 확인
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    const urlSessionId = params.get("session") || params.get("sessionId");
    if (urlSessionId) {
      return urlSessionId;
    }
  }

  // 환경변수 또는 기본값
  return import.meta.env.VITE_DEFAULT_SESSION_ID || "exhibition-2026";
}

/**
 * 세션 ID 설정 (URL 파라미터로 변경)
 * @param {string} sessionId
 */
export function setSessionId(sessionId) {
  if (typeof window === "undefined") return;

  const url = new URL(window.location.href);
  url.searchParams.set("session", sessionId);
  window.history.replaceState({}, "", url.toString());
}
