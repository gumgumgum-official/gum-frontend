// Phase 3: 부셔버리자
/// <reference path="../../../types.js" />

import { STAGE3_CHARACTER_CONFIG } from "./stage3CharacterConfig.js";
import { STAGE3_OBJECTS_CONFIG } from "./stage3ObjectsConfig.js";
import { STAGE3_AUDIO_CONFIG } from "./stage3AudioConfig.js";

/** @type {import("../../../types.js").Stage3Config} */
export const STAGE3_CONFIG = {
  /**
   * 낙하 글자 시작 XZ (월드; island GLB 원점 기준).
   */
  letterSpawnXZ: { x: 1.0, z: -30 },
  /** SVG 원본 크기와 무관하게 낙하 글자 그룹이 차지할 목표 월드 높이(Y) */
  letterTargetHeight: 3.24,
  camera: {
    fov: 42.0,
    near: 0.1,
    far: 1000,
    // Stage3: 글자를 조금 더 위에서 내려다보는 느낌으로 카메라 상승
    position: { x: -0.4, y: 9.0, z: 19.5 },
    lookAt: { x: 0.0, y: 1.0, z: 0.0 },
    /** 인트로 시작 카메라 위치 */
    introStartPos: { x: 159.0, y: 196.2, z: 37.4 },
    /** 인트로 끝 카메라 위치 */
    introEndPos: { x: -9.0, y: 202.3, z: 136.4 },
    /** 인트로 전 구간 고정 시선 */
    introLookAt: { x: 6.7, y: 19.2, z: -17.9 },
  },
  background: {
    // 수평선(t: 0.45~0.7) 주변을 촘촘한 유사 톤으로 연결해
    // 하늘/바다 경계가 딱 끊기지 않고 자연스럽게 섞이도록 조정
    gradient: {
      stops: [
        { t: 0, color: 0xe7d4f0 },
        { t: 0.14, color: 0xedcdbf },
        { t: 0.4, color: 0xeec9bd },
        { t: 0.52, color: 0xebc4be },
        { t: 0.62, color: 0xe7c0c1 },
        { t: 0.72, color: 0xe2bcc6 },
        { t: 0.84, color: 0xdebfd3 },
        { t: 1, color: 0xdac6e3 },
      ],
    },
  },
  audio: STAGE3_AUDIO_CONFIG,
  ...STAGE3_CHARACTER_CONFIG,
  ...STAGE3_OBJECTS_CONFIG,
};
