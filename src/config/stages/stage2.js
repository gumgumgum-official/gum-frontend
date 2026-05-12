// Phase 2: 고민 시각화 (Beam Projector, 둥근 섬)

/** @type {import("../../types.js").Stage2Config} */
export const STAGE2_CONFIG = {
  camera: {
    fov: 25.0,
    near: 1,
    far: 20000,
    position: { x: 107.7, y: 70.2, z: -44.4 },
    lookAt: { x: -14.9, y: 5.6, z: -11.1 },
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
    path: "/models/stage2/beam4.glb",
    position: { x: 0, y: 0, z: 0 },
    envMapIntensity: 1,
    castShadow: true,
    receiveShadow: true,
  },
  /** 캐릭터 GLB 경로 (5명 모두 동일 모델) */
  characterModelPath: "/models/common/gum/gum_walk_final.glb",
  /** 캐릭터 스케일 (1 = 원본 크기) */
  characterScale: 1.7,
  /** 초기 위치를 고정 좌표로 사용 */
  scatterCharacters: false,
  /** 분산 시 서로 최소 이 거리(m) 이상 */
  characterScatterMinDistance: 4,
  /** 5명 고정 시작 좌표 */
  characters: [
    { position: { x: -14.8, z: 0.2 } },
    { position: { x: 14.9, z: -0.6 } },
    { position: { x: 0.4, z: 12.6 } },
    { position: { x: -0.3, z: -13.2 } },
    { position: { x: 0.1, z: 0.4 } },
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
