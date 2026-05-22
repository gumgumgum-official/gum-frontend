import { dispatchStage3IntroInputBlocked } from "../../../events/stage3Events.js";

const INTRO_INPUT_BLOCKED_TOAST_COOLDOWN_MS = 2000;

/** @type {string | null} */
let lastBlockedKind = null;
let lastBlockedAt = 0;

/** @param {"click" | "move"} kind */
export function notifyStage3IntroInputBlocked(kind) {
  const now = Date.now();
  if (
    lastBlockedKind === kind &&
    now - lastBlockedAt < INTRO_INPUT_BLOCKED_TOAST_COOLDOWN_MS
  ) {
    return;
  }
  lastBlockedKind = kind;
  lastBlockedAt = now;
  dispatchStage3IntroInputBlocked(kind);
}

export function resetStage3IntroInputBlockedNotify() {
  lastBlockedKind = null;
  lastBlockedAt = 0;
}
