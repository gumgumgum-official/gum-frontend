/**
 * Stage3 키보드 입력 — 스탬프 토글·ENTER 타격·0키 재낙하
 */
import { STAGE3_MOVEMENT_KEY_CODES } from "../../../../config/stages/stage3/stage3Keyboard.js";
import { notifyStage3IntroInputBlocked } from "../stage3IntroInputBlockedNotify.js";

/**
 * @param {KeyboardEvent} event
 */
function isStage3MovementKey(event) {
  return (
    STAGE3_MOVEMENT_KEY_CODES.includes(event.key) ||
    STAGE3_MOVEMENT_KEY_CODES.includes(event.code)
  );
}

/**
 * @param {{
 *   hasBlockingOverlayOpen: () => boolean,
 *   isStampIntroAnimating: () => boolean,
 *   isInteractionLocked: () => boolean,
 *   isIntroPresentationLocked: () => boolean,
 *   onStampKeyToggle: () => void,
 *   onEnterHit: () => void,
 *   onResetLetterFall: () => void,
 *   isCharacterPunching: () => boolean,
 * }} params
 */
export function createStage3InputController({
  hasBlockingOverlayOpen,
  isStampIntroAnimating,
  isInteractionLocked,
  isIntroPresentationLocked,
  onStampKeyToggle,
  onEnterHit,
  onResetLetterFall,
  isCharacterPunching,
}) {
  /**
   * @param {KeyboardEvent} event
   */
  function handleStageKeyDown(event) {
    if (isIntroPresentationLocked()) {
      if (isStage3MovementKey(event)) {
        notifyStage3IntroInputBlocked("move");
        event.preventDefault();
        return;
      }
      if (event.key === "Enter") {
        notifyStage3IntroInputBlocked("click");
        event.preventDefault();
        return;
      }
    }
    if (event.key === "m" || event.key === "M" || event.code === "KeyM") {
      event.preventDefault();
      onStampKeyToggle();
      return;
    }
    if (
      hasBlockingOverlayOpen() ||
      isStampIntroAnimating() ||
      isInteractionLocked()
    ) {
      if (event.key === "Enter") event.preventDefault();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (!isCharacterPunching()) onEnterHit();
      return;
    }
    if (event.key === "0" || event.code === "Digit0") {
      event.preventDefault();
      onResetLetterFall();
    }
  }

  function mount() {
    window.addEventListener("keydown", handleStageKeyDown, { capture: true });
  }

  function unmount() {
    window.removeEventListener("keydown", handleStageKeyDown, {
      capture: true,
    });
  }

  return {
    handleStageKeyDown,
    mount,
    unmount,
  };
}
