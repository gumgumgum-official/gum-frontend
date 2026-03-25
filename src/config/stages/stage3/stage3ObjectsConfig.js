/** Stage3 오브제/배경 오브젝트 관련 config만 모아둔 파일 */

export const STAGE3_OBJECTS_CONFIG = {
  model: {
    path: "/models/stage3/island.glb",
    position: { x: 0, y: 0, z: 0 },
    envMapIntensity: 1,
    castShadow: true,
    receiveShadow: true,
  },

  /** 13. 아이스크림 카트 (클릭 시 아이스크림 랜덤 스폰) */
  icecreamCart: {
    path: "/models/stage3/icecream_cart.glb",
    position: { x: 6, y: 0.4, z: 8 },
    rotation: { x: 0, y: -40, z: 0 },
    scale: 1,
    /** 클릭 시 랜덤 스폰될 아이스크림 모델 경로 */
    spawnPaths: [
      "/models/stage3/ice1.glb",
      "/models/stage3/ice2_white.glb",
      "/models/stage3/ice2_pink.glb",
    ],
    spawnScale: 0.4,
    /** 스폰 최대 개수 (이 이상 클릭해도 생성 안 됨) */
    maxSpawns: 10,
    /** Cannon 물리 서브스텝 (1~3, 낮을수록 성능 우선) */
    physicsSubsteps: 2,
  },

  /** tree1 모델 */
  tree1: {
    path: "/models/common/trees/tree1.glb",
    position: { x: -5.5, y: -0.4, z: -8 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: 4,
  },

  /** 게시판 */
  notice: {
    path: "/models/stage3/notice.glb",
    position: { x: -4, y: -0.4, z: -4 },
    rotation: { x: 0, y: 20, z: 0 },
    scale: 1.8,
    /** 클릭 시 재생할 종이 소리 경로 (랜덤 1개) */
    paperSoundPaths: [
      "/static/sounds/paper/PaperMovement_fNAyV_01-2.mp3",
      "/static/sounds/paper/PaperMovement_fNAyV_01-3.mp3",
    ],
  },

  /** 마법 포탈 (평면 통과 시 Stage 6로 전환) */
  portal_bright: {
    path: "/models/stage3/portal_bright.glb",
    position: { x: -3, y: -0.3, z: 12 },
    rotation: { x: 0, y: 40, z: 0 },
    scale: 2,
    /** 평면 법선 (XZ, 정규화됨). 캐릭터가 이 방향→반대방향으로 평면을 가로지르면 전환 */
    normal: { x: 0, z: 1 },
    /** 포탈 중심으로부터 수평(법선에 수직) 허용 반거리. 이 거리 밖 통과는 무시 */
    halfWidth: 2,
    targetStage: 6,
  },

  /** 껌딱지 동상 */
  statue: {
    path: "/models/stage3/statue.glb",
    position: { x: 0, y: -0.4, z: -6 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: 3,
  },

  /** 우물 */
  well: {
    path: "/models/stage3/well.glb",
    position: { x: -10, y: -0.4, z: 0 },
    rotation: { x: 0, y: 50, z: 0 },
    scale: 2.8,
  },

  /** 시계 */
  clock: {
    path: "/models/stage3/clock.glb",
    position: { x: 10.4, y: -0.2, z: -6.1 },
    rotation: { x: 0, y: -10, z: 0 },
    scale: 0.5,
  },

  /** 분수대 */
  water: {
    path: "/models/stage3/water.glb",
    position: { x: 0, y: -0.4, z: 5 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: 2.5,
  },

  /** 게임기 */
  gameMachine: {
    path: "/models/stage3/gameMachine.glb",
    position: { x: 10, y: -0.4, z: 1 },
    rotation: { x: 0, y: -70, z: 0 },
    scale: 0.8,
  },

  /** 벤치 */
  bench: {
    path: "/models/stage3/bench.glb",
    position: { x: 8, y: 0.4, z: -8 },
    rotation: { x: 0, y: -15, z: 0 },
    scale: 1,
  },

  /** 간판 */
  signs: {
    path: "/models/stage3/Signs.glb",
    position: { x: -2.8, y: -0.4, z: 7.5 },
    rotation: { x: 0, y: -60, z: 0 },
    scale: 0.8,
  },

  /** 거울 (FBX) */
  mirror: {
    path: "/models/stage3/mirror.fbx",
    position: { x: 7, y: 1.6, z: -15 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: 0.1,
  },
};
