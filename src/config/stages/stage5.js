// Phase 5: 난 너의 편 (따뜻한 햇살 광장, 포옹)

/** @type {import("../../types.js").StageBasicConfig & { model: import("../../types.js").Stage2ModelConfig }} */
export const STAGE5_CONFIG = {
  camera: {
    fov: 60.0,
    near: 0.1,
    far: 1000,
    position: { x: 0.2, y: 5.0, z: 0.3 },
    lookAt: { x: 0.2, y: 3.8, z: -1.9 },
  },
  background: {
    color: 0xffeaa7, // 따뜻한 햇살
  },
  model: {
    path: "/models/stage5/part5_2.glb",
    position: { x: 0, y: 0, z: 0 },
    envMapIntensity: 1,
    castShadow: true,
    receiveShadow: true,
  },
};
