// Phase 2: 고민 시각화 (Beam Projector, 둥근 섬)

/** @type {import("../../types.js").Stage2Config} */
export const STAGE2_CONFIG = {
  camera: {
    fov: 25.0,
    near: 1,
    far: 20000,
    position: { x: -92.9, y: 82.1, z: -81.7 },
    lookAt: { x: 4.8, y: 17.2, z: -24.3 },
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
    path: "/models/stage2/island4_1.glb",
    position: { x: 0, y: 0, z: 0 },
    envMapIntensity: 1,
    castShadow: true,
    receiveShadow: true,
  },
  /** 캐릭터 GLB 경로 (5명 모두 동일 모델) */
  characterModelPath: "/models/common/walk__gum.glb",
  /** 캐릭터 스케일 (1 = 원본 크기) */
  characterScale: 0.5,
  /** 5명 캐릭터 위치 (x, y, z) - 섬 위에 배치 */
  characters: [
    { position: { x: -4, y: 0.7, z: 1 } },
    { position: { x: -2, y: 0.7, z: 2 } },
    { position: { x: 0, y: 0.7, z: 2 } },
    { position: { x: 2, y: 0.7, z: 2 } },
    { position: { x: 4, y: 0.7, z: 1 } },
  ],
  props: [
    {
      path: "/models/collision.glb",
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: -90, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
  ],
};
