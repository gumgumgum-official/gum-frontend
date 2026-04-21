// Phase 6: 헤어짐 (공항 배경, 배웅)

import { STAGE3_CHARACTER_CONFIG } from "./stage3/stage3CharacterConfig.js";

/**
 * Stage6 유저 GLB 시각 스케일 (Stage3 `character.scale`에 곱함).
 * 너무 작게 줄이면 groundOffset까지 함께 줄어 바닥에 묻혀 보일 수 있다.
 */
const STAGE6_USER_SCALE_VS_STAGE3 = 0.3;
/** 배율로 줄인 발 보정의 하한값 */
const STAGE6_USER_GROUND_OFFSET_MIN = 0.1;
/** Stage3(5)보다 느리게 — 고정 카메라 실내 이동 속도 */
const STAGE6_MOVE_SPEED = 1.85;

/** @type {import("../../types.js").Stage6Config} */
export const STAGE6_CONFIG = {
  camera: {
    fov: 60,
    near: 0.1,
    far: 1000,
    position: { x: -3.02, y: 3.89, z: 4.19 },
    lookAt: { x: -5.81, y: -1.01, z: -10.53 },
  },
  background: {
    color: 0x042d5b, // 어두운 남색 (밖/하늘 영역)
  },
  /** initThreeApp 기본 노출 대비 Stage6에서만 밝게 (WebGLRenderer.toneMappingExposure 가산) */
  toneMappingExposureDelta: 0.18,
  model: {
    path: "/models/stage6/airport3_compression.glb",
    position: { x: 0, y: 0, z: 0 },
    envMapIntensity: 1,
    castShadow: true,
    receiveShadow: true,
  },
  /** 로딩 오버레이 전용 비행기 GLB (탑승하기 트랜지션) */
  airplane: {
    path: "/models/stage6/airplane_compression.glb",
  },
  boardPosterImage: "/assets/poster/stamp_poster.png",
  characterModelPath: STAGE3_CHARACTER_CONFIG.characterModelPath,
  characterIdleModelPath: STAGE3_CHARACTER_CONFIG.characterIdleModelPath,
  character: {
    ...STAGE3_CHARACTER_CONFIG.character,
    scale:
      (STAGE3_CHARACTER_CONFIG.character.scale ?? 0.35) *
      STAGE6_USER_SCALE_VS_STAGE3,
    collisionRadius:
      (STAGE3_CHARACTER_CONFIG.character.collisionRadius ?? 0.65) *
      STAGE6_USER_SCALE_VS_STAGE3,
    groundOffset: Math.max(
      STAGE3_CHARACTER_CONFIG.character.groundOffset *
        STAGE6_USER_SCALE_VS_STAGE3,
      STAGE6_USER_GROUND_OFFSET_MIN,
    ),
    moveSpeed: STAGE6_MOVE_SPEED,
    spawnOffset: { x: 0, z: 0 },
    escalatorFrontDistance: 1.15,
  },
};
