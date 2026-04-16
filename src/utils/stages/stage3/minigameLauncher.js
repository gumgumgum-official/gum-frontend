/**
 * 미니게임 런처: 게임기 클릭 시 모달 오픈/클로즈 이벤트만 처리
 * - 카메라 위치/트윈 변경 없음
 * - CustomEvent로 React MinigameOverlay와 연동
 */

const EVENT_OPEN = "minigame:open";
const EVENT_CLOSE = "minigame:close";

/**
 * @param {Object} opts
 * @param {THREE.PerspectiveCamera} opts.camera
 * @param {THREE.Object3D} opts.gameMachineRef - 게임기 오브젝트
 * @param {OrbitControls|null} opts.orbitControls - stageDebugControls.getOrbitControls()
 */
export function openMinigame(opts) {
  const { camera, gameMachineRef } = opts;
  if (!camera || !gameMachineRef) return;
  window.dispatchEvent(new CustomEvent(EVENT_OPEN));
}

/**
 * 카메라 원위치 복귀 및 OrbitControls 재활성화.
 * @param {Object} opts
 * @param {THREE.PerspectiveCamera} opts.camera
 * @param {OrbitControls|null} opts.orbitControls
 */
export function closeMinigame(opts) {
  void opts;
}

/** 모달 닫기 요청 시 호출 (React MinigameOverlay에서 사용) */
export function dispatchMinigameClose() {
  window.dispatchEvent(new CustomEvent(EVENT_CLOSE));
}

/** EVENT_CLOSE 수신 시 콜백 (Stage3에서 카메라 복귀용) */
export function onMinigameClose(callback) {
  const handler = () => callback();
  window.addEventListener(EVENT_CLOSE, handler);
  return () => window.removeEventListener(EVENT_CLOSE, handler);
}

export { EVENT_OPEN, EVENT_CLOSE };
