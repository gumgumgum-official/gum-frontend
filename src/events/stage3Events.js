/**
 * Stage3 관련 window CustomEvent 이름 — 단일 정의 (오타·불일치 방지)
 */

/** 섬 walkable 경계 밖으로 이동 시도 시 상단 토스트 */
export const STAGE3_ISLAND_EXIT_BLOCKED_EVENT = "gum:stage3IslandExitBlocked";

/** 진입 인트로·자막·포스터 연출 중 클릭·이동 시도 시 상단 토스트 */
export const STAGE3_INTRO_INPUT_BLOCKED_EVENT = "gum:stage3IntroInputBlocked";

/** 진입 연출(카메라·자막·포스터) 종료 후 이동 안내 상단 토스트 */
export const STAGE3_INTRO_MOVEMENT_HINT_EVENT = "gum:stage3IntroMovementHint";

export const STAGE3_INTRO_MOVEMENT_HINT_MESSAGE =
  "방향키, wasd로 캐릭터를 움직여 보세요!";

/** @type {Record<"click" | "move", string>} */
export const STAGE3_INTRO_INPUT_BLOCKED_MESSAGES = {
  click: "⚠️ 인트로가 다 끝나면 클릭할 수 있어요",
  move: "⚠️ 인트로가 다 끝나면 움직일 수 있어요",
};

export function dispatchStage3IslandExitBlocked() {
  window.dispatchEvent(new CustomEvent(STAGE3_ISLAND_EXIT_BLOCKED_EVENT));
}

/** @param {"click" | "move"} kind */
export function dispatchStage3IntroInputBlocked(kind) {
  window.dispatchEvent(
    new CustomEvent(STAGE3_INTRO_INPUT_BLOCKED_EVENT, {
      detail: {
        kind,
        message: STAGE3_INTRO_INPUT_BLOCKED_MESSAGES[kind],
      },
    }),
  );
}

export function dispatchStage3IntroMovementHint() {
  window.dispatchEvent(
    new CustomEvent(STAGE3_INTRO_MOVEMENT_HINT_EVENT, {
      detail: { message: STAGE3_INTRO_MOVEMENT_HINT_MESSAGE },
    }),
  );
}
