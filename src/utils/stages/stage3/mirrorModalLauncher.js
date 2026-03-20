/**
 * 거울 모달 런처: 거울 클릭 시 React MirrorModalOverlay와 연동
 * - CustomEvent로 열기/닫기 전달
 */

const EVENT_OPEN = "mirror-modal:open";
const EVENT_CLOSE = "mirror-modal:close";

export function openMirrorModal() {
  window.dispatchEvent(new CustomEvent(EVENT_OPEN));
}

export function dispatchMirrorModalClose() {
  window.dispatchEvent(new CustomEvent(EVENT_CLOSE));
}

export function onMirrorModalClose(callback) {
  const handler = () => callback();
  window.addEventListener(EVENT_CLOSE, handler);
  return () => window.removeEventListener(EVENT_CLOSE, handler);
}

export { EVENT_OPEN, EVENT_CLOSE };
