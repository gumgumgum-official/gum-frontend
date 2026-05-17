/**
 * Stage3 키보드 입력 — 스탬프 토글·ENTER 타격·0키 재낙하
 */

/**
 * @param {{
 *   hasBlockingOverlayOpen: () => boolean,
 *   isStampIntroAnimating: () => boolean,
 *   isInteractionLocked: () => boolean,
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
  onStampKeyToggle,
  onEnterHit,
  onResetLetterFall,
  isCharacterPunching,
}) {
  /**
   * @param {KeyboardEvent} event
   */
  function handleStageKeyDown(event) {
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
      if (isCharacterPunching()) return;
      onEnterHit();
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
