/**
 * Stage3 모달 오버레이 상태·열기/닫기·이동 입력 잠금
 */
import { pauseStage3BackgroundAmbientForOverlay } from "../../../common/stage3IntroAudio.js";
import { playRandomNoticePaperSound } from "../playNoticePaperSound.js";
import { NOTICE_MODAL_USER_CLOSED_EVENT } from "../../../../config/stages/stage3/stage3Overlay.js";
import { onGumCardsModalClose } from "../gumCardsModalLauncher.js";

/**
 * @param {{
 *   getConfig: () => import("../../../../types.js").Stage3Config,
 *   getKeyboardKeys: () => Record<string, boolean>,
 *   hideInteractionBubbles: () => void,
 *   syncStampPanelVisibilityByOverlay: () => void,
 *   flushQueuedStampStepOnModalClose: (step: "notice" | "gameMachine" | "tent") => void,
 *   flushPendingEggDiscoverySubtitle: () => void,
 *   isStampPosterZoomOpen: () => boolean,
 * }} params
 */
export function createStage3OverlayController({
  getConfig,
  getKeyboardKeys,
  hideInteractionBubbles,
  syncStampPanelVisibilityByOverlay,
  flushQueuedStampStepOnModalClose,
  flushPendingEggDiscoverySubtitle,
  isStampPosterZoomOpen,
}) {
  let isNoticeModalOpen = false;
  let isGameMachineModalOpen = false;
  let isTentModalOpen = false;
  /** @type {(() => void) | null} */
  let unlistenGumCardsForEggSubtitle = null;

  function clearMovementInputs() {
    const keys = getKeyboardKeys();
    for (const k of Object.keys(keys)) {
      keys[k] = false;
    }
  }

  function hasExternalOverlayOpen() {
    return isNoticeModalOpen || isGameMachineModalOpen || isTentModalOpen;
  }

  function hasBlockingOverlayOpen() {
    return hasExternalOverlayOpen() || isStampPosterZoomOpen();
  }

  function showNoticeModal() {
    isNoticeModalOpen = true;
    clearMovementInputs();
    hideInteractionBubbles();
    syncStampPanelVisibilityByOverlay();
    playRandomNoticePaperSound(getConfig().notice?.paperSoundPaths);
    window.dispatchEvent(new CustomEvent("gum:showNoticeModal"));
  }

  function showGameMachineModal() {
    isGameMachineModalOpen = true;
    clearMovementInputs();
    hideInteractionBubbles();
    syncStampPanelVisibilityByOverlay();
    pauseStage3BackgroundAmbientForOverlay();
    window.dispatchEvent(new CustomEvent("gum:showGameMachineModal"));
  }

  function onOpenTentModal() {
    isTentModalOpen = true;
    clearMovementInputs();
    hideInteractionBubbles();
    syncStampPanelVisibilityByOverlay();
  }

  function onGameMachineModalClose() {
    isGameMachineModalOpen = false;
  }

  function handleNoticeModalClosedForEggSubtitle() {
    isNoticeModalOpen = false;
    hideInteractionBubbles();
    flushQueuedStampStepOnModalClose("notice");
    syncStampPanelVisibilityByOverlay();
    flushPendingEggDiscoverySubtitle();
  }

  function bindSetupListeners() {
    window.addEventListener(
      NOTICE_MODAL_USER_CLOSED_EVENT,
      handleNoticeModalClosedForEggSubtitle,
    );
    unlistenGumCardsForEggSubtitle = onGumCardsModalClose(() => {
      isTentModalOpen = false;
      hideInteractionBubbles();
      flushQueuedStampStepOnModalClose("tent");
      syncStampPanelVisibilityByOverlay();
      flushPendingEggDiscoverySubtitle();
    });
  }

  function unbindSetupListeners() {
    window.removeEventListener(
      NOTICE_MODAL_USER_CLOSED_EVENT,
      handleNoticeModalClosedForEggSubtitle,
    );
    if (unlistenGumCardsForEggSubtitle) {
      unlistenGumCardsForEggSubtitle();
      unlistenGumCardsForEggSubtitle = null;
    }
  }

  function resetForCleanup() {
    isNoticeModalOpen = false;
    isGameMachineModalOpen = false;
    isTentModalOpen = false;
  }

  return {
    showNoticeModal,
    showGameMachineModal,
    onOpenTentModal,
    onGameMachineModalClose,
    hasExternalOverlayOpen,
    hasBlockingOverlayOpen,
    clearMovementInputs,
    bindSetupListeners,
    unbindSetupListeners,
    resetForCleanup,
  };
}
