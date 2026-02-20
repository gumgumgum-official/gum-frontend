// Phase 2: 고민 시각화 (Beam Projector, 둥근 섬)

/** @type {import("../../types.js").Stage2Config} */
export const STAGE2_CONFIG = {
  camera: {
    fov: 25.0,
    near: 1,
    far: 20000,
    // position = 카메라 위치 (맨꼭대기/측면 등 시점은 여기만 바꾸면 됨)
    position: { x: -0.2, y: 8.7, z: 17.3 },
    // lookAt = 바라보는 점 (보통 씬 중심 (0,0,0) 고정. 맨꼭대기/측면 다 같아도 됨)
    lookAt: { x: 0.0, y: 0.0, z: 0.0 },
  },
  fog: {
    color: 0xb0e0e6,
    near: 4000,
    far: 10000,
  },
  background: {
    color: 0xb0e0e6,
  },
  model: {
    path: "/models/stage2/background1.glb",
    position: { x: 0, y: 0, z: 0 },
    envMapIntensity: 1,
    castShadow: true,
    receiveShadow: true,
  },
  props: [
    {
      path: "/models/collision.glb",
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: -90, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
  ],
};
