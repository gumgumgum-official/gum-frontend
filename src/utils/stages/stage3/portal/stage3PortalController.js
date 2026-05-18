/**
 * Stage3 포탈 → 다음 스테이지 화이트아웃 전환
 */
import gsap from "gsap";
import { playRandomPortalTransitionSound } from "../playPortalTransitionSound.js";
import {
  PORTAL_WHITEOUT_FADE_SEC,
  PORTAL_WHITEOUT_HOLD_MS,
  PORTAL_WHITEOUT_FADE_OUT_SEC,
} from "../../../../config/stages/stage3/stage3Portal.js";
import { preloadStage6AirportGlb } from "../../stage6/stage6AirportPreload.js";
import { retainStage3WhiteoutForStage6 } from "../stage3ToStage6Whiteout.js";

/**
 * @param {{ getIsStageActive: () => boolean }} params
 */
export function createStage3PortalController({ getIsStageActive }) {
  /** @type {HTMLDivElement | null} */
  let whiteoutOverlayEl = null;
  /** @type {import("gsap").core.Tween | null} */
  let portalTransitionTween = null;
  /** @type {number | null} */
  let portalTransitionHoldTimeoutId = null;
  let portalTransitionInProgress = false;
  let retainWhiteoutForStage6 = false;

  function ensureWhiteoutOverlay() {
    if (whiteoutOverlayEl) return;
    const el = document.createElement("div");
    el.className = "stage3-whiteout-overlay";
    el.setAttribute("aria-hidden", "true");
    document.body.appendChild(el);
    whiteoutOverlayEl = el;
  }

  /**
   * 화면을 흰색으로 덮은 뒤 stage:switch 를 보낸다.
   * @param {number} targetStage
   */
  function startTransition(targetStage) {
    if (portalTransitionInProgress || !getIsStageActive()) return;
    ensureWhiteoutOverlay();
    if (!whiteoutOverlayEl) return;
    playRandomPortalTransitionSound();
    retainWhiteoutForStage6 = targetStage === 6;
    if (retainWhiteoutForStage6) {
      preloadStage6AirportGlb();
    }
    portalTransitionInProgress = true;
    portalTransitionTween?.kill();
    if (portalTransitionHoldTimeoutId != null) {
      window.clearTimeout(portalTransitionHoldTimeoutId);
      portalTransitionHoldTimeoutId = null;
    }
    gsap.killTweensOf(whiteoutOverlayEl);
    whiteoutOverlayEl.style.pointerEvents = "auto";
    gsap.set(whiteoutOverlayEl, { opacity: 0 });
    portalTransitionTween = gsap.to(whiteoutOverlayEl, {
      opacity: 1,
      duration: PORTAL_WHITEOUT_FADE_SEC,
      ease: "power2.inOut",
      onComplete: () => {
        portalTransitionTween = null;
        portalTransitionHoldTimeoutId = window.setTimeout(() => {
          portalTransitionHoldTimeoutId = null;
          window.dispatchEvent(
            new CustomEvent("stage:switch", {
              detail: { targetStage },
            }),
          );
        }, PORTAL_WHITEOUT_HOLD_MS);
      },
    });
  }

  function dispose() {
    portalTransitionTween?.kill();
    portalTransitionTween = null;
    if (portalTransitionHoldTimeoutId != null) {
      window.clearTimeout(portalTransitionHoldTimeoutId);
      portalTransitionHoldTimeoutId = null;
    }
    if (retainWhiteoutForStage6 && whiteoutOverlayEl) {
      retainStage3WhiteoutForStage6(whiteoutOverlayEl);
      whiteoutOverlayEl = null;
      retainWhiteoutForStage6 = false;
      portalTransitionInProgress = false;
      return;
    }
    if (whiteoutOverlayEl) {
      const el = whiteoutOverlayEl;
      gsap.killTweensOf(el);
      el.style.pointerEvents = "none";
      portalTransitionTween = gsap.to(el, {
        opacity: 0,
        duration: PORTAL_WHITEOUT_FADE_OUT_SEC,
        ease: "power2.inOut",
        onComplete: () => {
          portalTransitionTween = null;
          if (whiteoutOverlayEl === el) {
            whiteoutOverlayEl = null;
          }
          el.remove();
        },
      });
    }
    portalTransitionInProgress = false;
    retainWhiteoutForStage6 = false;
  }

  return {
    startTransition,
    dispose,
    isInProgress: () => portalTransitionInProgress,
  };
}
