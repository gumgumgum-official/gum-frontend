// Phase 6: 헤어짐 (공항 배경, 배웅)

/** @type {import("../../types.js").StageBasicConfig & { model: import("../../types.js").Stage2ModelConfig, characters?: Array<{ position?: { x?: number, y?: number, z?: number } }> }} */
export const STAGE6_CONFIG = {
  camera: {
    fov: 60.0,
    near: 0.1,
    far: 1000,
    position: { x: 0.0, y: 4.0, z: 11.5 },
    lookAt: { x: -0.0, y: 0.6, z: -0.4 },
  },
  background: {
    color: 0xdfe6e9, // 공항 하이앵글
  },
  model: {
    path: "/models/stage6/part6_1.glb",
    position: { x: 0, y: 0, z: 0 },
    envMapIntensity: 1,
    castShadow: true,
    receiveShadow: true,
  },
  /** 5명 캐릭터 위치 (x, y, z) */
  characters: [
    { position: { x: -3, y: 0.3, z: 4 } },
    { position: { x: -1.5, y: 0.3, z: 4 } },
    { position: { x: 0, y: 0.3, z: 4 } },
    { position: { x: 1.5, y: 0.3, z: 4 } },
    { position: { x: 3, y: 0.3, z: 4 } },
  ],
};
