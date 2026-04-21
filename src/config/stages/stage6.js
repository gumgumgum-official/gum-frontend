// Phase 6: 헤어짐 (공항 배경, 배웅)

import { STAGE3_CHARACTER_CONFIG } from "./stage3/stage3CharacterConfig.js";

/**
 * Stage6 유저 GLB 시각 스케일 (Stage3 `character.scale`에 곱함).
 * 0.3보다 작게만 쭉 줄이면 groundOffset까지 같이 작아져 발이 바닥에 묻혀 “안 보임”처럼 느껴질 수 있음 → 아래 MIN과 함께 조절.
 */
const STAGE6_USER_SCALE_VS_STAGE3 = 0.3;
/** 배율로 깎인 groundOffset이 너무 작을 때 발 보정 하한 (월드 m) */
const STAGE6_USER_GROUND_OFFSET_MIN = 0.1;
/** Stage3(5)보다 느리게 — 고정 카메라·실내에서 한 칸씩 움직이는 느낌 */
const STAGE6_MOVE_SPEED = 1.85;

/** @type {import("../../types.js").Stage6Config} */
export const STAGE6_CONFIG = {
  camera: {
    fov: 60,
    near: 0.1,
    far: 1000,
    position: { x: -2.32, y: 3.69, z: 3.85 },
    lookAt: { x: -3.24, y: 2.49, z: -0.01 },
  },
  background: {
    color: 0xdfe6e9, // 공항 하이앵글
  },
  model: {
    path: "/models/stage6/airport3_with_characters.glb",
    position: { x: 0, y: 0, z: 0 },
    envMapIntensity: 1,
    castShadow: true,
    receiveShadow: true,
  },
  boardPosterImage: "/assets/poster/stamp_poster.png",
  characterModelPath: STAGE3_CHARACTER_CONFIG.characterModelPath,
  characterIdleModelPath: STAGE3_CHARACTER_CONFIG.characterIdleModelPath,
  /** Stage3와 동일 로직·수치 기반, 공항용으로 시각 스케일만 축소 */
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
