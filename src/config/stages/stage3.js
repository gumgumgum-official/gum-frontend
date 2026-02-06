// Phase 3: 부셔버리자 (밝은 초원, 스트레스 해소)

/** @type {import("../../types.js").StageBasicConfig & { model: import("../../types.js").Stage2ModelConfig }} */
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
  model: {
    path: "/models/stage3/part3_2.glb",
    position: { x: 0, y: 0, z: 0 },
    envMapIntensity: 1,
    castShadow: true,
    receiveShadow: true,
  },
};
