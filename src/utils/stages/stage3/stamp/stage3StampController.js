/**
 * Stage3 스탬프 패널 UI·이스터에그 진행·진입 자막
 */
import { STAGE6_SUBTITLE_SEQUENCE_EVENT } from "../../../../events/stage6Events.js";
import { dispatchStage3IntroMovementHint } from "../../../../events/stage3Events.js";
import {
  STAGE3_INTRO_MOVEMENT_HINT_TOAST_FADE_MS,
  STAGE3_WORRY_ENTER_BUBBLE_AFTER_MOVEMENT_HINT_MS,
} from "../../../../config/stages/stage3/stage3Bubbles.js";
import {
  STAMP_POSTER_IMAGE_PATH,
  STAGE3_STAMP_INTRO_CENTER_IN_MS,
  STAGE3_STAMP_INTRO_HOLD_MS,
  STAGE3_STAMP_INTRO_FLY_MS,
  STAGE3_ENTRY_SUBTITLE_TOTAL_MS,
  STAGE3_ENTRY_MOVEMENT_HINT_DELAY_MS,
  REQUIRED_EGG_COUNT,
  MAIN_EASTER_EGG_CANONICAL,
  RAY_TARGET_TO_EGG_KEY,
} from "../../../../config/stages/stage3/stage3Stamp.js";

/**
 * @typedef {"gumtoongji"|"worryBreak"|"clock"|"gameMachine"|"tent"|"notice"|"icecream"} Stage3StampStepKey
 */

/**
 * @param {{
 *   getIsStageActive: () => boolean,
 *   hasExternalOverlayOpen: () => boolean,
 *   onCameraShake: (durationSec: number) => void,
 *   getTextDestroyed: () => boolean,
 *   setTextDestroyed: (value: boolean) => void,
 * }} params
 */
export function createStage3StampController({
  getIsStageActive,
  hasExternalOverlayOpen,
  onCameraShake,
  getTextDestroyed,
  setTextDestroyed,
}) {
  let easterEggCount = 0;
  const discoveredEggs = new Set();
  const stampCompletedSteps = new Set();
  const pendingStampStepsOnModalClose = new Set();
  let stampPanelRevealReady = false;
  /** 진입 자막 타이머는 끝났으나 오버레이 때문에 reveal을 미룬 상태 */
  let stampPanelRevealPending = false;
  let stage3IntroFlowStarted = false;
  let worryCompletionCelebrationDone = false;
  let pendingEggDiscoverySubtitle = null;

  /** @type {HTMLDivElement | null} */
  let stampUiRoot = null;
  /** @type {HTMLDivElement | null} */
  let stampPosterZoomOverlayEl = null;
  let isStampPosterZoomOpen = false;
  let stage3EntryStampRevealTimerId = null;
  let stage3StampIntroHoldTimerId = null;
  let stage3StampIntroFlyTimerId = null;
  let stage3StampIntroAnimating = false;
  let stage3InteractionLocked = true;
  let stage3EntryMovementHintDispatched = false;
  /** @type {number | null} */
  let stage3EntryMovementHintTimerId = null;
  let worryEnterBubbleUnlocked = false;
  /** @type {number | null} */
  let worryEnterBubbleUnlockTimerId = null;

  function dispatchSubtitleSequence(messages, options = {}) {
    window.dispatchEvent(
      new CustomEvent(STAGE6_SUBTITLE_SEQUENCE_EVENT, {
        detail: { messages, hideLabel: options.hideLabel === true },
      }),
    );
  }

  function dispatchSubtitleLine(text, holdMs = 2200) {
    dispatchSubtitleSequence([{ text, holdMs }]);
  }

  function updateStampMarksFilled() {
    if (!stampUiRoot) return;
    const marks = stampUiRoot.querySelectorAll(".stage3-stamp-mark");
    marks.forEach((el) => {
      const key = el.getAttribute("data-step-key");
      const filled = !!key && stampCompletedSteps.has(key);
      el.classList.toggle("filled", filled);
    });
  }

  function pulseStampMarkForStep(stepKey) {
    if (!stampUiRoot) return;
    const marks = stampUiRoot.querySelectorAll(
      `.stage3-stamp-mark[data-step-key="${stepKey}"]`,
    );
    if (!marks.length) return;
    marks.forEach((el) => {
      el.classList.remove("stage3-stamp-pop");
      void el.getBoundingClientRect();
      el.classList.add("stage3-stamp-pop");
      window.setTimeout(() => el.classList.remove("stage3-stamp-pop"), 500);
    });
  }

  function pulseStampPanelGlow() {
    if (!stampUiRoot) return;
    const panel = stampUiRoot.querySelector(".stage3-stamp-panel");
    if (!panel) return;
    panel.classList.remove("stage3-stamp-glow");
    void panel.getBoundingClientRect();
    panel.classList.add("stage3-stamp-glow");
    window.setTimeout(() => panel.classList.remove("stage3-stamp-glow"), 900);
  }

  function pulseStampPanelPop() {
    if (!stampUiRoot) return;
    const panel = stampUiRoot.querySelector(".stage3-stamp-panel");
    if (!panel) return;
    panel.classList.remove("stage3-stamp-panel--pop");
    void panel.getBoundingClientRect();
    panel.classList.add("stage3-stamp-panel--pop");
    window.setTimeout(
      () => panel.classList.remove("stage3-stamp-panel--pop"),
      2000,
    );
  }

  /**
   * @param {Stage3StampStepKey} stepKey
   * @returns {boolean}
   */
  function tryAdvanceStampSequence(stepKey) {
    if (stampCompletedSteps.has(stepKey)) return false;
    stampCompletedSteps.add(stepKey);
    updateStampMarksFilled();
    pulseStampMarkForStep(stepKey);
    pulseStampPanelPop();
    pulseStampPanelGlow();
    return true;
  }

  /** @returns {HTMLElement | null} */
  function getStampPanel() {
    const el = stampUiRoot?.querySelector(".stage3-stamp-panel") ?? null;
    return el instanceof window.HTMLElement ? el : null;
  }

  function setStampPanelHidden(hidden) {
    const panel = getStampPanel();
    if (!panel) return;
    panel.classList.toggle("stage3-stamp-panel--hidden", hidden);
  }

  function syncStampPanelVisibilityByOverlay() {
    if (stampPanelRevealPending && !hasExternalOverlayOpen()) {
      revealStampPanelAfterEntrySubtitles();
    }
    if (!stampPanelRevealReady) {
      setStampPanelHidden(true);
      return;
    }
    setStampPanelHidden(hasExternalOverlayOpen() || isStampPosterZoomOpen);
  }

  function canOpenStampPosterZoom() {
    return (
      stampPanelRevealReady &&
      !stage3StampIntroAnimating &&
      !stage3InteractionLocked &&
      !isStampPosterZoomOpen &&
      !hasExternalOverlayOpen()
    );
  }

  function openStampPosterZoom() {
    if (!stampPosterZoomOverlayEl) return;
    isStampPosterZoomOpen = true;
    stampPosterZoomOverlayEl.classList.remove(
      "stage3-stamp-zoom-overlay--hidden",
    );
    stampPosterZoomOverlayEl.setAttribute("aria-hidden", "false");
    syncStampPanelVisibilityByOverlay();
  }

  function closeStampPosterZoom() {
    if (!stampPosterZoomOverlayEl) return;
    isStampPosterZoomOpen = false;
    stampPosterZoomOverlayEl.classList.add("stage3-stamp-zoom-overlay--hidden");
    stampPosterZoomOverlayEl.setAttribute("aria-hidden", "true");
    syncStampPanelVisibilityByOverlay();
  }

  /** @param {HTMLElement} panel */
  function clearStampIntroInlineStyles(panel) {
    panel.style.removeProperty("transform");
    panel.style.removeProperty("transform-origin");
  }

  function clearEntryMovementHintTimer() {
    if (stage3EntryMovementHintTimerId != null) {
      window.clearTimeout(stage3EntryMovementHintTimerId);
      stage3EntryMovementHintTimerId = null;
    }
  }

  function clearWorryEnterBubbleUnlockTimer() {
    if (worryEnterBubbleUnlockTimerId != null) {
      window.clearTimeout(worryEnterBubbleUnlockTimerId);
      worryEnterBubbleUnlockTimerId = null;
    }
  }

  function scheduleWorryEnterBubbleUnlockAfterMovementHint() {
    clearWorryEnterBubbleUnlockTimer();
    const delayMs =
      STAGE3_INTRO_MOVEMENT_HINT_TOAST_FADE_MS +
      STAGE3_WORRY_ENTER_BUBBLE_AFTER_MOVEMENT_HINT_MS;
    worryEnterBubbleUnlockTimerId = window.setTimeout(() => {
      worryEnterBubbleUnlockTimerId = null;
      if (!getIsStageActive()) return;
      worryEnterBubbleUnlocked = true;
    }, delayMs);
  }

  function scheduleEntryMovementHint() {
    if (stage3EntryMovementHintDispatched || !getIsStageActive()) return;
    stage3EntryMovementHintDispatched = true;
    clearEntryMovementHintTimer();
    stage3EntryMovementHintTimerId = window.setTimeout(() => {
      stage3EntryMovementHintTimerId = null;
      if (!getIsStageActive()) return;
      dispatchStage3IntroMovementHint();
      scheduleWorryEnterBubbleUnlockAfterMovementHint();
    }, STAGE3_ENTRY_MOVEMENT_HINT_DELAY_MS);
  }

  /** @param {HTMLElement} panel */
  function settleStampPanelAfterIntroFly(panel) {
    panel.getAnimations().forEach((anim) => anim.cancel());
    panel.classList.add("stage3-stamp-panel--settling");
    panel.classList.remove("stage3-stamp-panel--intro-center");
    panel.classList.remove("stage3-stamp-panel--intro-fly");
    clearStampIntroInlineStyles(panel);
    requestAnimationFrame(() => {
      panel.classList.remove("stage3-stamp-panel--settling");
      stage3StampIntroAnimating = false;
      stage3InteractionLocked = false;
    });
  }

  /** @param {HTMLElement} panel */
  function startStampPanelFlyToCorner(panel) {
    const firstRect = panel.getBoundingClientRect();

    panel.classList.add("stage3-stamp-panel--settling");
    panel.classList.remove("stage3-stamp-panel--intro-center");
    panel.classList.add("stage3-stamp-panel--intro-fly");
    void panel.offsetWidth;

    const lastRect = panel.getBoundingClientRect();
    const dx = firstRect.left - lastRect.left;
    const dy = firstRect.top - lastRect.top;
    const sx = firstRect.width / Math.max(lastRect.width, 1);
    const sy = firstRect.height / Math.max(lastRect.height, 1);

    panel.classList.remove("stage3-stamp-panel--settling");
    clearStampIntroInlineStyles(panel);

    const cornerScale = window
      .getComputedStyle(panel)
      .getPropertyValue("--stage3-stamp-scale")
      .trim();

    const flyAnimation = panel.animate(
      [
        {
          transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`,
          transformOrigin: "top left",
        },
        {
          transform: `scale(${cornerScale || 0.68})`,
          transformOrigin: "top left",
        },
      ],
      {
        duration: STAGE3_STAMP_INTRO_FLY_MS,
        easing: "cubic-bezier(0.2, 0.8, 0.15, 1)",
        fill: "forwards",
      },
    );

    let flyFinished = false;
    const finishFly = () => {
      if (flyFinished) return;
      flyFinished = true;
      if (stage3StampIntroFlyTimerId != null) {
        window.clearTimeout(stage3StampIntroFlyTimerId);
        stage3StampIntroFlyTimerId = null;
      }
      if (flyAnimation.playState !== "finished") {
        flyAnimation.cancel();
      }
      if (!getIsStageActive() || !stampUiRoot) {
        stage3StampIntroAnimating = false;
        return;
      }
      settleStampPanelAfterIntroFly(panel);
    };

    flyAnimation.addEventListener("finish", finishFly, { once: true });

    stage3StampIntroFlyTimerId = window.setTimeout(() => {
      stage3StampIntroFlyTimerId = null;
      finishFly();
    }, STAGE3_STAMP_INTRO_FLY_MS + 120);

    scheduleEntryMovementHint();
  }

  function clearStampIntroTimers() {
    clearEntryMovementHintTimer();
    clearWorryEnterBubbleUnlockTimer();
    if (stage3StampIntroHoldTimerId != null) {
      window.clearTimeout(stage3StampIntroHoldTimerId);
      stage3StampIntroHoldTimerId = null;
    }
    if (stage3StampIntroFlyTimerId != null) {
      window.clearTimeout(stage3StampIntroFlyTimerId);
      stage3StampIntroFlyTimerId = null;
    }
    const panel = getStampPanel();
    if (panel) {
      clearStampIntroInlineStyles(panel);
      panel.getAnimations().forEach((anim) => anim.cancel());
      panel.classList.remove(
        "stage3-stamp-panel--intro-center",
        "stage3-stamp-panel--intro-fly",
        "stage3-stamp-panel--settling",
      );
    }
    stage3StampIntroAnimating = false;
  }

  function playStampPanelEntryAnimation() {
    if (!stampUiRoot || !getIsStageActive()) return;
    const panel = getStampPanel();
    if (!panel) return;
    clearStampIntroTimers();
    stage3StampIntroAnimating = true;
    panel.classList.remove("stage3-stamp-panel--intro-fly");
    panel.getAnimations().forEach((anim) => anim.cancel());
    clearStampIntroInlineStyles(panel);
    panel.classList.add("stage3-stamp-panel--intro-center");
    void panel.offsetWidth;
    panel.classList.remove("stage3-stamp-panel--hidden");
    stage3StampIntroHoldTimerId = window.setTimeout(() => {
      stage3StampIntroHoldTimerId = null;
      if (!getIsStageActive() || !stampUiRoot) {
        stage3StampIntroAnimating = false;
        return;
      }
      startStampPanelFlyToCorner(panel);
    }, STAGE3_STAMP_INTRO_CENTER_IN_MS + STAGE3_STAMP_INTRO_HOLD_MS);
  }

  function revealStampPanelAfterEntrySubtitles() {
    if (!stampUiRoot || !getIsStageActive()) return;
    if (hasExternalOverlayOpen()) {
      stampPanelRevealPending = true;
      return;
    }
    stampPanelRevealPending = false;
    stampPanelRevealReady = true;
    playStampPanelEntryAnimation();
  }

  /**
   * @param {"notice"|"gameMachine"|"tent"} stepKey
   */
  function queueStampStepOnModalClose(stepKey) {
    pendingStampStepsOnModalClose.add(stepKey);
  }

  /**
   * @param {"notice"|"gameMachine"|"tent"} stepKey
   */
  function flushQueuedStampStepOnModalClose(stepKey) {
    if (!pendingStampStepsOnModalClose.has(stepKey)) return;
    pendingStampStepsOnModalClose.delete(stepKey);
    tryAdvanceStampSequence(stepKey);
  }

  function flushPendingEggDiscoverySubtitle() {
    if (!getIsStageActive() || !pendingEggDiscoverySubtitle) return;
    const text = pendingEggDiscoverySubtitle;
    pendingEggDiscoverySubtitle = null;
    dispatchSubtitleLine(text);
  }

  function setPendingEggDiscoverySubtitle(text) {
    pendingEggDiscoverySubtitle = text;
  }

  function runEntrySubtitlesAndIntro() {
    if (stage3IntroFlowStarted) return;
    stage3IntroFlowStarted = true;
    stampPanelRevealReady = false;
    if (stage3EntryStampRevealTimerId != null) {
      window.clearTimeout(stage3EntryStampRevealTimerId);
      stage3EntryStampRevealTimerId = null;
    }
    const panel = getStampPanel();
    if (panel) panel.classList.add("stage3-stamp-panel--hidden");

    dispatchSubtitleSequence([
      { text: "껌딱지 월드에 오신 것을 환영합니다!", holdMs: 2500 },
      { text: "섬 위에 걱정들이 쏟아지고 있어요!", holdMs: 2000 },
      { text: "걱정을 부시며 섬을 둘러볼까요?", holdMs: 2000 },
    ]);

    stage3EntryStampRevealTimerId = window.setTimeout(() => {
      stage3EntryStampRevealTimerId = null;
      revealStampPanelAfterEntrySubtitles();
    }, STAGE3_ENTRY_SUBTITLE_TOTAL_MS);
  }

  /** `/dev`(skipStage3Intro): 진입 자막·포스터(중앙 연출) 없이 패널을 바로 활성 상태로 둠 */
  function skipStampEntryPresentationForDev() {
    if (!getIsStageActive()) return;
    if (stage3EntryStampRevealTimerId != null) {
      window.clearTimeout(stage3EntryStampRevealTimerId);
      stage3EntryStampRevealTimerId = null;
    }
    clearStampIntroTimers();
    stage3IntroFlowStarted = true;
    stampPanelRevealPending = false;
    stampPanelRevealReady = true;
    stage3InteractionLocked = false;
    stage3StampIntroAnimating = false;

    const panel = getStampPanel();
    if (panel) {
      clearStampIntroInlineStyles(panel);
      panel.classList.remove(
        "stage3-stamp-panel--hidden",
        "stage3-stamp-panel--intro-center",
        "stage3-stamp-panel--intro-fly",
        "stage3-stamp-panel--settling",
      );
    }
    syncStampPanelVisibilityByOverlay();
  }

  /**
   * @param {"notice"|"gameMachine"|"icecream"|"tent"} target
   * @returns {{ didDiscover: boolean, stampSubtitle: string | null }}
   */
  function tryRegisterEasterEggFromRayTarget(target) {
    const key = RAY_TARGET_TO_EGG_KEY[target];
    if (!key || !MAIN_EASTER_EGG_CANONICAL.includes(key)) {
      return { didDiscover: false, stampSubtitle: null };
    }
    if (discoveredEggs.has(key)) {
      return { didDiscover: false, stampSubtitle: null };
    }
    discoveredEggs.add(key);
    let stampSubtitle = null;
    if (easterEggCount < REQUIRED_EGG_COUNT) {
      easterEggCount += 1;
      if (easterEggCount >= REQUIRED_EGG_COUNT) {
        pulseStampPanelGlow();
      }
      if (easterEggCount === 1) {
        stampSubtitle = "뭔가 발견했어요! 더 찾아볼까요? 👀";
      } else if (easterEggCount === 2) {
        stampSubtitle = "하나만 더 찾으면 될 것 같아요!";
      } else if (easterEggCount === 3) {
        stampSubtitle = "다 찾았어요. 다음 여정으로 떠날 수 있어요!";
      }
    }
    return { didDiscover: true, stampSubtitle };
  }

  function tryDispatchWorryCompletionCelebration() {
    if (worryCompletionCelebrationDone) return;
    if (!getTextDestroyed()) return;
    worryCompletionCelebrationDone = true;
    pendingEggDiscoverySubtitle = null;
    onCameraShake(0.5);
    window.setTimeout(() => {
      if (!getIsStageActive()) return;
      dispatchSubtitleSequence([
        { text: "모든 걱정을 날려버렸어요! 💥", holdMs: 2000 },
      ]);
    }, 0);
  }

  function handlePortalBlockedFeedback() {
    if (easterEggCount >= REQUIRED_EGG_COUNT && !getTextDestroyed()) {
      dispatchSubtitleLine(
        "아직 걱정이 남아있어요. 우리 걱정을 부셔볼까요? 💥 ",
      );
      return;
    }
    if (easterEggCount < REQUIRED_EGG_COUNT) {
      dispatchSubtitleLine(
        "아직 열리지 않은 것 같아요. 섬을 더 둘러볼까요? 🗺",
      );
    }
  }

  function handleStampKeyToggle() {
    if (isStampPosterZoomOpen) {
      closeStampPosterZoom();
    } else if (canOpenStampPosterZoom()) {
      openStampPosterZoom();
    }
  }

  function mountStampUi() {
    if (stampUiRoot) return;
    stampUiRoot = document.createElement("div");
    stampUiRoot.className = "stage3-ui-root";
    stampUiRoot.innerHTML = `
      <div class="stage3-stamp-panel stage3-stamp-panel--hidden" aria-label="이스터에그 진행">
        <div class="stage3-stamp-poster-wrap">
          <img class="stage3-stamp-poster" src="${STAMP_POSTER_IMAGE_PATH}" alt="GGUM STAMP TOUR 포스터" role="button" tabindex="0" />
          <span class="stage3-stamp-mark" data-step-key="gumtoongji" aria-hidden="true"></span>
          <span class="stage3-stamp-mark" data-step-key="worryBreak" aria-hidden="true"></span>
          <span class="stage3-stamp-mark" data-step-key="clock" aria-hidden="true"></span>
          <span class="stage3-stamp-mark" data-step-key="gameMachine" aria-hidden="true"></span>
          <span class="stage3-stamp-mark" data-step-key="tent" aria-hidden="true"></span>
          <span class="stage3-stamp-mark" data-step-key="notice" aria-hidden="true"></span>
          <span class="stage3-stamp-mark" data-step-key="icecream" aria-hidden="true"></span>
        </div>
      </div>
      <div class="stage3-stamp-zoom-overlay stage3-stamp-zoom-overlay--hidden" aria-hidden="true">
        <div class="stage3-stamp-zoom-content" role="dialog" aria-modal="true" aria-label="스탬프 포스터 확대 보기">
          <button class="stage3-stamp-zoom-close" type="button" aria-label="닫기">×</button>
          <div class="stage3-stamp-zoom-poster-wrap">
            <img class="stage3-stamp-zoom-image" src="${STAMP_POSTER_IMAGE_PATH}" alt="GGUM STAMP TOUR 포스터 확대" />
            <span class="stage3-stamp-mark stage3-stamp-mark--zoom" data-step-key="gumtoongji" aria-hidden="true"></span>
            <span class="stage3-stamp-mark stage3-stamp-mark--zoom" data-step-key="worryBreak" aria-hidden="true"></span>
            <span class="stage3-stamp-mark stage3-stamp-mark--zoom" data-step-key="clock" aria-hidden="true"></span>
            <span class="stage3-stamp-mark stage3-stamp-mark--zoom" data-step-key="gameMachine" aria-hidden="true"></span>
            <span class="stage3-stamp-mark stage3-stamp-mark--zoom" data-step-key="tent" aria-hidden="true"></span>
            <span class="stage3-stamp-mark stage3-stamp-mark--zoom" data-step-key="notice" aria-hidden="true"></span>
            <span class="stage3-stamp-mark stage3-stamp-mark--zoom" data-step-key="icecream" aria-hidden="true"></span>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(stampUiRoot);
    stampPosterZoomOverlayEl = stampUiRoot.querySelector(
      ".stage3-stamp-zoom-overlay",
    );
    const posterEl = stampUiRoot.querySelector(".stage3-stamp-poster");
    const closeBtnEl = stampUiRoot.querySelector(".stage3-stamp-zoom-close");
    posterEl?.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (canOpenStampPosterZoom()) openStampPosterZoom();
    });
    posterEl?.addEventListener(
      "keydown",
      (/** @type {KeyboardEvent} */ event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        event.stopPropagation();
        if (canOpenStampPosterZoom()) openStampPosterZoom();
      },
    );
    closeBtnEl?.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeStampPosterZoom();
    });
    stampPosterZoomOverlayEl?.addEventListener("pointerdown", (event) => {
      if (event.target !== stampPosterZoomOverlayEl) return;
      event.preventDefault();
      event.stopPropagation();
      closeStampPosterZoom();
    });
  }

  function disposeStampUi() {
    clearStampIntroTimers();
    if (stage3EntryStampRevealTimerId != null) {
      window.clearTimeout(stage3EntryStampRevealTimerId);
      stage3EntryStampRevealTimerId = null;
    }
    stampUiRoot?.remove();
    stampUiRoot = null;
    stampPosterZoomOverlayEl = null;
    isStampPosterZoomOpen = false;
  }

  function resetForSetup() {
    easterEggCount = 0;
    discoveredEggs.clear();
    stampCompletedSteps.clear();
    pendingStampStepsOnModalClose.clear();
    stampPanelRevealReady = false;
    stampPanelRevealPending = false;
    stage3StampIntroAnimating = false;
    stage3InteractionLocked = true;
    isStampPosterZoomOpen = false;
    worryCompletionCelebrationDone = false;
    stage3IntroFlowStarted = false;
    stage3EntryMovementHintDispatched = false;
    worryEnterBubbleUnlocked = false;
    pendingEggDiscoverySubtitle = null;
    if (stage3EntryStampRevealTimerId != null) {
      window.clearTimeout(stage3EntryStampRevealTimerId);
      stage3EntryStampRevealTimerId = null;
    }
    clearStampIntroTimers();
    clearEntryMovementHintTimer();
    clearWorryEnterBubbleUnlockTimer();
  }

  function cleanup() {
    disposeStampUi();
    resetForSetup();
  }

  return {
    mountStampUi,
    disposeStampUi,
    resetForSetup,
    cleanup,
    updateStampMarksFilled,
    tryAdvanceStampSequence,
    queueStampStepOnModalClose,
    flushQueuedStampStepOnModalClose,
    syncStampPanelVisibilityByOverlay,
    tryRegisterEasterEggFromRayTarget,
    dispatchSubtitleLine,
    dispatchSubtitleSequence,
    flushPendingEggDiscoverySubtitle,
    setPendingEggDiscoverySubtitle,
    runEntrySubtitlesAndIntro,
    skipStampEntryPresentationForDev,
    tryDispatchWorryCompletionCelebration,
    handlePortalBlockedFeedback,
    handleStampKeyToggle,
    isStampIntroAnimating: () => stage3StampIntroAnimating,
    /** 진입 자막 후 미니맵이 좌상단에 안착한 뒤 */
    isStampPanelSettledInCorner: () =>
      stampPanelRevealReady && !stage3StampIntroAnimating,
    isWorryEnterBubbleUnlocked: () => worryEnterBubbleUnlocked,
    isInteractionLocked: () => stage3InteractionLocked,
    isPosterZoomOpen: () => isStampPosterZoomOpen,
    isPortalOpenReady: () =>
      easterEggCount >= REQUIRED_EGG_COUNT && getTextDestroyed(),
    getEasterEggCount: () => easterEggCount,
    onWorryShatter: () => {
      setTextDestroyed(true);
      tryAdvanceStampSequence("worryBreak");
    },
  };
}
