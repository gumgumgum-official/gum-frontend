/**
 * Stage6 자막·chime 등 UI 알림 — 모달/애니메이션 중에는 큐에 쌓았다가 해제 시 순서대로 재생.
 */

/** @type {Map<string, number>} */
const blockRefcounts = new Map();
/** @type {Array<() => void>} */
const pendingRuns = [];
let flushScheduled = false;

const CLICK_BUBBLE_SUPPRESS_TAGS = new Set([
  "photobooth-modal",
  "poster-modal",
]);

export function isStage6NotificationsBlocked() {
  return blockRefcounts.size > 0;
}

export function isStage6ClickBubbleSuppressed() {
  for (const tag of CLICK_BUBBLE_SUPPRESS_TAGS) {
    if (blockRefcounts.has(tag)) return true;
  }
  return false;
}

export function blockStage6Notifications(tag) {
  if (!tag) return;
  blockRefcounts.set(tag, (blockRefcounts.get(tag) ?? 0) + 1);
}

export function unblockStage6Notifications(tag) {
  if (!tag) return;
  const next = (blockRefcounts.get(tag) ?? 0) - 1;
  if (next <= 0) blockRefcounts.delete(tag);
  else blockRefcounts.set(tag, next);
  if (!isStage6NotificationsBlocked()) {
    scheduleFlush();
  }
}

function scheduleFlush() {
  if (flushScheduled || isStage6NotificationsBlocked()) return;
  flushScheduled = true;
  Promise.resolve().then(() => {
    flushScheduled = false;
    while (!isStage6NotificationsBlocked() && pendingRuns.length > 0) {
      const run = pendingRuns.shift();
      run();
    }
  });
}

export function runStage6NotificationNowOrEnqueue(run) {
  if (isStage6NotificationsBlocked()) {
    pendingRuns.push(run);
    return;
  }
  run();
}

export function dispatchGatedStage6WindowEvent(eventName, detail) {
  runStage6NotificationNowOrEnqueue(() => {
    window.dispatchEvent(new CustomEvent(eventName, { detail }));
  });
}

export function resetStage6NotificationGate() {
  blockRefcounts.clear();
  pendingRuns.length = 0;
  flushScheduled = false;
}
