// Phase 4: 털어버리자 (콘서트장/파티장, Confetti)

/** @type {import("../../types.js").StageBasicConfig} */
export const STAGE4_CONFIG = {
  camera: {
    fov: 60,
    near: 0.1,
    far: 1000,
    position: { x: 0, y: 5, z: 10 },
    lookAt: { x: 0, y: 0, z: 0 },
  },
  background: {
    color: 0x1a1a2e, // 파티장 분위기
  },
};
