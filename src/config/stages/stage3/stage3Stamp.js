/** Stage3 스탬프 투어·이스터에그 상수 */

export const STAMP_POSTER_IMAGE_PATH = "/assets/poster/stamp_poster.png";

/** 화면 중앙 포스터 페이드·스케일 인 */
export const STAGE3_STAMP_INTRO_CENTER_IN_MS = 720;
export const STAGE3_STAMP_INTRO_HOLD_MS = 2000;
export const STAGE3_STAMP_INTRO_FLY_MS = 780;

/** 배경 준비 후 진입 자막 시퀀스 시작까지 대기(ms) — 카메라 인트로는 즉시 */
export const STAGE3_ENTRY_SUBTITLE_START_DELAY_MS = 1500;

/** Stage6BoardingOverlay `runSubtitleSequence`와 동일: hold + fade(600) + gap(200) × 구간 */
export const STAGE3_ENTRY_SUBTITLE_TOTAL_MS = 2500 + 600 + 200 + 2000 + 600;

/** 진입 연출 종료 후 이동 안내 상단 토스트까지 대기(ms) */
export const STAGE3_ENTRY_MOVEMENT_HINT_DELAY_MS = 1000;

export const REQUIRED_EGG_COUNT = 3;

export const MAIN_EASTER_EGG_CANONICAL = [
  "INT_notice",
  "INT_gameMachine",
  "INT_icecream",
  "INT_Tent",
];

/** @type {Record<string, string>} */
export const RAY_TARGET_TO_EGG_KEY = {
  notice: "INT_notice",
  gameMachine: "INT_gameMachine",
  icecream: "INT_icecream",
  tent: "INT_Tent",
};
