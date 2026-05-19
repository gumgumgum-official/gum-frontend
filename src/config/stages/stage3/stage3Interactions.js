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

/** island `INT_StreetLight*` 근접 시 사운드 재생 */
export const STREET_LIGHT_NAME_PREFIX = "INT_StreetLight";
export const STREET_LIGHT_TRIGGER_RADIUS = 10;
export const STREET_LIGHT_TRIGGER_COOLDOWN_MS = 1500;

export const CLOCK_TRIGGER_RADIUS = 8;
export const CLOCK_TRIGGER_COOLDOWN_MS = 2000;

export const STAGE3_INT_CLICK_HINT_RADIUS = 15;
export const STAGE3_INT_CLICK_HINT_OFFSET_Y = 0.2;

/** 포탈 통과 판정 반경 보정치(포탈 bbox 구체 반경 기반) */
export const PORTAL_PASS_TRIGGER_RADIUS_SCALE = 0.55;
export const PORTAL_PASS_TRIGGER_RADIUS_MIN = 1.2;
export const PORTAL_PASS_TRIGGER_RADIUS_MAX = 3.2;

/** 게임기(INT_gameMachine) 클릭 시 — 파일명에 `#` 있으면 Vite 정적 서버가 MP3로 매핑하지 못함 */
export const GAME_MACHINE_CLICK_SOUND_PATH =
  "/static/sounds/minigame/start_click_sfx.mp3";

export const GUMTOONGJI_CLIP_NAMES = [
  "ANIM_GumtoongjiAction",
  "Eye_default_LAction",
  "Eye_default_RAction",
  "modelAction",
  "Mouth_smileAction",
  "Paw_LAction.001",
  "Paw_RAction.001",
];

/**
 * 클릭 시 1회 재생할 오브젝트별 애니메이션 설정.
 * GLB 변경으로 애니메이션이 추가될 경우 이 배열에만 항목을 추가하면 된다.
 *
 * trigger   — runInteractionForTarget의 target 값
 * objectName — GLB 내 AnimationMixer 루트 오브젝트 이름
 * clipNames  — 재생할 AnimationClip 이름 목록 (없으면 DEV 경고)
 *
 * @type {{ trigger: string; objectName: string; clipNames: string[] }[]}
 */
export const STAGE3_CLICK_ONCE_ANIM_SETS = [
  {
    trigger: "well",
    objectName: "INT_Well",
    clipNames: ["INT_WellAction"],
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
