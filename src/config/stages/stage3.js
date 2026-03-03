// Phase 3: 부셔버리자

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
    position: { x: 5, y: 0.4, z: 7.5 },
    rotation: { x: 0, y: -40, z: 0 },
    scale: 1,
    /** 클릭 시 랜덤 스폰될 아이스크림 모델 경로 */
    /**TODO: 모델 수정 필요 아이스크림으로!~!! */
    spawnPaths: [
      "/models/common/flowers/blue3.glb",
      "/models/common/flowers/red2.glb",
    ],
    spawnScale: 0.5,
  },
  /** tree1 모델 */
  tree1: {
    path: "/models/common/trees/tree1.glb",
    position: { x: -5.5, y: -0.4, z: -8 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: 4,
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
