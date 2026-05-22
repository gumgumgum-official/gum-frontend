/** 키오스크 운영·복구용 window CustomEvent */

/** F5 없이 UI·세션을 초기화할 때 (모달·텐트 인트로 플래그 등) */
export const KIOSK_SOFT_RESTART_EVENT = "gum:kiosk-soft-restart";

/** 체험 완료·소프트 리셋 후 다음 이용자 — React 오버레이(껌 카드 등) 상태 초기화 */
export const KIOSK_NEW_VISITOR_EVENT = "gum:kiosk-new-visitor";

export function dispatchKioskNewVisitorUiReset() {
  window.dispatchEvent(new CustomEvent(KIOSK_NEW_VISITOR_EVENT));
}
