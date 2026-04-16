// Phase 6: 헤어짐 (공항 배경, 배웅)

/** @type {import("../../types.js").StageBasicConfig & { model: import("../../types.js").Stage2ModelConfig, bench?: import("../../types.js").Stage3PropConfig, curtain?: { path: string, position?: { x?: number, y?: number, z?: number }, rotation?: { x?: number, y?: number, z?: number }, scale?: number, castShadow?: boolean, receiveShadow?: boolean } }} */
export const STAGE6_CONFIG = {
  camera: {
    fov: 60,
    near: 0.1,
    far: 1000,
    position: { x: -2.32, y: 3.69, z: 3.85 },
    lookAt: { x: -3.24, y: 2.49, z: -0.01 },
  },
  background: {
    color: 0xdfe6e9, // 공항 하이앵글
  },
  model: {
    path: "/models/stage6/airport.glb",
    position: { x: 0, y: 0, z: 0 },
    envMapIntensity: 1,
    castShadow: true,
    receiveShadow: true,
  },
};
