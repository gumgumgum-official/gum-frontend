// Phase 3: 부셔버리자 (밝은 초원, 스트레스 해소)

/** @type {import("../../types.js").Stage3Config} */
export const STAGE3_CONFIG = {
  camera: {
    fov: 60.0,
    near: 0.1,
    far: 1000,
    // Stage3: 글자를 조금 더 위에서 내려다보는 느낌으로 카메라 상승
    position: { x: -0.4, y: 9.0, z: 19.5 },
    lookAt: { x: 0.0, y: 1.0, z: 0.0 },
  },
  background: {
    color: 0x98d8aa, // 밝은 초원
  },
  /** 캐릭터 GLB 경로 */
  characterModelPath: "/models/common/user_walking_color.glb",
  model: {
    path: "/models/stage3/part3_2.glb",
    position: { x: 0, y: 0, z: 0 },
    envMapIntensity: 1,
    castShadow: true,
    receiveShadow: true,
  },
  /** 캐릭터 이동·카메라 (Stage3 전용) */
  character: {
    groundOffset: 0.2, // 배경 위에 설 때 y 여유 공간
    moveSpeed: 5.0, // 이동 속도
    boundsPadding: 0.5, // 바운드 경계 여유 공간 (가장자리 미끄러짐 방지)
    cameraOffset: { x: 0, y: 3, z: 8 }, // 캐릭터 뒤쪽 카메라 오프셋
    cameraLerpFactor: 0.1, // 카메라 부드러운 추적 강도
    lookAtHeightOffset: 1, // lookAt 시 캐릭터 머리 높이
  },
};
