// Phase 4: 털어버리자 (콘서트장/파티장, Confetti)

/** @type {import("../../types.js").StageBasicConfig & { model: import("../../types.js").Stage2ModelConfig }} */
export const STAGE4_CONFIG = {
  camera: {
    fov: 60.0,
    near: 0.1,
    far: 1000,
    position: { x: 0.0, y: 7.4, z: 2.9 },
    lookAt: { x: 0.0, y: 6.0, z: 0.2 },
  },
  background: {
    color: 0x1a1a2e, // 파티장 분위기
  },
  model: {
    path: "/models/stage4/part4_1.glb",
    position: { x: 0, y: 0, z: 0 },
    envMapIntensity: 1,
    castShadow: true,
    receiveShadow: true,
  },
};
