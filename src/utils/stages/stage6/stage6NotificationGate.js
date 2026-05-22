/**
 * Stage6 자막·chime 등 UI 알림 — 모달/애니메이션 중에는 큐에 쌓았다가 해제 시 순서대로 재생.
 */

import {
  STAGE6_NAME_MODAL_SHOW_EVENT,
  STAGE6_PHOTOBOOTH_MODAL_SHOW_EVENT,
  STAGE6_POSTER_MODAL_SHOW_EVENT,
} from "../../../events/stage6Events.js";

export const STAGE6_POSTER_MODAL_BLOCK_TAG = "poster-modal";

/** @type {Map<string, number>} */
const blockRefcounts = new Map();
/** @type {Array<() => void>} */
const pendingRuns = [];
let flushScheduled = false;

/** 전화 통화 중 자막·모달 큐잉 */
export const STAGE6_PHONE_IN_CALL_BLOCK_TAG = "phone-in-call";

export const STAGE6_PHOTOBOOTH_MODAL_BLOCK_TAG = "photobooth-modal";

const CLICK_BUBBLE_SUPPRESS_TAGS = new Set([
  STAGE6_PHOTOBOOTH_MODAL_BLOCK_TAG,
  STAGE6_POSTER_MODAL_BLOCK_TAG,
]);

export function isStage6PhotoboothModalOpen() {
  return blockRefcounts.has(STAGE6_PHOTOBOOTH_MODAL_BLOCK_TAG);
}

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

/** 이미 같은 tag로 막혀 있으면 refcount를 올리지 않음 (모달 재오픈 시 큐 영구 블록 방지) */
export function blockStage6NotificationsOnce(tag) {
  if (!tag || blockRefcounts.has(tag)) return;
  blockStage6Notifications(tag);
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

const NAME_MODAL_BLOCK_TAG = "name-modal";

/** 탑승권 이름 모달 — 알림 큐에 막히지 않고 즉시 연다 */
export function openStage6NameModal() {
  blockStage6NotificationsOnce(NAME_MODAL_BLOCK_TAG);
  window.dispatchEvent(new CustomEvent(STAGE6_NAME_MODAL_SHOW_EVENT));
}

/** 포토부스 — 사용자 클릭은 큐 없이 즉시 연다 */
export function openStage6PhotoboothModal(detail) {
  // 자동 닫기 등으로 React만 닫히고 block이 남으면 재오픈·알림 큐가 꼬임
  blockRefcounts.delete(STAGE6_PHOTOBOOTH_MODAL_BLOCK_TAG);
  blockStage6NotificationsOnce(STAGE6_PHOTOBOOTH_MODAL_BLOCK_TAG);
  window.dispatchEvent(
    new CustomEvent(STAGE6_PHOTOBOOTH_MODAL_SHOW_EVENT, { detail }),
  );
}

/** 포스터 — 사용자 클릭은 큐 없이 즉시 연다 */
export function openStage6PosterModal(detail) {
  blockRefcounts.delete(STAGE6_POSTER_MODAL_BLOCK_TAG);
  blockStage6NotificationsOnce(STAGE6_POSTER_MODAL_BLOCK_TAG);
  window.dispatchEvent(
    new CustomEvent(STAGE6_POSTER_MODAL_SHOW_EVENT, { detail }),
  );
}
