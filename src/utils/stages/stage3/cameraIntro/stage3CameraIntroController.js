/**
 * Stage3 상공 회전·줌인 카메라 인트로
 */
import * as THREE from "three";
import {
  STAGE3_CAMERA_INTRO_DURATION_SEC,
  STAGE3_CAMERA_INTRO_TRANSITION_SEC,
  STAGE3_CAMERA_INTRO_SWEEP_ANGLE_RAD,
} from "../../../../config/stages/stage3/stage3CameraIntro.js";

/**
 * @param {{
 *   getCamera: () => import("three").PerspectiveCamera | null,
 *   getCharacter: () => { getPosition?: () => import("three").Vector3 } | null,
 *   getConfig: () => import("../../../../types.js").Stage3Config,
 *   getDebugControls: () => { getOrbitControls?: () => { enabled: boolean } | null } | null,
 *   getIsStageActive: () => boolean,
 *   onIntroTopViewCommitted: () => void,
 *   onIntroComplete?: () => void,
 * }} params
 */
export function createStage3CameraIntroController({
  getCamera,
  getCharacter,
  getConfig,
  getDebugControls,
  getIsStageActive,
  onIntroTopViewCommitted,
  onIntroComplete = () => {},
}) {
  const state = {
    active: false,
    transitioning: false,
    completed: false,
    introTopViewCommitted: false,
    elapsed: 0,
    transitionElapsed: 0,
    durationSec: STAGE3_CAMERA_INTRO_DURATION_SEC,
    transitionSec: STAGE3_CAMERA_INTRO_TRANSITION_SEC,
    sweepAngleRad: STAGE3_CAMERA_INTRO_SWEEP_ANGLE_RAD,
    center: new THREE.Vector3(),
    radius: 20,
    height: 18,
    startAngle: 0,
    lookAtY: 0,
    fromPos: new THREE.Vector3(),
    fromLookAt: new THREE.Vector3(),
    toPos: new THREE.Vector3(),
    toLookAt: new THREE.Vector3(),
  };

  const _introTargetPos = new THREE.Vector3();
  const _introTargetLookAt = new THREE.Vector3();
  const _introLerpLookAt = new THREE.Vector3();

  /**
   * @param {import("three").Vector3} outPos
   * @param {import("three").Vector3} outLookAt
   */
  function getCharacterFollowPose(outPos, outLookAt) {
    const character = getCharacter();
    if (!character) return false;
    const pos = character.getPosition?.();
    if (!pos) return false;
    const config = getConfig();
    const camOffset = config.character?.cameraOffset ?? { x: 0, y: 3, z: 8 };
    const lookAtHeight = config.character?.lookAtHeightOffset ?? 1;
    outPos.set(pos.x + camOffset.x, pos.y + camOffset.y, pos.z + camOffset.z);
    outLookAt.copy(pos);
    outLookAt.y += lookAtHeight;
    return true;
  }

  /**
   * @param {import("three").Vector3} center
   * @param {import("three").Box3} bounds
   */
  function start(center, _bounds) {
    const camera = getCamera();
    if (!camera) return;
    state.active = true;
    state.transitioning = false;
    state.completed = false;
    state.introTopViewCommitted = false;
    state.elapsed = 0;
    state.transitionElapsed = 0;

    const config = getConfig();
    const sp = config.camera.introStartPos;
    const ep = config.camera.introEndPos;
    const lk = config.camera.introLookAt;
    state.center.set(lk.x, center.y, lk.z);
    state.radius = Math.sqrt((sp.x - lk.x) ** 2 + (sp.z - lk.z) ** 2);
    state.height = sp.y;
    state.lookAtY = lk.y;
    state.startAngle = Math.atan2(sp.x - lk.x, sp.z - lk.z);
    const endAngle = Math.atan2(ep.x - lk.x, ep.z - lk.z);
    let sweep = state.startAngle - endAngle;
    if (sweep < 0) sweep += Math.PI * 2;
    state.sweepAngleRad = sweep;

    const orbit = getDebugControls()?.getOrbitControls?.();
    if (orbit) orbit.enabled = false;
  }

  /**
   * @param {number} delta
   */
  function update(delta) {
    const camera = getCamera();
    if (!camera || !state.active || state.completed) return;

    if (!state.transitioning) {
      state.elapsed += delta;
      const t = Math.min(1, state.elapsed / state.durationSec);
      const angle = state.startAngle - state.sweepAngleRad * t;
      camera.position.set(
        state.center.x + Math.sin(angle) * state.radius,
        state.height,
        state.center.z + Math.cos(angle) * state.radius,
      );
      camera.lookAt(state.center.x, state.lookAtY, state.center.z);
      if (!state.introTopViewCommitted) {
        state.introTopViewCommitted = true;
        if (getIsStageActive()) {
          onIntroTopViewCommitted();
        }
      }

      if (
        t >= 1 &&
        getCharacterFollowPose(_introTargetPos, _introTargetLookAt)
      ) {
        state.transitioning = true;
        state.transitionElapsed = 0;
        state.fromPos.copy(camera.position);
        state.fromLookAt.set(state.center.x, state.lookAtY, state.center.z);
      }
      return;
    }

    if (!getCharacterFollowPose(state.toPos, state.toLookAt)) return;
    state.transitionElapsed += delta;
    const t = Math.min(1, state.transitionElapsed / state.transitionSec);
    const eased = 1 - Math.pow(1 - t, 3);
    camera.position.copy(state.fromPos).lerp(state.toPos, eased);
    _introLerpLookAt.copy(state.fromLookAt).lerp(state.toLookAt, eased);
    camera.lookAt(_introLerpLookAt);

    if (t >= 1) {
      state.active = false;
      state.transitioning = false;
      state.completed = true;
      if (getIsStageActive()) {
        onIntroComplete();
      }
    }
  }

  /**
   * 카메라 오비트·줌인 인트로 생략(개발 `/dev` 등). `character.setup` 이후 실행할 것.
   */
  function skipToGameplayCamera() {
    state.active = false;
    state.transitioning = false;
    state.introTopViewCommitted = true;

    const camera = getCamera();
    if (camera && getCharacterFollowPose(_introTargetPos, _introTargetLookAt)) {
      camera.position.copy(_introTargetPos);
      camera.lookAt(_introTargetLookAt);
    } else if (camera) {
      const camCfg = getConfig().camera ?? {};
      const p = camCfg.position ?? { x: 0, y: 10, z: 20 };
      camera.position.set(p.x, p.y, p.z);
      if (camCfg.lookAt) {
        camera.lookAt(camCfg.lookAt.x, camCfg.lookAt.y, camCfg.lookAt.z);
      } else {
        camera.lookAt(0, 0, 0);
      }
    }

    state.completed = true;
    if (getIsStageActive()) {
      onIntroComplete();
    }
  }

  function reset() {
    state.active = false;
    state.transitioning = false;
    state.completed = false;
    state.introTopViewCommitted = false;
    state.elapsed = 0;
    state.transitionElapsed = 0;
  }

  return {
    start,
    update,
    skipToGameplayCamera,
    reset,
    getState: () => state,
    shouldSkipCameraFollow: () => state.active || !state.completed,
    isReadyForYawAssist: () => state.completed && !state.active,
  };
}
