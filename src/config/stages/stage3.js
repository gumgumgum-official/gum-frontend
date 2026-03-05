// Phase 3: 부셔버리자
/// <reference path="../../types.js" />

import { getGLBLoader } from "../../utils/common/assetLoaders.js";

/** @type {import("../../types.js").Stage3Config} */
export const STAGE3_CONFIG = {
  camera: {
    fov: 60.0,
    near: 0.1,
    far: 1000,
    position: { x: -0.4, y: 6.6, z: 19.5 },
    lookAt: { x: 0.0, y: 1.2, z: 0.0 },
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
  /** 13. 아이스크림 카트 (클릭 시 아이스크림 랜덤 스폰) */
  icecreamCart: {
    path: "/models/stage3/icecream_cart.glb",
    position: { x: 6, y: 0.4, z: 8 },
    rotation: { x: 0, y: -40, z: 0 },
    scale: 1,
    /** 클릭 시 랜덤 스폰될 아이스크림 모델 경로 */
    spawnPaths: [
      "/models/stage3/ice1.glb",
      "/models/stage3/ice2_white.glb",
      "/models/stage3/ice2_pink.glb",
    ],
    spawnScale: 0.4,
    /** 스폰 최대 개수 (이 이상 클릭해도 생성 안 됨) */
    maxSpawns: 15,
  },
  /** tree1 모델 */
  tree1: {
    path: "/models/common/trees/tree1.glb",
    position: { x: -5.5, y: -0.4, z: -8 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: 4,
  },
  /** 게시판 */
  notice: {
    path: "/models/stage3/notice.glb",
    position: { x: -4, y: -0.4, z: -4 },
    rotation: { x: 0, y: 20, z: 0 },
    scale: 1.8,
    /** 클릭 시 재생할 종이 소리 경로 (랜덤 1개) */
    paperSoundPaths: [
      "/static/sounds/paper/PaperMovement_fNAyV_01-2.mp3",
      "/static/sounds/paper/PaperMovement_fNAyV_01-3.mp3",
    ],
  },
  /** 마법 포탈 */
  portal_bright: {
    path: "/models/stage3/portal_bright.glb",
    position: { x: -3, y: -0.3, z: 12 },
    rotation: { x: 0, y: 40, z: 0 },
    scale: 2,
  },
  /** 껌딱지 동상 */
  statue: {
    path: "/models/stage3/statue.glb",
    position: { x: 0, y: -0.4, z: -6 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: 3,
  },
  /** 우물 */
  well: {
    path: "/models/stage3/well.glb",
    position: { x: -10, y: -0.4, z: 0 },
    rotation: { x: 0, y: 50, z: 0 },
    scale: 2.8,
  },
  /** 시계 */
  clock: {
    path: "/models/stage3/clock.glb",
    position: { x: 10.4, y: -0.2, z: -6.1 },
    rotation: { x: 0, y: -10, z: 0 },
    scale: 0.5,
  },
  /** 분수대 */
  water: {
    path: "/models/stage3/water.glb",
    position: { x: 0, y: -0.4, z: 5 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: 2.5,
  },
  /** 게임기 */
  gameMachine: {
    path: "/models/stage3/gameMachine.glb",
    position: { x: 10, y: -0.4, z: 1 },
    rotation: { x: 0, y: -70, z: 0 },
    scale: 0.8,
  },
  /** 벤치 */
  bench: {
    path: "/models/stage3/bench.glb",
    position: { x: 8, y: 0.4, z: -8 },
    rotation: { x: 0, y: -15, z: 0 },
    scale: 1,
  },
  /** 간판 */
  signs: {
    path: "/models/stage3/Signs.glb",
    position: { x: -2.8, y: -0.4, z: 7.5 },
    rotation: { x: 0, y: -60, z: 0 },
    scale: 0.8,
  },
};

/**
 * icecream.glb, rainbow_icecream.glb 모델을 assetLoaders로 로드
 * @returns {Promise<Array<{ scene: import("three").Group }>>} [{ scene }, { scene }]
 */
export async function loadIceCreamSpawnModels() {
  const spawnPaths = STAGE3_CONFIG.icecreamCart?.spawnPaths ?? [
    "/models/stage3/icecream.glb",
    "/models/stage3/rainbow_icecream.glb",
  ];
  const glbLoader = getGLBLoader();
  const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
  const templates = [];
  for (const p of spawnPaths) {
    try {
      const gltf = await glbLoader.loadAsync(base + p);
      templates.push({ scene: gltf.scene });
    } catch (e) {
      console.warn("[Stage3] 아이스크림 스폰 모델 로드 실패:", p, e);
    }
  }
  return templates;
}
