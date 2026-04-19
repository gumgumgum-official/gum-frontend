// Phase 6: 헤어짐 (공항 배경, 배웅)

/** @type {import("../../types.js").StageBasicConfig & { model: import("../../types.js").Stage2ModelConfig, bench?: import("../../types.js").Stage3PropConfig, curtain?: { path: string, position?: { x?: number, y?: number, z?: number }, rotation?: { x?: number, y?: number, z?: number }, scale?: number, castShadow?: boolean, receiveShadow?: boolean }, boardPosterImage?: string, airplane?: { path: string } }} */
export const STAGE6_CONFIG = {
  camera: {
    fov: 60,
    near: 0.1,
    far: 1000,
    position: { x: -3.02, y: 3.89, z: 4.19 },
    lookAt: { x: -5.81, y: -1.01, z: -10.53 },
  },
  background: {
    color: 0xdfe6e9, // 공항 하이앵글
  },
  model: {
    path: "/models/stage6/airport3_compression.glb",
    position: { x: 0, y: 0, z: 0 },
    envMapIntensity: 1,
    castShadow: true,
    receiveShadow: true,
  },
  /** 로딩 오버레이 전용 비행기 GLB (탑승하기 트랜지션) */
  airplane: {
    path: "/models/stage6/airplane_compression.glb",
  },
  boardPosterImage: "/assets/poster/stamp_poster.png",
};
