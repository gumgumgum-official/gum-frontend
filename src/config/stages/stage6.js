// Phase 6: 헤어짐 (공항 배경, 배웅)

/** @type {import("../../types.js").StageBasicConfig & { model: import("../../types.js").Stage2ModelConfig, bench?: import("../../types.js").Stage3PropConfig, curtain?: { path: string, position?: { x?: number, y?: number, z?: number }, rotation?: { x?: number, y?: number, z?: number }, scale?: number, castShadow?: boolean, receiveShadow?: boolean } }} */
export const STAGE6_CONFIG = {
  camera: {
    fov: 60.0,
    near: 0.1,
    far: 1000,
    position: { x: 0.0, y: 4.0, z: 11.5 },
    //lookAt: { x: -0.0, y: 0.6, z: -0.4 },
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
  /** 벤치 */
  bench: {
    path: "/models/stage6/bench.glb",
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: 3,
  },
  /** 커튼 (FBX) */
  curtain: {
    path: "/models/stage6/curtain_anim6.fbx",
    position: { x: -10, y: 0, z: 8.2 },
    rotation: { x: 0, y: 0, z: 0 }, // degrees
    scale: 0.1,
    castShadow: true,
    receiveShadow: true,
  },
};
