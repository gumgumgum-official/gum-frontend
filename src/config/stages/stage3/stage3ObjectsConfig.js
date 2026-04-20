/** Stage3 오브제/배경: 씬 지오메트리는 단일 island GLB (Draco 압축 포함 가능) */

export const STAGE3_OBJECTS_CONFIG = {
  model: {
    path: "/models/stage3/island9_portal_fixed.glb",
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
  },

  /**
   * 아이스크림 클릭 스폰(캐논) 설정.
   * GLB 내 `INT_icecream` / `INT_IceCart` 등(icecream 타깃)을 클릭하면 `spawnPaths` GLB를 복제해 튀어나옴.
   */
  icecreamCart: {
    spawnPaths: [
      "/models/stage3/icecream.glb",
      "/models/stage3/rainbow_icecream.glb",
    ],
    spawnScale: 0.65,
    // 원본 GLB 스케일 편차 방지용: 스폰 모델의 최대 외곽 길이(월드 단위) 상한
    maxVisualSize: 1.75,
    // 원본 GLB가 너무 작게 잡히는 경우 가시성 보장용 최소 외곽 길이
    minVisualSize: 0.6,
    /** 카트 중심에서 스폰 지점까지 최소 거리(m) */
    spawnRadiusMin: 0.52,
    /** 카트 중심에서 스폰 지점까지 최대 거리(m) */
    spawnRadiusMax: 1.95,
    /** 스폰 높이: 카트 중심 Y + 이 값과 지면+0.45 중 큰 값 */
    spawnHeightAboveCart: 0.8,
    /** 스폰 높이 ± 무작위 흔들림(m) */
    spawnHeightJitter: 0.28,
    /** 튀어나갈 때 수평 속도 최소(m/s), 여기에 launchHorizontalSpread만큼 무작위 가산 */
    launchHorizontalMin: 3.7,
    launchHorizontalSpread: 2,
    /** 수직 초기 속도 최소(m/s), 여기에 launchUpSpread만큼 무작위 가산 */
    launchUpMin: 4.2,
    launchUpSpread: 2.4,
    /** 캐릭터 방향으로 던질 때 좌우 흔들림(라디안). 0이면 정확히 캐릭터 쪽 */
    launchTowardPlayerSpread: 0.28,
    /**
     * 아이스크림 물리 바닥 = 처리지 Y + 이 값. 섬 메시가 더 높게 보이면 파묻혀 보이므로 올려 맞춤(m).
     */
    physicsGroundYOffset: 0.48,
    maxSpawns: 20,
    physicsSubsteps: 2,
    /** 스폰 아이스크림이 지면에 닿을 때 `static/sounds/icecream` 재생 볼륨 (0~1) */
    landSoundVolume: 0.02,
  },

  /** 게시판 모달: 사운드 + `NoticeModalBoard` 포스터 이미지(public 기준 경로) */
  notice: {
    paperSoundPaths: [
      "/static/sounds/paper/PaperMovement_fNAyV_01-2.mp3",
      "/static/sounds/paper/PaperMovement_fNAyV_01-3.mp3",
    ],
    /** 게시판·포스터 종이 효과음 볼륨 (0~1) */
    paperSoundVolume: 0.98,
    posterImages: {
      party: "/assets/poster/festival_poster.png",
      bestGum: "/assets/poster/vote_poster.png",
    },
    /** `GgumddiVoteSection` 후보 카드 이미지 (순서 = 1·2·3번) */
    voteCandidateImages: [
      "/assets/poster/vote_1.png",
      "/assets/poster/vote_2.png",
      "/assets/poster/icecream_poster.png",
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
    /** 텐트 클릭 시 효과음 볼륨 (0~1), 기존 0.75 대비 작게 */
    tentSoundVolume: 0.07,
  },

  /**
   * GLB `INT_Well` 클릭 시 `static/sounds/well` 중 랜덤 1종 재생.
   */
  well: {
    wellSoundPaths: [
      "/static/sounds/well/A_single_drip_sound__1.mp3",
      "/static/sounds/well/A_single_drip_sound__2.mp3",
    ],
    wellSoundVolume: 0.07,
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
    clockSoundVolume: 0.4,
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
    streetLightSoundVolume: 0.5,
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
    portalTransitionSoundVolume: 0.55,
  },
};
