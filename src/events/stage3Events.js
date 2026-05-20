/**
 * Stage3 관련 window CustomEvent 이름 — 단일 정의 (오타·불일치 방지)
 */

/** 섬 walkable 경계 밖으로 이동 시도 시 상단 토스트 */
export const STAGE3_ISLAND_EXIT_BLOCKED_EVENT = "gum:stage3IslandExitBlocked";

export function dispatchStage3IslandExitBlocked() {
  window.dispatchEvent(new CustomEvent(STAGE3_ISLAND_EXIT_BLOCKED_EVENT));
}
