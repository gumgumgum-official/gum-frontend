/**
 * 키오스크 운영 복구: F5 없이 모달·오디오 정리 후 /start 로 SPA 복귀.
 * GLB 메모리 캐시는 유지한다.
 */

import { KIOSK_SOFT_RESTART_EVENT } from "../../events/kioskEvents.js";
import {
  AIRPORT_CHIME_HIDE_EVENT,
  STAGE6_PHONE_INDICATOR_HIDE_EVENT,
  STAGE6_PHOTOBOOTH_MODAL_HIDE_EVENT,
  STAGE6_POSTER_MODAL_HIDE_EVENT,
  STAGE6_SUBTITLE_HIDE_EVENT,
} from "../../events/stage6Events.js";
import { postMonitorComplete } from "../../lib/monitorCurrentApi.js";
import { getGLBLoader } from "./assetLoaders.js";
import { warmKioskExhibitionAssets } from "./kioskExhibitionWarmup.js";
import { resetClientForNextKioskVisitor } from "./resetClientForNextKioskVisitor.js";
import { stopStage3IntroAudio } from "./stage3IntroAudio.js";
import {
  dispatchGumCardsModalClose,
  stopTentModalBgm,
} from "../stages/stage3/gumCardsModalLauncher.js";
import { dispatchMinigameClose } from "../stages/stage3/minigameLauncher.js";

/** 운영자 복구 단축키 (키오스크 라우트에서만, capture 단계) */
export const KIOSK_SOFT_RESTART_SHORTCUT_LABEL = "F8";

/** @type {(() => void) | null} */
let softRestartRequestHandler = null;

let restartInFlight = false;

/**
 * @param {string} pathname
 * @returns {boolean}
 */
export function isKioskExhibitionPath(pathname) {
  const p = pathname.replace(/\/$/, "") || "/";
  return (
    p === "/start" ||
    p.endsWith("/start") ||
    p === "/kiosk" ||
    p.endsWith("/kiosk") ||
    p === "/airport" ||
    p.endsWith("/airport")
  );
}

/**
 * App에서 navigate 포함 전체 복구 핸들러 등록
 * @param {(() => void) | null} handler
 */
export function setKioskSoftRestartRequestHandler(handler) {
  softRestartRequestHandler = handler;
}

export function dispatchKioskSoftRestartUiCleanup() {
  window.dispatchEvent(new CustomEvent(KIOSK_SOFT_RESTART_EVENT));
  window.dispatchEvent(new CustomEvent("gum:closeNoticeModal"));
  window.dispatchEvent(new CustomEvent("gum:closeGameMachineModal"));
  window.dispatchEvent(new CustomEvent(STAGE6_POSTER_MODAL_HIDE_EVENT));
  window.dispatchEvent(new CustomEvent(STAGE6_PHOTOBOOTH_MODAL_HIDE_EVENT));
  window.dispatchEvent(new CustomEvent(STAGE6_SUBTITLE_HIDE_EVENT));
  window.dispatchEvent(new CustomEvent(AIRPORT_CHIME_HIDE_EVENT));
  window.dispatchEvent(new CustomEvent(STAGE6_PHONE_INDICATOR_HIDE_EVENT));
  dispatchMinigameClose();
  dispatchGumCardsModalClose();
  stopTentModalBgm();
  stopStage3IntroAudio();
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

/**
 * @param {KeyboardEvent} event
 * @returns {boolean}
 */
export function isKioskSoftRestartShortcut(event) {
  if (event.ctrlKey || event.shiftKey || event.altKey || event.metaKey) {
    return false;
  }
  return event.code === "F8" || event.code === "F9";
}

function handleGlobalSoftRestartKeyDown(event) {
  if (!isKioskSoftRestartShortcut(event)) return;
  if (!isKioskExhibitionPath(window.location.pathname)) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  softRestartRequestHandler?.();
}

if (typeof window !== "undefined" && !window.__gumKioskSoftRestartKeyBound) {
  window.__gumKioskSoftRestartKeyBound = true;
  window.addEventListener("keydown", handleGlobalSoftRestartKeyDown, {
    capture: true,
  });
}
