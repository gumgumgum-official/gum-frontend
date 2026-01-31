// Phase 2: 고민 시각화 (Beam Projector, 둥근 섬)

export const STAGE2_CONFIG = {
  camera: {
    fov: 25,
    near: 1,
    far: 20000,
    position: { x: 0, y: 750, z: 830 },
    rotation: { x: -30, y: 0, z: 0 }, // degrees
  },
  fog: {
    color: 0xb0e0e6,
    near: 4000,
    far: 10000,
  },
  background: {
    color: 0xb0e0e6,
  },
  sea: {
    size: { width: 10000, height: 10000 },
    color: 0xb0e0e6,
    roughness: 0.3,
    metalness: 0.2,
    position: { x: 0, y: 0, z: 0 },
  },
  model: {
    path: "/models/background_2.fbx",
    position: { x: 0, y: 0, z: 0 },
    envMapIntensity: 1,
    castShadow: true,
    receiveShadow: true,
  },
};
