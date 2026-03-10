/**
 * 미니게임 런처: 게임기 클릭 시 카메라 클로즈업, 모달 열기, 복귀
 * - GSAP 카메라 애니메이션
 * - OrbitControls 비활성화/재활성화
 * - CustomEvent로 React MinigameOverlay와 연동
 */
import gsap from "gsap";

const EVENT_OPEN = "minigame:open";
const EVENT_CLOSE = "minigame:close";

/** 게임기 화면 앞 클로즈업 오프셋 (게임기 위치 기준) */
const CLOSEUP_OFFSET = { x: 2, y: 1.2, z: 0 };
const ANIM_DURATION = 1.2;
const EASE = "power2.inOut";

let savedCameraState = null;

/**
 * @param {Object} opts
 * @param {THREE.PerspectiveCamera} opts.camera
 * @param {THREE.Object3D} opts.gameMachineRef - 게임기 오브젝트
 * @param {OrbitControls|null} opts.orbitControls - stageDebugControls.getOrbitControls()
 */
export function openMinigame(opts) {
  const { camera, gameMachineRef, orbitControls } = opts;
  if (!camera || !gameMachineRef) return;

  const pos = gameMachineRef.position;
  const closeupPos = {
    x: pos.x + CLOSEUP_OFFSET.x,
    y: pos.y + CLOSEUP_OFFSET.y,
    z: pos.z + CLOSEUP_OFFSET.z,
  };
  const lookAtTarget = {
    x: pos.x,
    y: pos.y + 0.8,
    z: pos.z,
  };

  savedCameraState = {
    position: {
      x: camera.position.x,
      y: camera.position.y,
      z: camera.position.z,
    },
    target: orbitControls
      ? orbitControls.target.clone()
      : { x: 0, y: 1.2, z: 0 },
  };

  if (orbitControls) orbitControls.enabled = false;

  gsap.to(camera.position, {
    x: closeupPos.x,
    y: closeupPos.y,
    z: closeupPos.z,
    duration: ANIM_DURATION,
    ease: EASE,
  });

  if (orbitControls) {
    gsap.to(orbitControls.target, {
      x: lookAtTarget.x,
      y: lookAtTarget.y,
      z: lookAtTarget.z,
      duration: ANIM_DURATION,
      ease: EASE,
    });
  }

  gsap.delayedCall(ANIM_DURATION * 0.6, () => {
    window.dispatchEvent(new CustomEvent(EVENT_OPEN));
  });
}

/**
 * 카메라 원위치 복귀 및 OrbitControls 재활성화.
 * @param {Object} opts
 * @param {THREE.PerspectiveCamera} opts.camera
 * @param {OrbitControls|null} opts.orbitControls
 */
export function closeMinigame(opts) {
  const { camera, orbitControls } = opts;
  if (!camera || !savedCameraState) return;

  gsap.to(camera.position, {
    x: savedCameraState.position.x,
    y: savedCameraState.position.y,
    z: savedCameraState.position.z,
    duration: ANIM_DURATION,
    ease: EASE,
  });

  if (orbitControls) {
    gsap.to(orbitControls.target, {
      x: savedCameraState.target.x,
      y: savedCameraState.target.y,
      z: savedCameraState.target.z,
      duration: ANIM_DURATION,
      ease: EASE,
      onComplete: () => {
        orbitControls.enabled = true;
      },
    });
  }

  savedCameraState = null;
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
