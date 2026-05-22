/**
 * Stage3 포탈 화이트아웃 → Stage6 진입까지 DOM 오버레이 유지 (라우트·스테이지 전환 공통)
 */
import gsap from "gsap";
import { PORTAL_WHITEOUT_FADE_OUT_SEC } from "../../../config/stages/stage3/stage3Portal.js";

/** 화이트아웃 페이드 아웃 시간(ms) — Stage6 오디오 시작 타이밍 보정에 사용 */
export const STAGE3_WHITEOUT_FADE_OUT_MS = PORTAL_WHITEOUT_FADE_OUT_SEC * 1000;

/** @type {HTMLDivElement | null} */
let retainedOverlayEl = null;

/**
 * @param {HTMLDivElement} overlayEl
 */
export function retainStage3WhiteoutForStage6(overlayEl) {
  retainedOverlayEl = overlayEl;
}

export function hasRetainedStage3Whiteout() {
  return (
    retainedOverlayEl != null &&
    typeof document !== "undefined" &&
    document.body.contains(retainedOverlayEl)
  );
}

export function releaseRetainedStage3Whiteout() {
  const el = retainedOverlayEl;
  if (!el) return;
  retainedOverlayEl = null;
  gsap.killTweensOf(el);
  el.style.pointerEvents = "none";
  gsap.to(el, {
    opacity: 0,
    duration: PORTAL_WHITEOUT_FADE_OUT_SEC,
    ease: "power2.inOut",
    onComplete: () => {
      el.remove();
    },
  });
}

export function clearRetainedStage3Whiteout() {
  const el = retainedOverlayEl;
  retainedOverlayEl = null;
  if (!el) return;
  gsap.killTweensOf(el);
  el.remove();
}
