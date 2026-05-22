/**
 * 키오스크 운영 복구: F5 없이 모달·오디오 정리 후 /start 로 SPA 복귀.
 * GLB 메모리 캐시는 유지한다.
 */

import {
  dispatchKioskNewVisitorUiReset,
  KIOSK_SOFT_RESTART_EVENT,
} from "../../events/kioskEvents.js";
import {
  AIRPORT_CHIME_HIDE_EVENT,
  STAGE6_BOARDING_RESET_EVENT,
  STAGE6_NAME_MODAL_HIDE_EVENT,
  STAGE6_PHONE_INDICATOR_HIDE_EVENT,
  STAGE6_PHOTOBOOTH_MODAL_HIDE_EVENT,
  STAGE6_POSTER_MODAL_HIDE_EVENT,
  STAGE6_SUBTITLE_HIDE_EVENT,
} from "../../events/stage6Events.js";
import { postMonitorComplete } from "../../lib/monitorCurrentApi.js";
import { getGLBLoader } from "./assetLoaders.js";
import { warmKioskExhibitionAssets } from "./kioskExhibitionWarmup.js";
import { resetClientForNextKioskVisitor } from "./resetClientForNextKioskVisitor.js";
import { resetStage3KioskVisitorSession } from "../stages/stage3/stage3KioskSession.js";
import { stopStartPageIntroBgm } from "./startPageIntroAudio.js";
import { stopStage3IntroAudio } from "./stage3IntroAudio.js";
import {
  dispatchStage3GameMachineModalClose,
  dispatchStage3NoticeModalClose,
} from "../../events/stage3Events.js";
import {
  dispatchGumCardsModalClose,
  stopTentModalBgm,
} from "../stages/stage3/gumCardsModalLauncher.js";
import { dispatchMinigameClose } from "../stages/stage3/minigameLauncher.js";

/** 우측 상단 연속 탭: 횟수·허용 시간(ms) */
export const KIOSK_SOFT_RESTART_CORNER_TAP_COUNT = 5;
export const KIOSK_SOFT_RESTART_CORNER_TAP_WINDOW_MS = 2000;

let restartInFlight = false;

/** 소프트 리셋·/start 복귀 시 키오스크·인트로 BGM 일괄 정지 */
export function stopKioskExhibitionAudio() {
  stopStage3IntroAudio();
  stopTentModalBgm();
  stopStartPageIntroBgm();
}

export function dispatchKioskSoftRestartUiCleanup() {
  // 모달 close 이벤트가 Stage3 배경음을 resume 하기 전에 먼저 정지
  stopKioskExhibitionAudio();
  resetStage3KioskVisitorSession();
  dispatchKioskNewVisitorUiReset();
  window.dispatchEvent(new CustomEvent(KIOSK_SOFT_RESTART_EVENT));
  dispatchStage3NoticeModalClose();
  dispatchStage3GameMachineModalClose();
  window.dispatchEvent(new CustomEvent(STAGE6_POSTER_MODAL_HIDE_EVENT));
  window.dispatchEvent(new CustomEvent(STAGE6_PHOTOBOOTH_MODAL_HIDE_EVENT));
  window.dispatchEvent(new CustomEvent(STAGE6_NAME_MODAL_HIDE_EVENT));
  window.dispatchEvent(new CustomEvent(STAGE6_BOARDING_RESET_EVENT));
  window.dispatchEvent(new CustomEvent(STAGE6_SUBTITLE_HIDE_EVENT));
  window.dispatchEvent(new CustomEvent(AIRPORT_CHIME_HIDE_EVENT));
  window.dispatchEvent(new CustomEvent(STAGE6_PHONE_INDICATOR_HIDE_EVENT));
  dispatchMinigameClose();
  dispatchGumCardsModalClose();
}

/**
 * @param {{ notifyServer?: boolean }} [options]
 * @returns {Promise<void>}
 */
export async function performKioskSoftRestart(options = {}) {
  const { notifyServer = true } = options;
  if (restartInFlight) return;
  restartInFlight = true;
  try {
    dispatchKioskSoftRestartUiCleanup();
    if (notifyServer) {
      try {
        await postMonitorComplete();
      } catch (e) {
        console.warn("[kioskSoftRestart] monitor complete 실패:", e);
      }
    }
    await resetClientForNextKioskVisitor();
    getGLBLoader().preloadDecoders();
    warmKioskExhibitionAssets({ priority: "immediate" });
  } finally {
    restartInFlight = false;
  }
}
