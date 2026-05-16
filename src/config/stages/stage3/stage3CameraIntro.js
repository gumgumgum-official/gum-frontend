/** Stage3 상공 회전·줌인 카메라 인트로 */

/** 인트로 회전 구간 길이(초) — 클수록 같은 sweep 각에서 더 천천히 회전 */
export const STAGE3_CAMERA_INTRO_DURATION_SEC = 7;

/** 회전 종료 후 캐릭터 추적 포즈로 줌인 전환(초) */
export const STAGE3_CAMERA_INTRO_TRANSITION_SEC = 2.0;

/** 시계방향 스윕 각(rad) */
export const STAGE3_CAMERA_INTRO_SWEEP_ANGLE_RAD = Math.PI * 0.39;

/** 궤도 최소 반경 */
export const STAGE3_CAMERA_INTRO_MIN_RADIUS = 13;

/** bounds 수평 크기 대비 반경 계수 */
export const STAGE3_CAMERA_INTRO_RADIUS_FACTOR = 0.76;

/** 섬 중심 위 최소 카메라 높이 오프셋 */
export const STAGE3_CAMERA_INTRO_MIN_HEIGHT_OFFSET = 60;

/** bounds 높이 대비 카메라 높이 계수·추가값 */
export const STAGE3_CAMERA_INTRO_HEIGHT_Y_FACTOR = 1.2;
export const STAGE3_CAMERA_INTRO_HEIGHT_Y_EXTRA = 16;

/** lookAt Y: center보다 아래로 내리는 최대 오프셋( bounds 높이 비율·절대 상한) */
export const STAGE3_CAMERA_INTRO_LOOK_AT_BELOW_CENTER_FACTOR = 0.14;
export const STAGE3_CAMERA_INTRO_LOOK_AT_BELOW_CENTER_MAX = 4;
