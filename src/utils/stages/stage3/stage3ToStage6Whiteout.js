/**
 * Stage3 포탈 화이트아웃 → Stage6 진입까지 DOM 오버레이 유지 (라우트·스테이지 전환 공통)
 */
import gsap from "gsap";
import { PORTAL_WHITEOUT_FADE_OUT_SEC } from "../../../config/stages/stage3/stage3Portal.js";

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
