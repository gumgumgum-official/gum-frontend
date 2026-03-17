// Phase 6: 헤어짐 (공항 배경, 배웅)

/** @type {import("../../types.js").StageBasicConfig & { model: import("../../types.js").Stage2ModelConfig, speechBubbleMessages?: string[], cheerSoundPath?: string, characterModelPath?: string, characterScale?: number, characters?: Array<{ position?: { x?: number, y?: number, z?: number } }>, bench?: import("../../types.js").Stage3PropConfig }} */
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
  /** 말풍선 문구 (5명 순서대로), 변경 필요.... 수정 필요... */
  speechBubbleMessages: [
    "사랑해",
    "우리들이 항상 널 응원하고 있을거야! ",
    "다음에 또 힘든 일이 생기거나 우리가 보고 싶어지면 또 놀러와!",
    "무슨 일이 있어도 우린 너 편~",
    "우린 너만의 껌딱지 ><",
  ],
  /** 호버 시 재생할 환호성 사운드 경로 (public 기준, 없으면 재생 안 함) */
  cheerSoundPath: "/static/cheer.mp3",
  /** 캐릭터 GLB 경로 (5명 모두 동일 모델) */
  characterModelPath: "/models/common/user_walking_color.glb",
  /** 캐릭터 스케일 (1 = 원본 크기) */
  characterScale: 1,
  /** 벤치 */
  bench: {
    path: "/models/stage6/bench.glb",
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: 3,
  },
  /** 5명 캐릭터 위치 (x, y, z) */
  characters: [
    { position: { x: -3, y: 0.3, z: 4 } },
    { position: { x: -1.5, y: 0.3, z: 4 } },
    { position: { x: 0, y: 0.3, z: 4 } },
    { position: { x: 1.5, y: 0.3, z: 4 } },
    { position: { x: 3, y: 0.3, z: 4 } },
  ],
};
