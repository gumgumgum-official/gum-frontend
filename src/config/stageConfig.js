// 스테이지별 설정값

export const STAGE_CONFIG = {
  stage1: {
    camera: {
      fov: 60,
      near: 0.1,
      far: 1000,
      position: { x: 0, y: 5, z: 10 },
      lookAt: { x: 0, y: 0, z: 0 },
    },
    background: {
      color: 0x87ceeb,
    },
    cube: {
      size: { width: 2, height: 2, depth: 2 },
      color: 0xff0000,
    },
  },

  stage2: {
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
      path: "/models/background1.glb",
      position: { x: 0, y: 0, z: 0 },
      envMapIntensity: 1,
      castShadow: true,
      receiveShadow: true,
    },
    // 배경 위에 올릴 오브제 (여러 개 가능)
    props: [
      {
        path: "/models/collision.glb",
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: -90, y: 0, z: 0 }, // 90도 회전 (거꾸로 매달림 보정)
        scale: { x: 1, y: 1, z: 1 },
      },
    ],
  },
};
