/**
 * Stage6 관련 window CustomEvent 이름 — 단일 정의 (오타·불일치 방지)
 */

export const STAGE6_FINISH_EVENT = "gum:kiosk-finish";

export const STAGE6_INT_CLICK_EVENT = "gum:stage6-int-click";

export const STAGE6_POSTER_MODAL_SHOW_EVENT = "gum:stage6PosterModal:show";
export const STAGE6_POSTER_MODAL_HIDE_EVENT = "gum:stage6PosterModal:hide";

export const STAGE6_PHOTOBOOTH_MODAL_SHOW_EVENT =
  "gum:stage6PhotoboothModal:show";
export const STAGE6_PHOTOBOOTH_MODAL_HIDE_EVENT =
  "gum:stage6PhotoboothModal:hide";

export const STAGE6_SUBTITLE_SHOW_EVENT = "gum:stage6-subtitle:show";
export const STAGE6_SUBTITLE_HIDE_EVENT = "gum:stage6-subtitle:hide";
export const STAGE6_SUBTITLE_SEQUENCE_EVENT = "gum:stage6-subtitle:sequence";

export const STAGE6_NAME_MODAL_SHOW_EVENT = "gum:stage6-name-modal:show";
export const STAGE6_NAME_MODAL_HIDE_EVENT = "gum:stage6-name-modal:hide";

export const STAGE6_BOARDING_RESET_EVENT = "gum:stage6-boarding:reset";
export const STAGE6_BOARDING_PASS_ISSUED_EVENT =
  "gum:stage6-boarding:pass-issued";
export const STAGE6_WALK_TO_ESCALATOR_EVENT = "gum:stage6-walk-to-escalator";
export const STAGE6_SCREEN_FADE_EVENT = "gum:stage6-screen-fade";

export const STAGE6_INTERACTION_LOCK_EVENT = "gum:stage6-interaction-lock";
export const STAGE6_INTERACTION_UNLOCK_EVENT = "gum:stage6-interaction-unlock";

export const AIRPORT_SUBTITLE_SHOW_EVENT =
  "gum:airportAnnouncementSubtitle:show";
export const AIRPORT_SUBTITLE_UPDATE_EVENT =
  "gum:airportAnnouncementSubtitle:update";
export const AIRPORT_SUBTITLE_HIDE_EVENT =
  "gum:airportAnnouncementSubtitle:hide";

export const AIRPORT_CHIME_SHOW_EVENT = "gum:airportAnnouncementChime:show";
export const AIRPORT_CHIME_HIDE_EVENT = "gum:airportAnnouncementChime:hide";

/** 공항 인트로(안내 자막) 종료 후 상단 HUD — `airport-chime-indicator` 스타일 */
export const STAGE6_INTRO_CLICK_HINT_EVENT = "gum:stage6IntroClickHint";

export const STAGE6_INTRO_CLICK_HINT_MESSAGE = "클릭해 보세요!";

/** 공항 안내 자막·방송 인트로 종료 — 입력 제한 토스트 정리용 */
export const STAGE6_INTRO_FINISHED_EVENT = "gum:stage6IntroFinished";

export const STAGE6_PHONE_INDICATOR_SHOW_EVENT =
  "gum:stage6-phone-indicator:show";
export const STAGE6_PHONE_INDICATOR_HIDE_EVENT =
  "gum:stage6-phone-indicator:hide";
/** @typedef {'ringing' | 'in-call'} Stage6PhoneIndicatorMode */
export const STAGE6_PHONE_INDICATOR_MODE_RINGING = "ringing";
export const STAGE6_PHONE_INDICATOR_MODE_IN_CALL = "in-call";

/** Stage6 오디오 unlock 완료 (인트로·띵동 재생 허용) */
export const STAGE6_AUDIO_UNLOCKED_EVENT = "gum:stage6AudioUnlocked";

/** 인트로·전화 중 등 입력 제한 시 상단 토스트 */
export const STAGE6_INPUT_BLOCKED_EVENT = "gum:stage6InputBlocked";

/** @deprecated `STAGE6_INPUT_BLOCKED_EVENT` 사용 */
export const STAGE6_INTRO_INPUT_BLOCKED_EVENT = STAGE6_INPUT_BLOCKED_EVENT;

/** @typedef {'move' | 'click'} Stage6InputBlockedKind */
/** @typedef {'intro' | 'phone-in-call'} Stage6InputBlockedReason */

/** @type {Record<Stage6InputBlockedReason, Record<Stage6InputBlockedKind, string>>} */
const STAGE6_INPUT_BLOCKED_MESSAGES = {
  intro: {
    move: "⚠️ 인트로가 다 끝나면 움직일 수 있어요!",
    click: "⚠️ 인트로가 다 끝나면 클릭할 수 있어요",
  },
  "phone-in-call": {
    move: "⚠️ 전화가 끝나면 움직일 수 있어요!",
    click: "⚠️ 전화가 끝나면 클릭할 수 있어요",
  },
};

/**
 * @param {Stage6InputBlockedReason} reason
 * @param {Stage6InputBlockedKind} kind
 */
export function dispatchStage6InputBlocked(reason, kind) {
  const text = STAGE6_INPUT_BLOCKED_MESSAGES[reason]?.[kind];
  if (!text) return;
  window.dispatchEvent(
    new CustomEvent(STAGE6_INPUT_BLOCKED_EVENT, {
      detail: { reason, kind, text },
    }),
  );
}

/** @deprecated `dispatchStage6InputBlocked` 사용 */
export function dispatchStage6IntroInputBlocked(kind) {
  dispatchStage6InputBlocked("intro", kind);
}
