/**
 * Stage3 DOM 말풍선 — 고민 ENTER 힌트, INT Click 힌트
 */
import * as THREE from "three";
import {
  WORRY_ENTER_HINT_DIST,
  STAGE3_USER_ENTER_BUBBLE_SHOW_SEC,
  STAGE3_USER_ENTER_BUBBLE_GAP_SEC,
  STAGE3_WORRY_ENTER_BUBBLE_MESSAGES,
} from "../../../../config/stages/stage3/stage3Bubbles.js";

/**
 * @param {{
 *   getCamera: () => import("three").PerspectiveCamera | null,
 *   getCanvas: () => HTMLCanvasElement | null,
 *   getCharacter: () => { getPosition?: () => import("three").Vector3 } | null,
 *   isLetterLanded: () => boolean,
 *   getLetterGroup: () => import("three").Object3D | null,
 *   getTextDestroyed: () => boolean,
 *   getGumFollowers: () => {
 *     getPrimaryFollowerBubbleAnchorWorld?: (out: import("three").Vector3) => boolean,
 *   } | null,
 *   hasBlockingOverlayOpen: () => boolean,
 *   isStampPanelSettledInCorner: () => boolean,
 *   isWorryEnterBubbleUnlocked: () => boolean,
 *   attachIntClickHintBubble: (el: HTMLDivElement) => void,
 *   detachIntClickHintBubble: () => void,
 *   hideIntClickHint: () => void,
 * }} params
 */
export function createStage3BubblesController({
  getCamera,
  getCanvas,
  getCharacter,
  isLetterLanded,
  getLetterGroup,
  getTextDestroyed,
  getGumFollowers,
  hasBlockingOverlayOpen,
  isStampPanelSettledInCorner,
  isWorryEnterBubbleUnlocked,
  attachIntClickHintBubble,
  detachIntClickHintBubble,
  hideIntClickHint,
}) {
  /** @type {HTMLDivElement | null} */
  let userWorryEnterBubbleEl = null;
  /** @type {HTMLDivElement | null} */
  let intClickHintBubbleEl = null;
  /** @type {'off' | 'show' | 'gap'} */
  let userWorryEnterBubblePhase = "off";
  let userWorryEnterBubbleT = 0;
  let lastWorryEnterBubbleMessageIndex = -1;
  const _projWorry = new THREE.Vector3();

  function pickWorryEnterBubbleMessage() {
    const messages = STAGE3_WORRY_ENTER_BUBBLE_MESSAGES;
    if (messages.length === 0) return "";
    if (messages.length === 1) return messages[0];
    let index = Math.floor(Math.random() * messages.length);
    if (index === lastWorryEnterBubbleMessageIndex) {
      index = (index + 1) % messages.length;
    }
    lastWorryEnterBubbleMessageIndex = index;
    return messages[index];
  }

  function beginWorryEnterBubbleShow() {
    userWorryEnterBubblePhase = "show";
    userWorryEnterBubbleT = STAGE3_USER_ENTER_BUBBLE_SHOW_SEC;
    if (userWorryEnterBubbleEl) {
      userWorryEnterBubbleEl.textContent = pickWorryEnterBubbleMessage();
    }
  }

  function mount() {
    if (!userWorryEnterBubbleEl) {
      userWorryEnterBubbleEl = document.createElement("div");
      userWorryEnterBubbleEl.className =
        "speech-bubble-stage2 speech-bubble-stage3-user speech-bubble-stage3-worry-enter";
      userWorryEnterBubbleEl.setAttribute("aria-hidden", "true");
      document.body.appendChild(userWorryEnterBubbleEl);
    }

    if (!intClickHintBubbleEl) {
      intClickHintBubbleEl = document.createElement("div");
      intClickHintBubbleEl.className =
        "speech-bubble-stage2 speech-bubble-stage3-user speech-bubble-stage3-int-click";
      intClickHintBubbleEl.textContent = "Click!";
      intClickHintBubbleEl.setAttribute("aria-hidden", "true");
      intClickHintBubbleEl.style.pointerEvents = "auto";
      document.body.appendChild(intClickHintBubbleEl);
      attachIntClickHintBubble(intClickHintBubbleEl);
    }
  }

  function hideAll() {
    userWorryEnterBubbleEl?.classList.remove("is-visible");
    hideIntClickHint();
  }

  /**
   * @param {number} delta
   */
  function update(delta) {
    const camera = getCamera();
    const canvas = getCanvas();
    if (!camera || !canvas || !userWorryEnterBubbleEl) return;

    const charPos = getCharacter()?.getPosition?.();
    const letterGroupForBubble = getLetterGroup();
    const nearLetter =
      Boolean(
        isLetterLanded() &&
        charPos &&
        letterGroupForBubble &&
        letterGroupForBubble.position.distanceTo(charPos) <=
          WORRY_ENTER_HINT_DIST,
      ) && !getTextDestroyed();
    const gumBubbleAnchorOk =
      nearLetter &&
      Boolean(
        getGumFollowers()?.getPrimaryFollowerBubbleAnchorWorld?.(_projWorry),
      );

    if (
      hasBlockingOverlayOpen() ||
      !isStampPanelSettledInCorner() ||
      !isWorryEnterBubbleUnlocked()
    ) {
      userWorryEnterBubblePhase = "off";
      userWorryEnterBubbleT = 0;
      userWorryEnterBubbleEl.classList.remove("is-visible");
      return;
    }

    if (nearLetter && gumBubbleAnchorOk) {
      if (userWorryEnterBubblePhase === "off") {
        beginWorryEnterBubbleShow();
      }
      userWorryEnterBubbleT -= delta;
      if (userWorryEnterBubbleT <= 0) {
        if (userWorryEnterBubblePhase === "show") {
          userWorryEnterBubblePhase = "gap";
          userWorryEnterBubbleT = STAGE3_USER_ENTER_BUBBLE_GAP_SEC;
        } else {
          beginWorryEnterBubbleShow();
        }
      }
      const bubbleVisible = userWorryEnterBubblePhase === "show";
      if (bubbleVisible) {
        camera.updateMatrixWorld(true);
        _projWorry.project(camera);
        const rect = canvas.getBoundingClientRect();
        const x = (_projWorry.x * 0.5 + 0.5) * rect.width + rect.left;
        const y = (-_projWorry.y * 0.5 + 0.5) * rect.height + rect.top;
        userWorryEnterBubbleEl.style.left = `${x}px`;
        userWorryEnterBubbleEl.style.top = `${y}px`;
        userWorryEnterBubbleEl.classList.add("is-visible");
      } else {
        userWorryEnterBubbleEl.classList.remove("is-visible");
      }
    } else {
      userWorryEnterBubblePhase = "off";
      userWorryEnterBubbleT = 0;
      userWorryEnterBubbleEl.classList.remove("is-visible");
    }
  }

  function dispose() {
    userWorryEnterBubbleEl?.remove();
    userWorryEnterBubbleEl = null;
    detachIntClickHintBubble();
    intClickHintBubbleEl?.remove();
    intClickHintBubbleEl = null;
    userWorryEnterBubblePhase = "off";
    userWorryEnterBubbleT = 0;
    lastWorryEnterBubbleMessageIndex = -1;
  }

  return {
    mount,
    update,
    hideAll,
    dispose,
  };
}
