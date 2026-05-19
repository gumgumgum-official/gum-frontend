/** Stage3 오브제/배경: 씬 지오메트리는 단일 island GLB (Draco 압축 포함 가능) */

/**
 * `spawnFlowerAt` 등 랜덤 꽃 스폰에 쓰는 GLB. `stage3GltfWarmup`과 동기화.
 * @type {readonly string[]}
 */
export const STAGE3_STANDALONE_FLOWER_GLB_PATHS = [
  "/models/common/flowers/pink2.glb",
  "/models/common/flowers/white2.glb",
  "/models/common/flowers/red2.glb",
  "/models/common/flowers/purple2.glb",
  "/models/common/flowers/pastelpink2.glb",
  "/models/common/flowers/blue3.glb",
];

export const STAGE3_OBJECTS_CONFIG = {
  model: {
    path: "/models/stage3/island15.glb",
    useStaticObstacleColliders: true,
    position: { x: 0, y: 0, z: 0 },
    envMapIntensity: 1,
    castShadow: true,
    receiveShadow: true,
    /**
     * island 바운딩 min~max 보간으로 1차 후보 Y를 구한 뒤, `max - groundYInsetFromIslandTop`과
     * 둘 중 더 높은 값을 씀(절벽/물 아래 min 때문에 보간값만 쓰면 발이 지면보다 낮아짐).
     */
    groundYLerpFromIslandMinMax: 0.97,
    /** island 바운딩 max.y에서 빼는 값(m). 나무 꼭대기가 max면 조금 키워서 미세 조정 */
    groundYInsetFromIslandTop: 0.35,
    /**
     * 바다/물 앞에 항상 렌더링되어야 하는 GLB 노드 이름 목록.
     * 해당 노드의 메시 전체에 renderOrder=1을 설정해 투명 정렬에서 바다보다 나중에 그린다.
     * GLB 변경 시 이름이 바뀌면 여기만 수정하면 됨.
     */
    frontRenderObjectNames: [
      "OBJ_DogBalloon",
      "OBJ_BalloonHeart",
      "OBJ_BalloonStar",
      "OBJ_BalloonSun",
    ],
  },

  /**
   * 벤딩머신 클릭 스폰(캐논) 설정.
   * GLB 내 `INT_vending_machine`을 클릭하면 `spawnPaths` GLB를 복제해 튀어나옴.
   */
  vendingMachine: {
    spawnPaths: [
      "/models/stage3/can/can_red.glb",
      "/models/stage3/can/can_blue.glb",
      "/models/stage3/can/can_green.glb",
      "/models/stage3/can/can_yellow.glb",
      "/models/stage3/can/can_orange.glb",
      "/models/stage3/can/can_pink.glb",
      "/models/stage3/can/can_purple.glb",
      "/models/stage3/can/can_navy.glb",
      "/models/stage3/can/can_black.glb",
    ],
    spawnScale: 0.32,
    maxVisualSize: 0.88,
    minVisualSize: 0.3,
    /** 머신 앞면 표면까지 거리(m) */
    spawnRadiusMin: 0.45,
    /** 앞면 방향 기준 오른쪽 오프셋(m). 양수=오른쪽, 음수=왼쪽 */
    spawnLateralOffset: 0.18,
    /** 머신 bbox 중심 Y에서 아래로 내려 하단 슬롯 위치를 맞춤 */
    spawnHeightAboveMachine: -0.45,
    launchHorizontalMin: 3.7,
    launchHorizontalSpread: 2,
    launchUpMin: 4.2,
    launchUpSpread: 2.4,
    launchTowardPlayerSpread: 0.15,
    physicsGroundYOffset: 0.48,
    maxSpawns: 20,
    physicsSubsteps: 2,
    landSoundVolume: 2.8,
  },

  /** 게시판 모달: 사운드 + `NoticeModalBoard` 포스터 이미지(public 기준 경로) */
  notice: {
    paperSoundPaths: [
      "/static/sounds/paper/PaperMovement_fNAyV_01-2.mp3",
      "/static/sounds/paper/PaperMovement_fNAyV_01-3.mp3",
    ],
    /** 게시판·포스터 종이 효과음 볼륨 (1 초과 시 Web Audio 증폭) */
    paperSoundVolume: 3.6,
    posterImages: {
      party: "/assets/poster/festival_poster.png",
      bestGum: "/assets/poster/vote_poster.png",
      icecream: "/assets/poster/icecream_poster.png",
      guestbook: "/assets/poster/guestbook_poster.svg",
    },
    /** `GgumddiVoteSection` 후보 카드 이미지 (순서 = 1·2·3번) */
    voteCandidateImages: [
      "/assets/poster/vote_1.png",
      "/assets/poster/vote_2.png",
      "/assets/poster/vote_3.png",
    ],
  },

  /**
   * GLB `INT_tent` 클릭 → 껌 카드 모달. 클릭 시 아래 중 랜덤 1종 재생.
   * (파일명에 `#` 금지 — 정적 서버·Audio가 리소스를 못 찾는 경우가 많음)
   */
  tent: {
    tentSoundPaths: [
      "/static/sounds/tent/Quick_fabric_rustlin_1-1775835446790.mp3",
      "/static/sounds/tent/Quick_fabric_rustlin_2-1775835457914.mp3",
      "/static/sounds/tent/Quick_fabric_rustlin_3-1775835465321.mp3",
      "/static/sounds/tent/Quick_fabric_rustlin_4-1775835465322.mp3",
    ],
    /** 텐트 클릭 시 효과음 볼륨 (1 초과 시 Web Audio 증폭) */
    tentSoundVolume: 1.1,
    /** 껌 카드 모달이 열려 있는 동안 루프 재생 */
    tentModalBgmPath: "/static/sounds/card/The_Waking_Meridian.mp3",
    tentModalBgmVolume: 0.27,
    /** 모달 BGM 0 → 목표 볼륨까지 올리는 시간(초) */
    tentModalBgmFadeInSec: 3.7,
    /**
     * 텐트 씬 뷰어 초기 카메라. OrbitControls로 원하는 각도를 찾은 뒤
     * 콘솔 로그에 출력된 값을 여기에 붙여넣어 고정한다.
     */
    tentSceneCamera: {
      position: [-0.38, 6.169, 4.83],
      target: [0.03, 3.474, -1.068],
    },
    /** 텐트 씬 진입 대사 — Stage6BoardingOverlay subtitle-box 시퀀스 */
    tentSceneSubtitles: [
      { text: "안녕, 만나서 반가워", holdMs: 2500 },
      {
        text: "이곳에서 너에게 필요한 껌딱지 카드를 고를 수 있어!",
        holdMs: 3500,
      },
    ],
    /** runSubtitleSequence: hold + fade(600) + gap(200) × 구간 */
    tentSceneSubtitleTotalMs: 2500 + 600 + 200 + 3500 + 600,
  },

  /**
   * GLB `INT_Well` 클릭 시 `static/sounds/well` 중 랜덤 1종 재생.
   */
  well: {
    wellSoundPaths: [
      "/static/sounds/well/A_single_drip_sound__1.mp3",
      "/static/sounds/well/A_single_drip_sound__2.mp3",
    ],
    wellSoundVolume: 2.8,
  },

  /**
   * GLB `INT_Clock` 클릭 시 `static/sounds/clock` 중 랜덤 1종 재생.
   */
  clock: {
    clockSoundPaths: [
      "/static/sounds/clock/Gentle_digital_beep-_1.mp3",
      "/static/sounds/clock/Gentle_digital_beep-_2.mp3",
      "/static/sounds/clock/Gentle_digital_beep-_3.mp3",
      "/static/sounds/clock/Gentle_digital_beep-_4.mp3",
    ],
    clockSoundVolume: 2.8,
  },

  /**
   * GLB `INT_StreetLight*` 클릭 시 랜덤 1종.
   * 단일 HTMLAudioElement로 `src` 전환(매 클릭 `new Audio()`는 일부 환경에서 이전 트랙만 재생되는 경우가 있음).
   */
  streetLight: {
    streetLightSoundPaths: [
      "/static/sounds/light/the_sound_of_a_light_1.mp3",
      "/static/sounds/light/the_sound_of_a_light_2.mp3",
      "/static/sounds/light/the_sound_of_a_light_3.mp3",
    ],
    streetLightSoundVolume: 2.8,
  },

  /**
   * 포탈: GLB의 `INT_Portal` 메시를 클릭하면 `targetStage`로 전환합니다.
   * `position` / `normal` / `halfWidth`는 예전 평면 통과 로직용으로 남겨 두었으며 현재는 사용하지 않습니다.
   */
  portal_bright: {
    position: { x: -3, y: -0.3, z: 12 },
    normal: { x: 0, y: 0, z: 1 },
    halfWidth: 4,
    targetStage: 6,
    /** INT_Portal 클릭으로 스테이지 전환이 시작될 때 재생 (랜덤 1종) */
    portalTransitionSoundPaths: [
      "/static/sounds/potal/transition1.mp3",
      "/static/sounds/potal/transition2.mp3",
      "/static/sounds/potal/transition3.mp3",
    ],
    portalTransitionSoundVolume: 1.1,
  },
};
