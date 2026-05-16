/**
 * Stage3 상공 회전·줌인 카메라 인트로
 */
import * as THREE from "three";
import {
  STAGE3_CAMERA_INTRO_DURATION_SEC,
  STAGE3_CAMERA_INTRO_TRANSITION_SEC,
  STAGE3_CAMERA_INTRO_SWEEP_ANGLE_RAD,
  STAGE3_CAMERA_INTRO_MIN_RADIUS,
  STAGE3_CAMERA_INTRO_RADIUS_FACTOR,
  STAGE3_CAMERA_INTRO_MIN_HEIGHT_OFFSET,
  STAGE3_CAMERA_INTRO_HEIGHT_Y_FACTOR,
  STAGE3_CAMERA_INTRO_HEIGHT_Y_EXTRA,
  STAGE3_CAMERA_INTRO_LOOK_AT_BELOW_CENTER_FACTOR,
  STAGE3_CAMERA_INTRO_LOOK_AT_BELOW_CENTER_MAX,
} from "../../../../config/stages/stage3/stage3CameraIntro.js";

/**
 * @param {{
 *   getCamera: () => import("three").PerspectiveCamera | null,
 *   getCharacter: () => { getPosition?: () => import("three").Vector3 } | null,
 *   getConfig: () => import("../../../../types.js").Stage3Config,
 *   getDebugControls: () => { getOrbitControls?: () => { enabled: boolean } | null } | null,
 *   getIsStageActive: () => boolean,
 *   onIntroTopViewCommitted: () => void,
 *   onIntroComplete: () => void,
 * }} params
 */
export function createStage3CameraIntroController({
  getCamera,
  getCharacter,
  getConfig,
  getDebugControls,
  getIsStageActive,
  onIntroTopViewCommitted,
  onIntroComplete,
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
  function start(center, bounds) {
    const camera = getCamera();
    if (!camera) return;
    state.active = true;
    state.transitioning = false;
    state.completed = false;
    state.introTopViewCommitted = false;
    state.elapsed = 0;
    state.transitionElapsed = 0;
    state.center.copy(center);
    const size = new THREE.Vector3();
    bounds.getSize(size);
    const horizontalSize = Math.max(size.x, size.z);
    state.radius = Math.max(
      STAGE3_CAMERA_INTRO_MIN_RADIUS,
      horizontalSize * STAGE3_CAMERA_INTRO_RADIUS_FACTOR,
    );
    state.height =
      center.y +
      Math.max(
        STAGE3_CAMERA_INTRO_MIN_HEIGHT_OFFSET,
        size.y * STAGE3_CAMERA_INTRO_HEIGHT_Y_FACTOR +
          STAGE3_CAMERA_INTRO_HEIGHT_Y_EXTRA,
      );
    const minY = bounds.min.y;
    const maxY = bounds.max.y;
    const targetLookY =
      center.y -
      Math.min(
        size.y * STAGE3_CAMERA_INTRO_LOOK_AT_BELOW_CENTER_FACTOR,
        STAGE3_CAMERA_INTRO_LOOK_AT_BELOW_CENTER_MAX,
      );
    state.lookAtY = THREE.MathUtils.clamp(
      targetLookY,
      minY + size.y * 0.05,
      maxY - 0.3,
    );
    const baseAngle = Math.atan2(
      camera.position.x - center.x,
      camera.position.z - center.z,
    );
    state.startAngle = baseAngle + Math.PI / 2;

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
    reset,
    getState: () => state,
    shouldSkipCameraFollow: () => state.active || !state.completed,
    isReadyForYawAssist: () => state.completed && !state.active,
  };
}
