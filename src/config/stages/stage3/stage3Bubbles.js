/** Stage3 DOM 말풍선(고민 ENTER 힌트 등) */

/** ENTER 말풍선 표시 거리 — 상호작용보다 넓게 */
export const WORRY_ENTER_HINT_DIST = 7.5;
export const STAGE3_USER_ENTER_BUBBLE_SHOW_SEC = 3.6;
export const STAGE3_USER_ENTER_BUBBLE_GAP_SEC = 4.0;

/** 이동 안내 토스트 페이드인 — App `stage3-island-exit-toast` opacity transition과 동일 */
export const STAGE3_INTRO_MOVEMENT_HINT_TOAST_FADE_MS = 400;

/** 이동 안내 토스트가 다 보인 뒤 고민 ENTER 말풍선 허용까지 대기(ms) */
export const STAGE3_WORRY_ENTER_BUBBLE_AFTER_MOVEMENT_HINT_MS = 2500;

/** 고민 ENTER 힌트 말풍선 — 표시 시 랜덤 선택 */
export const STAGE3_WORRY_ENTER_BUBBLE_MESSAGES = [
  "앞에 있는 엔터 쿠션을 마구 두들겨 주세요! 🔨",
  "엔터키를 세게 때려서 걱정을 부셔버려요~!",
];
