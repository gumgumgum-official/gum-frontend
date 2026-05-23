/**
 * 키오스크 소프트 리셋 ↔ Stage3 세션 브리지.
 * Three 캔버스는 /start 에서도 유지되므로, SPA 복귀 시 Stage3.setup() 이 다시 호출되지 않는다.
 */

/** @type {{ reset: () => void, begin: () => void } | null} */
let stage3KioskSessionApi = null;

/**
 * @param {{ reset: () => void, begin: () => void } | null} api
 */
export function registerStage3KioskSession(api) {
  stage3KioskSessionApi = api;
}

/** 소프트 리셋 직후: 편지·모니터·인트로 등 다음 이용자 전 상태 초기화 */
export function resetStage3KioskVisitorSession() {
  stage3KioskSessionApi?.reset?.();
}

/** `/kiosk` 진입 시: 모니터 폴링·카메라 인트로·편지 로드 재개 */
export function beginStage3KioskVisitorSession() {
  stage3KioskSessionApi?.begin?.();
}
