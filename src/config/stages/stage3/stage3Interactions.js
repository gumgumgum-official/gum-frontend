/** Stage3 INT_ 상호작용·근접 사운드·포탈 통과 상수 */

export const STAGE3_INT_PREFIX = "INT_";

/** @type {Record<string, string>} */
export const STAGE3_INT_SUFFIX_TO_TARGET = {
  notice: "notice",
  gamemachine: "gameMachine",
  tent: "tent",
  portal: "portal",
  well: "well",
  clock: "clock",
  vendingmachine: "vendingMachine", // GLB 노드명: INT_vending_machine
};

export const STAGE3_INT_CLICK_HINT_RADIUS = 15;
export const STAGE3_INT_CLICK_HINT_OFFSET_Y = 0.2;

/** 포탈 통과 판정 반경 보정치(포탈 bbox 구체 반경 기반) */
export const PORTAL_PASS_TRIGGER_RADIUS_SCALE = 0.55;
export const PORTAL_PASS_TRIGGER_RADIUS_MIN = 1.2;
export const PORTAL_PASS_TRIGGER_RADIUS_MAX = 3.2;

/** 게임기(INT_gameMachine) 클릭 시 — 파일명에 `#` 있으면 Vite 정적 서버가 MP3로 매핑하지 못함 */
export const GAME_MACHINE_CLICK_SOUND_PATH =
  "/static/sounds/minigame/start_click_sfx.mp3";

export const GUMTOONGJI_CLIP_NAMES = ["ANIM_Gumtoongji", "Paw_L", "Paw_R"];

/** 씬 로드 즉시 무한 루프로 재생할 island ambient 애니메이션 클립 이름 목록 */
export const LOOP_CLIP_NAMES = [
  "SwingPivotAction",
  "Lollipop_ArmShake_Rig",
  "Sea_Wave_Loop",
  "CampFire_Fire_Loop",
  "Balloon_Sun_Sway",
  "Balloon_Heart_Sway",
  "Balloon_Star_Sway",
];

/**
 * 클릭 시 1회 재생할 오브젝트별 애니메이션 설정.
 * GLB 변경으로 애니메이션이 추가될 경우 이 배열에만 항목을 추가하면 된다.
 *
 * trigger          — runInteractionForTarget의 target 값
 * objectName       — GLB 내 AnimationMixer 루트 오브젝트 이름 (null = island model root)
 * clipNames        — 재생할 AnimationClip 이름 목록 (없으면 DEV 경고)
 * clampWhenFinished — true: 마지막 프레임 자세 유지 (기본 false)
 * blockReplay      — true: 재생 중 재클릭 차단 (기본 false)
 *
 * @type {{ trigger: string; objectName: string | null; clipNames: string[]; clampWhenFinished?: boolean; blockReplay?: boolean }[]}
 */
export const STAGE3_CLICK_ONCE_ANIM_SETS = [
  {
    trigger: "well",
    objectName: "INT_Well",
    clipNames: ["INT_Well"],
  },
  {
    trigger: "clock",
    objectName: null,
    clipNames: [
      "ClockControllerAction.003",
      "CharacterRig_Bench",
      "ExclamationMarksAction.001",
      "Sleep_Z_1Action.001",
      "Sleep_Z_2Action.001",
      "Sleep_Z_3Action.001",
      "Eye_sleep_L_BenchAction",
      "Eye_sleep_R_BenchAction",
      "Eye_chevron_L_BenchAction",
      "Eye_chevron_R_BenchAction",
      "Eye_spiral_L_BenchAction",
      "Eye_spiral_R_BenchAction",
    ],
  },
];

/**
 * 클릭·상호작용 시에만 재생되는 클립 이름 집합.
 * fountain ambient loop에서 이 클립들을 제외해 LoopOnce 전용 믹서와 충돌을 막는다.
 * GUMTOONGJI_CLIP_NAMES 또는 STAGE3_CLICK_ONCE_ANIM_SETS에 클립을 추가하면 자동으로 반영된다.
 */
export const STAGE3_CLICK_ONCE_CLIP_NAMES = new Set([
  ...GUMTOONGJI_CLIP_NAMES,
  ...STAGE3_CLICK_ONCE_ANIM_SETS.flatMap((s) => s.clipNames),
]);
