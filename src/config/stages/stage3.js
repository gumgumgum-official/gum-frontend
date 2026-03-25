// Phase 3: 부셔버리자
/// <reference path="../../types.js" />

import { getGLBLoader } from "../../utils/common/assetLoaders.js";
import { STAGE3_CHARACTER_CONFIG } from "./stage3/stage3CharacterConfig.js";
import { STAGE3_OBJECTS_CONFIG } from "./stage3/stage3ObjectsConfig.js";

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
  ...STAGE3_CHARACTER_CONFIG,
  ...STAGE3_OBJECTS_CONFIG,
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
