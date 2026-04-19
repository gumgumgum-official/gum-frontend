/**
 * 실행 환경 감지 (UA 등)
 */

/**
 * Cursor / Electron 등 임베디드 웹뷰 — 일반 Chrome 대비 GPU·합성 성능이 낮은 경우가 많아
 * 렌더러/재질 쪽에서 보수적으로 다룰 때 사용.
 *
 * @param {string} [userAgent] - 생략 시 `window.navigator.userAgent` (없으면 빈 문자열)
 * @returns {boolean}
 */
export function isElectronLikeUserAgent(userAgent) {
  const ua =
    typeof userAgent === "string"
      ? userAgent
      : typeof window !== "undefined" && window.navigator?.userAgent
        ? window.navigator.userAgent
        : "";
  return /Electron|Cursor/i.test(ua);
}
