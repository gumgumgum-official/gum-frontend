/**
 * 껌 카드 번호 → Stage3 「붙이기」 동적 껌딱지 3D 스펙
 * UI 카피는 `gumCardsConfig.js` 와 분리 (에셋 교체 시 이 파일만 수정)
 */

/**
 * @typedef {'groundFollow'|'headFloat'} GumCardStickFollowerAttachMode
 */

/**
 * @typedef {Object} GumCardStickFollowerBehaviorSpec
 * @property {number} [distance] - (groundFollow) 유저와의 목표 거리(m)
 * @property {number} [followLerpFactor] - (groundFollow) 위치 추종 강도
 * @property {number} [facingLerpFactor] - (groundFollow) 바라보기 스무딩
 * @property {-1|0|1} [side] - (groundFollow) 후방 슬롯: -1 좌, 1 우, 0 정중앙 뒤
 * @property {number} [angleDeg] - (groundFollow) side가 ±1일 때만 유저 후방 기준 좌우 벌림(도)
 * @property {number} [animationSpeed] - walk/idle timeScale; headFloat는 idle 클립에만 적용
 * @property {GumCardStickFollowerAttachMode} [attachMode] - 기본 `groundFollow`
 * --- headFloat 전용 ---
 * @property {'capsuleTop'|string} [headAnchor] - `capsuleTop`(바운딩 상단) 또는 본 이름 부분 문자열
 * @property {[number, number, number]} [headLocalOffset] - 유저 yaw 기준 로컬 오프셋 [우?, 상, 전방?] (m)
 * @property {number} [floatAmplitudeM] - 떠다니는 좌우·상하 진폭(m)
 * @property {number} [floatFrequencyHz] - 떠다니는 주파수
 * @property {number} [cameraFaceYawOffsetDeg] - `userYaw` 에 더할 yaw(도); 기본 0(유저와 동일 방향). GLB 전방이 다르면 조정
 * @property {number} [tiltForwardDeg] - 앞으로 눕힘(도), 양수면 rotation.x + 방향으로 보간
 * @property {number} [headingYawEase] - yaw 맞춤 속도(클수록 빠름). `1-exp(-ease*dt)` 보간; 생략 시 약 2.75
 * @property {number} [headFallbackYOffsetM] - 머리 앵커 실패 시 `position.y +` (m)
 */

/**
 * @typedef {Object} GumCardStickFollowerSpec
 * @property {string} [modelPath] - (groundFollow) 걷기/이동 클립 GLB
 * @property {string} [idleModelPath] - 서있기 GLB; headFloat는 이것만 로드
 * @property {number} [scale] - 루트 스케일 (생략 시 Stage3 gumFollowers.models.scale)
 * @property {GumCardStickFollowerBehaviorSpec} [behavior]
 */

/**
 * `idleModelPath` 제외 — 카드별로 동일
 * @type {Pick<GumCardStickFollowerSpec, "scale" | "behavior">}
 */
const GUM_CARD_STICK_FOLLOWER_SHARED = {
  scale: 1.4 / 2,
  behavior: {
    attachMode: "headFloat",
    headAnchor: "capsuleTop",
    headLocalOffset: [0.22, 2.1, 0.12],
    floatAmplitudeM: 0.07,
    floatFrequencyHz: 0.55,
    cameraFaceYawOffsetDeg: 0,
    tiltForwardDeg: 22,
    headingYawEase: 2.35,
    headFallbackYOffsetM: 3.7,
    animationSpeed: 1,
  },
};

/** @type {Readonly<Record<string, GumCardStickFollowerSpec>>} */
export const GUM_CARD_STICK_FOLLOWER_BY_NUM = {
  "01": {
    ...GUM_CARD_STICK_FOLLOWER_SHARED,
    idleModelPath: "/models/common/gum/taro_gum/gum_magnifier.glb",
  },
  "02": {
    ...GUM_CARD_STICK_FOLLOWER_SHARED,
    idleModelPath: "/models/common/gum/taro_gum/gum_flashlight.glb",
  },
  "03": {
    ...GUM_CARD_STICK_FOLLOWER_SHARED,
    idleModelPath: "/models/common/gum/taro_gum/gum_star.glb",
  },
  "04": {
    ...GUM_CARD_STICK_FOLLOWER_SHARED,
    idleModelPath: "/models/common/gum/taro_gum/gum_cloud.glb",
  },
  "05": {
    ...GUM_CARD_STICK_FOLLOWER_SHARED,
    idleModelPath: "/models/common/gum/taro_gum/gum_loudspeaker.glb",
  },
  "06": {
    ...GUM_CARD_STICK_FOLLOWER_SHARED,
    idleModelPath: "/models/common/gum/taro_gum/gum_boat.glb",
  },
};
