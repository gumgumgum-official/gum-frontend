// Phase 5: 난 너의 편 (따뜻한 햇살 광장, 포옹)

/** @type {import("../../types.js").StageBasicConfig & { model: import("../../types.js").Stage2ModelConfig }} */
export const STAGE5_CONFIG = {
  camera: {
    fov: 60,
    near: 0.1,
    far: 1000,
    position: { x: 0, y: 5, z: 10 },
    // lookAt: { x: 0, y: 0, z: 0 }, // OrbitControls 활성화를 위해 주석 처리
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
