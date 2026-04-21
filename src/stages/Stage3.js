/**
 * Stage3: 부셔버리자 (밝은 초원, 스트레스 해소)
 * - gum_server: POST .../start 후 GET .../current 폴링으로 worry(svgUrl) 우선 낙하
 * - 폴링에서 busy 미수신 시 fallback으로 "최신 1개"가 낙하
 * - 엔터키로 타격 시 큰 조각이 부서짐, 4번 치면 사라짐. 조각은 지연 후 서서히 페이드되며 꽃 GLB가 핌
 * @returns {import("../types.js").StageInstance}
 */
import * as THREE from "three";
import gsap from "gsap";
import { getGLBLoader } from "../utils/common/assetLoaders.js";
import {
  loadGltfTemplateCached,
  resolvePublicAssetUrl,
} from "../utils/common/gltfTemplateCache.js";
import { createStageDebugControls } from "../utils/common/stageDebugControls.js";
import { createKeyboardInput } from "../utils/common/keyboardInput.js";
import { loadStage3Background } from "../utils/stages/stage3/backgroundLoader.js";
import { createSkyGradientTexture } from "../utils/stages/stage3/skyGradientTexture.js";
import {
  collectIslandStaticColliderBoxes,
  filterCollidersExcludingDominantTerrain,
} from "../utils/stages/stage3/islandStaticColliders.js";
import { applyPortalVortexToModel } from "../utils/stages/stage3/portalVortexMaterial.js";
import { createCharacterController } from "../utils/stages/stage3/characterController.js";
import { createGumFollowersController } from "../utils/stages/stage3/gumFollowerController.js";
import {
  createHandwritingSvgPlaneGroup,
  disposeHandwritingSvgPlaneGroup,
} from "../utils/handwritingSvgPlane.js";
import { createHandwritingSvgVolumeGroup } from "../utils/stages/stage3/stage3HandwritingSvgVolume.js";
import * as CANNON from "cannon-es";
import { STAGE3_CONFIG } from "../config/stages/stage3.js";
import {
  openMinigame,
  closeMinigame,
  dispatchMinigameClose,
  onMinigameClose,
} from "../utils/stages/stage3/minigameLauncher.js";
import {
  openGumCardsModal,
  dispatchGumCardsModalClose,
  onGumCardsModalClose,
} from "../utils/stages/stage3/gumCardsModalLauncher.js";
import { supabase } from "../lib/supabase/client.js";
import { getSessionId } from "../lib/session.js";
import {
  MONITOR_POLL_MS,
  fetchMonitorCurrent,
  postMonitorStart,
} from "../lib/monitorCurrentApi.js";
import { playStage3IntroAudioTwice } from "../utils/common/stage3IntroAudio.js";
import {
  playRandomNoticePaperSound,
  disposeNoticePaperAudio,
} from "../utils/common/playNoticePaperSound.js";
import { playRandomWellClickSound } from "../utils/common/playWellClickSound.js";
import { playRandomClockClickSound } from "../utils/common/playClockClickSound.js";
import {
  playRandomStreetLightClickSound,
  disposeStreetLightSound,
} from "../utils/common/playStreetLightSound.js";
import {
  playRandomPortalTransitionSound,
  disposePortalTransitionSound,
} from "../utils/common/playPortalTransitionSound.js";
import { STAGE6_SUBTITLE_SEQUENCE_EVENT } from "../events/stage6Events.js";

const HANDWRITING_BUCKET = "handwriting";
const HANDWRITING_TABLE = "handwriting_files";

/** Base letter height (Y); scaled by randomFactor like Stage2 (MIN..MAX). */
const STAGE3_LETTER_TARGET_HEIGHT = 0.9;
const STAGE3_LETTER_HEIGHT_RANDOM_MIN = 0.5;
const STAGE3_LETTER_HEIGHT_RANDOM_MAX = 1.0;
/** 착지면(landingY) 위로 띄우는 높이 — 글자 밑면·지형 오차를 줄이려면 landingY 기준과 함께 키움 */
const STAGE3_SPAWN_HEIGHT = 8;
// 운석처럼 빠르게 떨어지는 느낌을 위해 중력/초기 속도 강화
const STAGE3_GRAVITY = -35;
const STAGE3_INITIAL_VY = -12;
const LETTER_BOUNCE_RESTITUTION = 0.4;
const HITS_TO_DESTROY = 4;
/** 한 번 타격 시 잘려 나가는 로컬 x 구간 비율 (커질수록 덩어리가 큼) */
const FRACTION_PER_HIT = 0.45;
const HIT_RANGE = 6; // ilbuni로부터 이 거리 이내만 타격 가능
const FRAGMENT_GRAVITY_MUL = 2.8; // 조각은 중력 더 강하게
const FRAGMENT_BOUNCE_RESTITUTION = 0.35;
const FRAGMENT_GROUND_FRICTION = 0.82;
/** 조각 생성 직후 튀는 속도·회전 배율 */
const FRAGMENT_BURST_IMPULSE_MUL = 1.55;
const FRAGMENT_FADE_START = 2;
const FRAGMENT_FADE_END = 5;
/** 조각 착지 시 스폰되는 꽃의 bloom 시간(초) */
const FLOWER_BLOOM_DURATION = 3;
const FLOWER_SCALE = 3;
const FLOWER_Y_OFFSET = 0.15;
const FRAGMENT_FLOWER_PATHS = [
  "/models/common/flowers/pink2.glb",
  "/models/common/flowers/white2.glb",
  "/models/common/flowers/red2.glb",
  "/models/common/flowers/purple2.glb",
  "/models/common/flowers/pastelpink2.glb",
  "/models/common/flowers/blue3.glb",
];
const STAGE3_ICECREAM_DEBUG_BOX_ONLY = false;

/** 아이스크림이 지면에 처음 닿을 때 재생 (랜덤 1종) */
const ICECREAM_LAND_SOUND_PATHS = [
  "/static/sounds/icecream/icecream_sound.mp3",
  "/static/sounds/icecream/icecream_sound2.mp3",
];

/** 게임기(INT_gameMachine) 클릭 시 — 파일명에 `#` 있으면 Vite 정적 서버가 MP3로 매핑하지 못함 */
const GAME_MACHINE_CLICK_SOUND_PATH =
  "/static/sounds/computer/Clean_and_light_mech_3-1775840321883.mp3";

/** island `INT_StreetLight*` 근접 시 사운드 재생 */
const STREET_LIGHT_NAME_PREFIX = "INT_StreetLight";
const STREET_LIGHT_TRIGGER_RADIUS = 10;
const STREET_LIGHT_TRIGGER_COOLDOWN_MS = 1500;
const CLOCK_TRIGGER_RADIUS = 8;
const CLOCK_TRIGGER_COOLDOWN_MS = 2000;

/** 다른 스테이지 대비 Stage3만 살짝 밝게 (진입 시 가산, cleanup 시 복원) */
const STAGE3_TONE_MAPPING_EXPOSURE_DELTA = 0.06;
const STAGE3_ENVIRONMENT_INTENSITY_DELTA = 0.12;

/** REST에서 busy를 한 번도 못 받았을 때만 Supabase fallback (ms) */
const STAGE3_MONITOR_FALLBACK_TIMEOUT_MS = 5000;

/** Stage6BoardingOverlay `runSubtitleSequence`와 동일: hold + fade(600) + gap(200) × 구간 */
const STAGE3_ENTRY_SUBTITLE_TOTAL_MS = 2500 + 600 + 200 + 2000 + 600;

/** 포탈 → Stage6: 페이드 인 후 풀 화이트 유지 시간(ms), 그다음 stage:switch */
const PORTAL_WHITEOUT_FADE_SEC = 1.85;
const PORTAL_WHITEOUT_HOLD_MS = 500;
/** 스테이지 전환 후 새 씬이 드러나도록 화이트 페이드 아웃 */
const PORTAL_WHITEOUT_FADE_OUT_SEC = 1.45;
/** App.jsx NoticeModalBoard onClose — 게시판 UI가 닫힌 뒤(Stage3 이스터에그 자막용) */
const NOTICE_MODAL_USER_CLOSED_EVENT = "gum:noticeModalClosed";

const REQUIRED_EGG_COUNT = 3;
/** 🔨 ENTER 말풍선 표시 거리 — 상호작용보다 넓게 */
const WORRY_ENTER_HINT_DIST = 7.5;
const STAGE3_USER_ENTER_BUBBLE_SHOW_SEC = 3.6;
const STAGE3_USER_ENTER_BUBBLE_GAP_SEC = 4.0;
const MAIN_EASTER_EGG_CANONICAL = [
  "INT_notice",
  "INT_gameMachine",
  "INT_icecream",
  "INT_Tent",
];
/** @type {Record<string, string>} */
const RAY_TARGET_TO_EGG_KEY = {
  notice: "INT_notice",
  gameMachine: "INT_gameMachine",
  icecream: "INT_icecream",
  tent: "INT_Tent",
};

export function Stage3() {
  /** @type {import("../types.js").Stage3Config} */
  const config = STAGE3_CONFIG;
  const glbLoader = getGLBLoader();
  const objects = [];
  let debugControls = null;
  let sceneRef = null;
  let cameraRef = null;
  let canvasRef = null;
  /** 배경 로드 시 저장. 0키로 재낙하 시 사용 */
  let stage3GroundY = 0;
  let backgroundModel = null;
  /** @type {import("three").CanvasTexture | null} */
  let skyBackgroundTexture = null;
  /** `Portal_Vortex` ShaderMaterial — cleanup 시 null */
  /** @type {import("three").ShaderMaterial | null} */
  let portalVortexMaterial = null;
  /** 스테이지 전환 시 비동기 로드 완료 후 scene.add 방지용 */
  let isStage3Active = true;
  /** @type {{ toneMappingExposure: number, environmentIntensity: number, renderer: import("three").WebGLRenderer } | null} */
  let stage3LightingRestore = null;

  // 낙하 글자 1개 (할당된 svgUrl 우선)
  let letterState = null;
  let letterLoadInProgress = false;
  const fragments = [];
  /** Enter 타격 시 스폰된 꽃 목록 — bloom 애니메이션 + 자동 제거 */
  /** @type {{ group: import("three").Object3D, age: number }[]} */
  const standaloneFlowers = [];
  /** Fragment 풀: { group, velocity, angularVelocity } 재사용 (GC 감소) */
  const fragmentPool = [];
  const FRAGMENT_POOL_MAX = 32;

  // gum_server REST 폴링으로 할당된 글자
  let assignedWorryId = null; // string
  let assignedSvgUrl = null; // string
  /** REST로 busy(worry)를 한 번이라도 받으면 true → Supabase fallback 타이머 미실행 유지 */
  let monitorRestAssignmentReceived = false;
  let monitorPollIntervalId = null;
  let monitorPollInFlight = false;
  let pendingSvgUrlToLoad = null;
  let pendingSvgUrlDebugId = null;
  let monitorFallbackTimeoutId = null;

  // 아이스크림 카트 클릭 → 랜덤 아이스크림 스폰 (cannon-es 물리)
  // island2.glb 내 INT_icecream 루트 (클릭 → 스폰, cannon-es)
  let iceCreamCartRef = null;
  /** 게시판 클릭 → 모달 (React NoticeModalBoard에 이벤트로 전달) */
  /** island2.glb 내 INT_gameMachine 루트 */
  let gameMachineRef = null;
  let unlistenMinigameClose = null;
  /** @type {HTMLAudioElement | null} */
  let gameMachineClickAudio = null;
  const iceCreamTemplates = []; // [{ scene }, { scene }]
  const spawnedIceCreams = []; // { group, body, landSoundHandler?, landSoundPlayed? }
  let iceCreamPhysicsWorld = null;
  let iceCreamGroundBody = null;
  const _icePointer = new THREE.Vector2();
  const _iceRaycaster = new THREE.Raycaster();
  const INT_PREFIX = "INT_";
  const INT_SUFFIX_TO_TARGET = {
    notice: "notice",
    gamemachine: "gameMachine",
    tent: "tent",
    icecream: "icecream",
    portal: "portal",
    well: "well",
    clock: "clock",
  };
  function normalizeIntNameToken(value) {
    return String(value ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  }
  /**
   * GLB마다 INT_ 접미사 표기가 다름 (예: INT_notice vs INT_Notice, INT_IceCart).
   * 레이 히트·ref 등록 시 canonical 타깃으로 정규화한다.
   * @param {string} suffix - `INT_` 제외 접미사
   * @returns {"notice" | "gameMachine" | "tent" | "icecream" | "portal" | "well" | "clock" | null}
   */
  function intSuffixToTarget(suffix) {
    const lower = normalizeIntNameToken(suffix);
    // GLB마다 INT suffix 표기가 다를 수 있어 대표 별칭(예: IceCart)을 정규화한다.
    if (
      lower === "icecart" ||
      lower === "icecreamcart" ||
      lower === "icecream" ||
      (lower.includes("ice") &&
        lower.includes("cream") &&
        lower.includes("cart"))
    ) {
      return "icecream";
    }
    return INT_SUFFIX_TO_TARGET[lower] ?? null;
  }
  /** island GLB 안 INT_* 서브트리의 Mesh만 (레이캐스트) */
  const intRaycastMeshes = [];
  /** 카메라 yaw assist용 INT 월드 바운딩 스피어(섬 정적 가정) */
  const cameraAssistTargets = [];
  let smoothedCameraYawAssist = 0;
  /** 프러스텀 on/off에 덜 민감하도록 목표 각을 한 번 더 스무딩 */
  let smoothedCameraYawAssistDemand = 0;
  /** INT_StreetLight* 월드 좌표 (근접 사운드 트리거용) */
  const streetLightWorldPositions = [];
  let wasNearStreetLight = false;
  let lastStreetLightSoundAtMs = 0;
  const clockWorldPositions = [];
  let wasNearClock = false;
  let lastClockSoundAtMs = 0;

  let easterEggCount = 0;
  let textDestroyed = false;
  const discoveredEggs = new Set();
  let stage3IntroFlowStarted = false;
  /** 이스터에그 3 + 걱정 텍스트 파괴 후 축하 자막 1회만 */
  let worryCompletionCelebrationDone = false;
  /** @type {HTMLDivElement | null} */
  let stampUiRoot = null;
  /** @type {HTMLDivElement | null} */
  let userWorryEnterBubbleEl = null;
  /** 포탈 → 다음 스테이지 전환용 풀스크린 화이트아웃 */
  /** @type {HTMLDivElement | null} */
  let whiteoutOverlayEl = null;
  let portalTransitionTween = null;
  /** @type {number | null} */
  let portalTransitionHoldTimeoutId = null;
  let portalTransitionInProgress = false;
  /** @type {'off' | 'show' | 'gap'} */
  let userWorryEnterBubblePhase = "off";
  let userWorryEnterBubbleT = 0;
  let cameraShakeEndTime = 0;
  const _projWorry = new THREE.Vector3();
  let stage3EntryStampRevealTimerId = null;
  /** 모달/미니게임 닫힌 뒤 재생할 이스터에그 발견 자막 (notice / gameMachine / tent) */
  let pendingEggDiscoverySubtitle = null;
  /** @type {(() => void) | null} */
  let unlistenGumCardsForEggSubtitle = null;

  const keyboard = createKeyboardInput([
    "ArrowUp",
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
  ]);
  let character = null;
  let gumFollowers = null;
  /** 껌딱지 init(GLB await) 도중 cleanup 시 scene.add 방지용 */
  let gumCancelled = false;
  /**
   * 카메라 인트로 상태
   * - stage 시작 시 섬 전체를 위에서 시계방향으로 천천히(부분 호) 보여준 뒤
   * - 캐릭터 기준 카메라 포즈로 줌인 전환 후 추적 모드로 넘어간다.
   */
  const cameraIntro = {
    active: false,
    transitioning: false,
    completed: false,
    /** 인트로에서 위에서 내려다보는 카메라 포즈를 한 번이라도 적용했으면 true */
    introTopViewCommitted: false,
    elapsed: 0,
    transitionElapsed: 0,
    /** 인트로 회전 구간 길이 — 클수록 같은 sweep 각에서 더 천천히 회전 */
    durationSec: 4.5,
    transitionSec: 2.0,
    /** 시계방향으로 도는 각(rad). durationSec 단축에 맞춰 속도 유지하도록 각도도 함께 축소 */
    sweepAngleRad: Math.PI * 0.39,
    center: new THREE.Vector3(),
    radius: 20,
    height: 18,
    startAngle: 0,
    lookAtY: 0,
    fromPos: new THREE.Vector3(),
    fromLookAt: new THREE.Vector3(),
    toPos: new THREE.Vector3(),
    toLookAt: new THREE.Vector3(),
  };
  const _introTargetPos = new THREE.Vector3();
  const _introTargetLookAt = new THREE.Vector3();
  const _introLerpLookAt = new THREE.Vector3();
  const _iceCartWorld = new THREE.Vector3();
  const _iceSpawnDir = new THREE.Vector3();
  const _iceSpawnRight = new THREE.Vector3();
  const _iceCartQuat = new THREE.Quaternion();
  const _iceModelCenter = new THREE.Vector3();
  const _iceModelSize = new THREE.Vector3();
  const _camAssistBox = new THREE.Box3();
  const _camAssistSphere = new THREE.Sphere();
  const _camProjView = new THREE.Matrix4();
  const _camFrustum = new THREE.Frustum();

  function getCharacterFollowPose(outPos, outLookAt) {
    if (!character) return false;
    const pos = character.getPosition?.();
    if (!pos) return false;
    const camOffset = config.character?.cameraOffset ?? { x: 0, y: 3, z: 8 };
    const lookAtHeight = config.character?.lookAtHeightOffset ?? 1;
    outPos.set(pos.x + camOffset.x, pos.y + camOffset.y, pos.z + camOffset.z);
    outLookAt.copy(pos);
    outLookAt.y += lookAtHeight;
    return true;
  }

  /**
   * INT 오브제가 카메라 프러스텀 밖이면 기본 cameraOffset 대비 Y축 보조 각 목표를 만든다.
   * 지형에 가려진 경우는 비-INT 메시 raycast가 꺼져 있어 미처리 — 필요 시 전용 레이어로 확장 가능.
   * @param {number} delta
   * @param {THREE.PerspectiveCamera} camera
   * @param {THREE.Vector3} charPos
   * @param {boolean} isMoving
   */
  function updateStage3CameraYawAssist(delta, camera, charPos, isMoving) {
    const ch = config.character;
    const maxRad = ch.cameraYawAssistMaxRad ?? 0.38;
    const maxDist = ch.cameraYawAssistMaxDistance ?? 42;
    const onlyMoving = ch.cameraYawAssistOnlyWhenMoving !== false;
    const lk = Math.max(ch.cameraYawAssistLerp ?? 0.09, 0.02);
    const demandTau =
      ch.cameraYawAssistDemandEaseSec ?? Math.max(0.2, 0.11 / lk);
    const easeTau = ch.cameraYawAssistEaseSec ?? Math.max(0.28, 0.15 / lk);
    const introDecayTau = 0.22;

    /** @param {number} cur @param {number} tgt @param {number} tauSec */
    function dampToward(cur, tgt, tauSec) {
      if (tauSec <= 1e-4) return tgt;
      const alpha = 1 - Math.exp(-delta / tauSec);
      return cur + (tgt - cur) * alpha;
    }

    if (!cameraIntro.completed || cameraIntro.active) {
      smoothedCameraYawAssistDemand = dampToward(
        smoothedCameraYawAssistDemand,
        0,
        introDecayTau,
      );
      smoothedCameraYawAssist = dampToward(
        smoothedCameraYawAssist,
        smoothedCameraYawAssistDemand,
        introDecayTau * 0.85,
      );
      return smoothedCameraYawAssist;
    }

    const returnTau = Math.max(0.14, ch.cameraYawAssistReturnEaseSec ?? 0.52);

    let instantTarget = 0;
    if (cameraAssistTargets.length > 0 && !(onlyMoving && !isMoving)) {
      camera.updateMatrixWorld(true);
      _camProjView.multiplyMatrices(
        camera.projectionMatrix,
        camera.matrixWorldInverse,
      );
      _camFrustum.setFromProjectionMatrix(_camProjView);

      const ox = ch.cameraOffset?.x ?? 0;
      const oz = ch.cameraOffset?.z ?? 8;
      const defaultAngle = Math.atan2(ox, oz);
      const maxDistSq = maxDist * maxDist;
      const steer = 0.28;

      let sum = 0;
      let n = 0;
      for (let i = 0; i < cameraAssistTargets.length; i++) {
        const sphere = cameraAssistTargets[i].sphere;
        if (_camFrustum.intersectsSphere(sphere)) continue;
        const dx = sphere.center.x - charPos.x;
        const dz = sphere.center.z - charPos.z;
        const distSq = dx * dx + dz * dz;
        if (distSq > maxDistSq || distSq < 1e-6) continue;
        const angleObj = Math.atan2(dx, dz);
        const diff = Math.atan2(
          Math.sin(angleObj - defaultAngle),
          Math.cos(angleObj - defaultAngle),
        );
        sum += THREE.MathUtils.clamp(diff * steer, -maxRad, maxRad);
        n++;
      }
      instantTarget = n > 0 ? sum / n : 0;
    }

    instantTarget = THREE.MathUtils.clamp(instantTarget, -maxRad, maxRad);

    // 복귀: demand를 즉시 0에 맞추고 최종 각만 한 번 감쇠 → 정지 시 이중 지연·느린 풀림 완화
    if (instantTarget === 0) {
      smoothedCameraYawAssistDemand = 0;
      smoothedCameraYawAssist = dampToward(
        smoothedCameraYawAssist,
        0,
        returnTau,
      );
      if (Math.abs(smoothedCameraYawAssist) < 0.0018) {
        smoothedCameraYawAssist = 0;
      }
      return smoothedCameraYawAssist;
    }

    smoothedCameraYawAssistDemand = dampToward(
      smoothedCameraYawAssistDemand,
      instantTarget,
      demandTau,
    );
    smoothedCameraYawAssistDemand = THREE.MathUtils.clamp(
      smoothedCameraYawAssistDemand,
      -maxRad,
      maxRad,
    );
    smoothedCameraYawAssist = dampToward(
      smoothedCameraYawAssist,
      smoothedCameraYawAssistDemand,
      easeTau,
    );
    smoothedCameraYawAssist = THREE.MathUtils.clamp(
      smoothedCameraYawAssist,
      -maxRad,
      maxRad,
    );
    return smoothedCameraYawAssist;
  }

  function startCameraIntro(center, bounds) {
    if (!cameraRef) return;
    cameraIntro.active = true;
    cameraIntro.transitioning = false;
    cameraIntro.completed = false;
    cameraIntro.introTopViewCommitted = false;
    cameraIntro.elapsed = 0;
    cameraIntro.transitionElapsed = 0;
    cameraIntro.center.copy(center);
    const size = new THREE.Vector3();
    bounds.getSize(size);
    const horizontalSize = Math.max(size.x, size.z);
    // 수평 반경을 살짝 줄여 더 “정수리에 가깝게”
    cameraIntro.radius = Math.max(13, horizontalSize * 0.76);
    // 더 높은 위치 + 시선은 바운딩 중심보다 약간 아래(섬 윗면 쪽)로 두어 내려다보기 강화
    cameraIntro.height = center.y + Math.max(60, size.y * 1.2 + 16);
    const minY = bounds.min.y;
    const maxY = bounds.max.y;
    const targetLookY = center.y - Math.min(size.y * 0.14, 4);
    cameraIntro.lookAtY = THREE.MathUtils.clamp(
      targetLookY,
      minY + size.y * 0.05,
      maxY - 0.3,
    );
    // 궤도 각: x = center.x + sin(θ)*r, z = center.z + cos(θ)*r, 시간에 따라 θ 감소 = 시계방향 스윕
    // 시작점을 시계 반대 방향으로 약 60° 옮김 → θ에 π/3 더하기
    const baseAngle = Math.atan2(
      cameraRef.position.x - center.x,
      cameraRef.position.z - center.z,
    );
    cameraIntro.startAngle = baseAngle + Math.PI / 2;

    const orbit = debugControls?.getOrbitControls?.();
    if (orbit) orbit.enabled = false;
  }

  function updateCameraIntro(delta) {
    if (!cameraRef || !cameraIntro.active || cameraIntro.completed) return;

    if (!cameraIntro.transitioning) {
      cameraIntro.elapsed += delta;
      const t = Math.min(1, cameraIntro.elapsed / cameraIntro.durationSec);
      const angle = cameraIntro.startAngle - cameraIntro.sweepAngleRad * t; // 시계방향
      cameraRef.position.set(
        cameraIntro.center.x + Math.sin(angle) * cameraIntro.radius,
        cameraIntro.height,
        cameraIntro.center.z + Math.cos(angle) * cameraIntro.radius,
      );
      cameraRef.lookAt(
        cameraIntro.center.x,
        cameraIntro.lookAtY,
        cameraIntro.center.z,
      );
      if (!cameraIntro.introTopViewCommitted) {
        cameraIntro.introTopViewCommitted = true;
        if (isStage3Active) {
          playStage3IntroAudioTwice();
        }
      }

      if (
        t >= 1 &&
        getCharacterFollowPose(_introTargetPos, _introTargetLookAt)
      ) {
        cameraIntro.transitioning = true;
        cameraIntro.transitionElapsed = 0;
        cameraIntro.fromPos.copy(cameraRef.position);
        cameraIntro.fromLookAt.set(
          cameraIntro.center.x,
          cameraIntro.lookAtY,
          cameraIntro.center.z,
        );
      }
      return;
    }

    if (!getCharacterFollowPose(cameraIntro.toPos, cameraIntro.toLookAt))
      return;
    cameraIntro.transitionElapsed += delta;
    const t = Math.min(
      1,
      cameraIntro.transitionElapsed / cameraIntro.transitionSec,
    );
    const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
    cameraRef.position.copy(cameraIntro.fromPos).lerp(cameraIntro.toPos, eased);
    _introLerpLookAt
      .copy(cameraIntro.fromLookAt)
      .lerp(cameraIntro.toLookAt, eased);
    cameraRef.lookAt(_introLerpLookAt);

    if (t >= 1) {
      cameraIntro.active = false;
      cameraIntro.transitioning = false;
      cameraIntro.completed = true;
      onCameraRotationIntroComplete();
    }
  }

  /** 상공 회전·줌인 인트로가 끝난 뒤 진입 자막 */
  function onCameraRotationIntroComplete() {
    if (!isStage3Active) return;
    runStage3EntrySubtitlesAndIntro();
  }

  const handleStageKeyDown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      onEnterHit();
    }
    if (event.key === "0" || event.code === "Digit0") {
      event.preventDefault();
      resetLetterFall();
    }
  };

  function resolveIntPointerTarget(hitObject) {
    let p = hitObject;
    while (p) {
      if (typeof p.name === "string" && p.name.startsWith(INT_PREFIX)) {
        const suffix = p.name.slice(INT_PREFIX.length);
        return intSuffixToTarget(suffix);
      }
      p = p.parent;
    }
    // fallback: INT_ 접두사가 빠진 리소스라도 카트 계열 이름이면 아이스크림 타깃으로 취급
    p = hitObject;
    while (p) {
      const n = normalizeIntNameToken(p.name);
      if (n.includes("icecart") || n.includes("icecreamcart")) {
        return "icecream";
      }
      p = p.parent;
    }
    return null;
  }
  function isDescendantOf(node, ancestor) {
    let p = node;
    while (p) {
      if (p === ancestor) return true;
      p = p.parent;
    }
    return false;
  }

  function ensureStage3UiMounted() {
    if (stampUiRoot) return;
    const root = document.createElement("div");
    root.className = "stage3-ui-root";
    root.innerHTML = `
      <div class="stage3-stamp-panel stage3-stamp-panel--hidden" aria-label="이스터에그 진행">
        <div class="stage3-stamp-title">이스터에그 찾기</div>
        <div class="stage3-stamp-slots">
          <span class="stage3-stamp-slot" data-idx="0">🥚</span>
          <span class="stage3-stamp-slot" data-idx="1">🥚</span>
          <span class="stage3-stamp-slot" data-idx="2">🥚</span>
        </div>
      </div>
    `;
    document.body.appendChild(root);
    stampUiRoot = root;

    userWorryEnterBubbleEl = document.createElement("div");
    userWorryEnterBubbleEl.className =
      "speech-bubble-stage2 speech-bubble-stage3-user";
    userWorryEnterBubbleEl.textContent = "🔨 [ ENTER ]";
    userWorryEnterBubbleEl.setAttribute("aria-hidden", "true");
    document.body.appendChild(userWorryEnterBubbleEl);
  }

  function ensureWhiteoutOverlay() {
    if (whiteoutOverlayEl) return;
    const el = document.createElement("div");
    el.className = "stage3-whiteout-overlay";
    el.setAttribute("aria-hidden", "true");
    document.body.appendChild(el);
    whiteoutOverlayEl = el;
  }

  /**
   * 화면을 흰색으로 덮은 뒤 stage:switch 를 보낸다.
   * @param {number} targetStage
   */
  function startPortalTransitionToStage6(targetStage) {
    if (portalTransitionInProgress || !isStage3Active) return;
    ensureWhiteoutOverlay();
    if (!whiteoutOverlayEl) return;
    playRandomPortalTransitionSound();
    portalTransitionInProgress = true;
    portalTransitionTween?.kill();
    if (portalTransitionHoldTimeoutId != null) {
      window.clearTimeout(portalTransitionHoldTimeoutId);
      portalTransitionHoldTimeoutId = null;
    }
    gsap.killTweensOf(whiteoutOverlayEl);
    whiteoutOverlayEl.style.pointerEvents = "auto";
    gsap.set(whiteoutOverlayEl, { opacity: 0 });
    portalTransitionTween = gsap.to(whiteoutOverlayEl, {
      opacity: 1,
      duration: PORTAL_WHITEOUT_FADE_SEC,
      ease: "power2.inOut",
      onComplete: () => {
        portalTransitionTween = null;
        portalTransitionHoldTimeoutId = window.setTimeout(() => {
          portalTransitionHoldTimeoutId = null;
          window.dispatchEvent(
            new CustomEvent("stage:switch", {
              detail: { targetStage },
            }),
          );
        }, PORTAL_WHITEOUT_HOLD_MS);
      },
    });
  }

  function disposeStage3Ui() {
    portalTransitionTween?.kill();
    portalTransitionTween = null;
    if (portalTransitionHoldTimeoutId != null) {
      window.clearTimeout(portalTransitionHoldTimeoutId);
      portalTransitionHoldTimeoutId = null;
    }
    if (whiteoutOverlayEl) {
      const el = whiteoutOverlayEl;
      gsap.killTweensOf(el);
      el.style.pointerEvents = "none";
      portalTransitionTween = gsap.to(el, {
        opacity: 0,
        duration: PORTAL_WHITEOUT_FADE_OUT_SEC,
        ease: "power2.inOut",
        onComplete: () => {
          portalTransitionTween = null;
          if (whiteoutOverlayEl === el) {
            whiteoutOverlayEl = null;
          }
          el.remove();
        },
      });
    }
    portalTransitionInProgress = false;
    stampUiRoot?.remove();
    stampUiRoot = null;
    userWorryEnterBubbleEl?.remove();
    userWorryEnterBubbleEl = null;
    userWorryEnterBubblePhase = "off";
    userWorryEnterBubbleT = 0;
  }

  function updateStampSlotsFilled(count) {
    if (!stampUiRoot) return;
    const slots = stampUiRoot.querySelectorAll(".stage3-stamp-slot");
    slots.forEach((el, i) => {
      const filled = i < count;
      el.textContent = filled ? "🌟" : "🥚";
      el.classList.toggle("filled", filled);
    });
  }

  function pulseStampSlot(index) {
    if (!stampUiRoot) return;
    const el = stampUiRoot.querySelector(
      `.stage3-stamp-slot[data-idx="${index}"]`,
    );
    if (!el) return;
    el.classList.remove("stage3-stamp-pop");
    void el.getBoundingClientRect();
    el.classList.add("stage3-stamp-pop");
    window.setTimeout(() => el.classList.remove("stage3-stamp-pop"), 500);
  }

  function pulseStampPanelGlow() {
    if (!stampUiRoot) return;
    const panel = stampUiRoot.querySelector(".stage3-stamp-panel");
    if (!panel) return;
    panel.classList.remove("stage3-stamp-glow");
    void panel.getBoundingClientRect();
    panel.classList.add("stage3-stamp-glow");
    window.setTimeout(() => panel.classList.remove("stage3-stamp-glow"), 900);
  }

  function revealStage3StampPanelAfterEntrySubtitles() {
    if (!stampUiRoot || !isStage3Active) return;
    const panel = stampUiRoot.querySelector(".stage3-stamp-panel");
    if (panel) panel.classList.remove("stage3-stamp-panel--hidden");
  }

  function dispatchSubtitleSequence(messages) {
    window.dispatchEvent(
      new CustomEvent(STAGE6_SUBTITLE_SEQUENCE_EVENT, {
        detail: { messages },
      }),
    );
  }

  function dispatchSubtitleLine(text, holdMs = 2200) {
    dispatchSubtitleSequence([{ text, holdMs }]);
  }

  function flushPendingEggDiscoverySubtitle() {
    if (!isStage3Active || !pendingEggDiscoverySubtitle) return;
    const text = pendingEggDiscoverySubtitle;
    pendingEggDiscoverySubtitle = null;
    dispatchSubtitleLine(text);
  }

  function handleNoticeModalClosedForEggSubtitle() {
    flushPendingEggDiscoverySubtitle();
  }

  function runStage3EntrySubtitlesAndIntro() {
    if (stage3IntroFlowStarted) return;
    stage3IntroFlowStarted = true;
    if (stage3EntryStampRevealTimerId != null) {
      window.clearTimeout(stage3EntryStampRevealTimerId);
      stage3EntryStampRevealTimerId = null;
    }
    const panel = stampUiRoot?.querySelector(".stage3-stamp-panel");
    if (panel) panel.classList.add("stage3-stamp-panel--hidden");

    dispatchSubtitleSequence([
      { text: "어딘가에서 걱정들이 쏟아지고 있어요...", holdMs: 2500 },
      { text: "걱정을 부시며 섬을 둘러볼까요?", holdMs: 2000 },
    ]);

    stage3EntryStampRevealTimerId = window.setTimeout(() => {
      stage3EntryStampRevealTimerId = null;
      revealStage3StampPanelAfterEntrySubtitles();
    }, STAGE3_ENTRY_SUBTITLE_TOTAL_MS);
  }

  /**
   * @param {"notice"|"gameMachine"|"icecream"|"tent"} target
   * @returns {{ didDiscover: boolean, stampSubtitle: string | null }}
   */
  function tryRegisterEasterEggFromRayTarget(target) {
    const key = RAY_TARGET_TO_EGG_KEY[target];
    if (!key || !MAIN_EASTER_EGG_CANONICAL.includes(key)) {
      return { didDiscover: false, stampSubtitle: null };
    }
    if (discoveredEggs.has(key)) {
      return { didDiscover: false, stampSubtitle: null };
    }
    discoveredEggs.add(key);
    let stampSubtitle = null;
    if (easterEggCount < REQUIRED_EGG_COUNT) {
      easterEggCount += 1;
      updateStampSlotsFilled(easterEggCount);
      pulseStampSlot(easterEggCount - 1);
      if (easterEggCount >= REQUIRED_EGG_COUNT) {
        pulseStampPanelGlow();
      }
      if (easterEggCount === 1) {
        stampSubtitle = "뭔가 발견했어요! 더 찾아볼까요? 👀";
      } else if (easterEggCount === 2) {
        stampSubtitle = "하나만 더 찾으면 될 것 같아요!";
      } else if (easterEggCount === 3) {
        stampSubtitle = "다 찾았어요. 다음 여정으로 떠날 수 있어요!";
      }
    }
    // 텍스트를 먼저 부순 뒤 3번째 이스터에그를 찾는 경우 — onEnterHit에서는 호출되지 않음
    tryDispatchWorryCompletionCelebration();
    return { didDiscover: true, stampSubtitle };
  }

  function tryDispatchWorryCompletionCelebration() {
    if (worryCompletionCelebrationDone) return;
    if (easterEggCount < REQUIRED_EGG_COUNT || !textDestroyed) return;
    worryCompletionCelebrationDone = true;
    pendingEggDiscoverySubtitle = null;
    cameraShakeEndTime = globalThis.performance.now() / 1000 + 0.5;
    window.setTimeout(() => {
      if (!isStage3Active) return;
      dispatchSubtitleSequence([
        { text: "모든 걱정을 날려버렸어요! 💥", holdMs: 2000 },
      ]);
    }, 0);
  }

  /** island2 로드 후: INT_* 노드에서 레이캐스트 메시·refs 등록 */
  function registerIslandInteractions(islandModel) {
    intRaycastMeshes.length = 0;
    cameraAssistTargets.length = 0;
    smoothedCameraYawAssist = 0;
    smoothedCameraYawAssistDemand = 0;
    iceCreamCartRef = null;
    gameMachineRef = null;
    if (unlistenMinigameClose) {
      unlistenMinigameClose();
      unlistenMinigameClose = null;
    }

    const meshSet = new Set();
    const assistRootSet = new Set();
    const rootNames = [];
    const nonIntCartCandidates = [];
    islandModel.traverse((obj) => {
      if (typeof obj.name !== "string" || !obj.name.startsWith(INT_PREFIX)) {
        const normalized = normalizeIntNameToken(obj.name);
        if (
          normalized &&
          (normalized.includes("icecart") ||
            normalized.includes("icecreamcart"))
        ) {
          nonIntCartCandidates.push(obj);
        }
        return;
      }
      rootNames.push(obj.name);
      const suffix = obj.name.slice(INT_PREFIX.length);
      const intTarget = intSuffixToTarget(suffix);
      if (intTarget != null) {
        assistRootSet.add(obj);
      }
      if (intTarget === "gameMachine") gameMachineRef = obj;
      if (intTarget === "icecream") iceCreamCartRef = obj;
      if (intTarget === "clock") {
        obj.updateMatrixWorld(true);
        const worldPos = new THREE.Vector3();
        obj.getWorldPosition(worldPos);
        clockWorldPositions.push(worldPos);
      }
      obj.traverse((child) => {
        if (child.isMesh) meshSet.add(child);
      });
    });
    if (!iceCreamCartRef && nonIntCartCandidates.length > 0) {
      iceCreamCartRef = nonIntCartCandidates[0];
      iceCreamCartRef.traverse((child) => {
        if (child.isMesh) {
          // backgroundLoader에서 비-INT 메시는 raycast를 꺼두므로, fallback 카트는 raycast를 복구해야 클릭 가능하다.
          child.raycast = THREE.Mesh.prototype.raycast;
          meshSet.add(child);
        }
      });
      if (import.meta.env.DEV) {
        console.warn(
          `[Stage3] INT_ 카트 미검출 → fallback 카트 사용: '${iceCreamCartRef.name}'`,
        );
      }
    }
    if (iceCreamCartRef) {
      assistRootSet.add(iceCreamCartRef);
    }
    for (const root of assistRootSet) {
      root.updateMatrixWorld(true);
      _camAssistBox.setFromObject(root);
      _camAssistBox.getBoundingSphere(_camAssistSphere);
      cameraAssistTargets.push({ sphere: _camAssistSphere.clone() });
    }

    intRaycastMeshes.push(...meshSet);

    streetLightWorldPositions.length = 0;
    clockWorldPositions.length = 0;
    islandModel.traverse((obj) => {
      if (typeof obj.name !== "string") return;
      if (!obj.name.startsWith(STREET_LIGHT_NAME_PREFIX)) return;
      obj.updateMatrixWorld(true);
      const worldPos = new THREE.Vector3();
      obj.getWorldPosition(worldPos);
      streetLightWorldPositions.push(worldPos);
    });

    if (gameMachineRef) {
      unlistenMinigameClose = onMinigameClose(() => {
        closeMinigame({
          camera: cameraRef,
          orbitControls: debugControls?.getOrbitControls?.() ?? null,
        });
        flushPendingEggDiscoverySubtitle();
      });
    }

    if (rootNames.length > 0 && import.meta.env.DEV) {
      const uniq = [...new Set(rootNames)];
      for (const full of uniq) {
        const suf = full.startsWith(INT_PREFIX)
          ? full.slice(INT_PREFIX.length)
          : full;
        if (intSuffixToTarget(suf) == null) continue;
      }
    }
    if (!iceCreamCartRef && import.meta.env.DEV) {
      const rootsMsg =
        rootNames.length > 0 ? [...new Set(rootNames)].join(", ") : "(없음)";
      console.warn(
        `[Stage3] 아이스크림 카트 ref를 찾지 못했습니다. INT_ 노드: ${rootsMsg}`,
      );
    }
  }

  /** 레이캐스트: "icecream" | "notice" | "gameMachine" | "tent" | "portal" | "well" | "clock" | null */
  function getPointerHitTarget(clientX, clientY) {
    if (!cameraRef || !canvasRef || !sceneRef) return null;
    if (intRaycastMeshes.length === 0) return null;
    const rect = canvasRef.getBoundingClientRect();
    _icePointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    _icePointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    _iceRaycaster.setFromCamera(_icePointer, cameraRef);
    const hits = _iceRaycaster.intersectObjects(intRaycastMeshes, false);
    if (hits.length === 0) return null;
    // 같은 화면 위치에서 가장 앞이 INT_StreetLight 등(매핑 없음)이면 null이 되어 카트 클릭이 무시됨 → 뒤쪽 히트까지 순회
    for (let i = 0; i < hits.length; i++) {
      const hitObj = hits[i].object;
      const resolved = resolveIntPointerTarget(hitObj);
      if (resolved) return resolved;
      if (iceCreamCartRef && isDescendantOf(hitObj, iceCreamCartRef)) {
        return "icecream";
      }
    }
    return null;
  }

  let _pointerMoveRafId = 0;
  let _lastPointerEvent = null;
  function handlePointerMove(event) {
    if (!canvasRef) return;
    _lastPointerEvent = event;
    if (_pointerMoveRafId !== 0) return;
    _pointerMoveRafId = requestAnimationFrame(() => {
      _pointerMoveRafId = 0;
      const e = _lastPointerEvent;
      if (!e || !canvasRef) return;
      const target = getPointerHitTarget(e.clientX, e.clientY);
      canvasRef.style.cursor = target ? "pointer" : "default";
    });
  }

  function handlePointerLeave() {
    if (canvasRef) canvasRef.style.cursor = "default";
  }

  function applyMonitorIdleState() {
    // REST로 busy(worry)를 받은 뒤에는 idle 폴링으로 할당을 지우지 않는다.
    if (monitorRestAssignmentReceived || assignedWorryId || assignedSvgUrl) {
      return;
    }
    assignedWorryId = null;
    assignedSvgUrl = null;
  }

  function applyMonitorBusyWorry(worry) {
    const worryId = worry?.worryId ?? worry?.id ?? worry?.seq;
    const svgUrl = worry?.svgUrl;
    if (worryId == null || worryId === "" || !svgUrl) {
      console.warn("[Stage3] monitor busy 응답에 worryId/svgUrl 누락:", worry);
      return;
    }
    const wid = String(worryId);
    const surl = String(svgUrl);
    if (assignedWorryId === wid && assignedSvgUrl === surl) {
      return;
    }

    if (!monitorRestAssignmentReceived) {
      monitorRestAssignmentReceived = true;
      if (monitorFallbackTimeoutId) {
        window.clearTimeout(monitorFallbackTimeoutId);
        monitorFallbackTimeoutId = null;
      }
    }

    assignedWorryId = wid;
    assignedSvgUrl = surl;

    if (sceneRef && cameraRef && stage3GroundY > 0) {
      loadLetterFromSvgUrl(
        sceneRef,
        cameraRef,
        stage3GroundY,
        assignedSvgUrl,
        assignedWorryId,
        {
          holdFallUntilIntroTopView: !cameraIntro.completed,
        },
      );
    }
  }

  async function pollMonitorCurrent() {
    if (monitorPollInFlight) return;
    monitorPollInFlight = true;
    try {
      const data = await fetchMonitorCurrent();
      if (data == null) return;
      const status = data?.status;

      if (status === "idle") {
        applyMonitorIdleState();
        return;
      }

      if (status === "busy" && data.worry) {
        applyMonitorBusyWorry(data.worry);
        return;
      }

      if (status === "busy") {
        console.warn("[Stage3] monitor busy인데 worry 없음:", data);
      }
    } catch (e) {
      console.warn("[Stage3] monitor current 폴링 실패:", e);
    } finally {
      monitorPollInFlight = false;
    }
  }

  function startMonitorPolling() {
    if (monitorPollIntervalId != null) return;
    void pollMonitorCurrent();
    monitorPollIntervalId = window.setInterval(() => {
      void pollMonitorCurrent();
    }, MONITOR_POLL_MS);
  }

  function stopMonitorPolling() {
    if (monitorPollIntervalId != null) {
      window.clearInterval(monitorPollIntervalId);
      monitorPollIntervalId = null;
    }
  }

  /** 게시판 모달 생성 및 표시 */
  function disposeIceCreamTemplates() {
    // 템플릿 `scene`은 전역 GLTF 캐시 템플릿이므로 dispose하지 않는다(재진입·스폰 clone만 dispose).
    iceCreamTemplates.length = 0;
  }

  /**
   * 카트 클릭 스폰용 GLB를 섬 로드 직후 모두 받을 때까지 기다린다.
   * 이전 방식(setup에서 비동기만 시작)은 클릭 시점에 템플릿 배열이 비어 조용히 무시되기 쉬움.
   */
  async function preloadIceCreamTemplates() {
    const paths = config.icecreamCart?.spawnPaths;
    if (!paths || paths.length === 0) {
      if (import.meta.env.DEV) {
        console.warn(
          "[Stage3] icecreamCart.spawnPaths 없음 — 카트 클릭 스폰 비활성",
        );
      }
      return;
    }
    const loads = paths.map(async (rel) => {
      const url = rel.startsWith("http") ? rel : resolvePublicAssetUrl(rel);
      try {
        return await loadGltfTemplateCached(url);
      } catch (e) {
        if (import.meta.env.DEV) {
          console.warn(
            `[Stage3] 아이스크림 템플릿 로드 실패 (${rel}):`,
            e ?? "",
          );
        }
        return null;
      }
    });
    const results = await Promise.all(loads);
    if (!isStage3Active) {
      return;
    }
    for (const g of results) {
      if (g?.scene) iceCreamTemplates.push({ scene: g.scene });
    }
  }

  /** 게시판 모달 표시 (React NoticeModalBoard에 커스텀 이벤트로 전달) */
  function showNoticeModal() {
    playRandomNoticePaperSound(config.notice?.paperSoundPaths);
    window.dispatchEvent(new CustomEvent("gum:showNoticeModal"));
  }

  function playGameMachineClickSound() {
    const src = resolvePublicAssetUrl(GAME_MACHINE_CLICK_SOUND_PATH);
    if (!gameMachineClickAudio) {
      gameMachineClickAudio = new window.Audio();
      gameMachineClickAudio.preload = "auto";
      gameMachineClickAudio.volume = 0.5;
    }
    gameMachineClickAudio.pause();
    gameMachineClickAudio.currentTime = 0;
    gameMachineClickAudio.src = src;
    try {
      gameMachineClickAudio.load();
    } catch {
      // ignore
    }
    const p = gameMachineClickAudio.play();
    if (p && typeof p.catch === "function") {
      p.catch((err) => {
        if (import.meta.env.DEV) {
          console.warn("[Stage3] game machine sound play failed:", err, src);
        }
      });
    }
  }

  /** island INT_* 클릭 핸들러 */
  function handlePointerDown(event) {
    if (!cameraRef || !canvasRef || !sceneRef) return;
    const target = getPointerHitTarget(event.clientX, event.clientY);
    if (!target) {
      if (STAGE3_ICECREAM_DEBUG_BOX_ONLY) {
        spawnIceCreamFromCart();
      }
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (target === "portal") {
      if (portalTransitionInProgress) return;
      if (easterEggCount >= REQUIRED_EGG_COUNT && textDestroyed) {
        const targetStage = config.portal_bright?.targetStage ?? 6;
        startPortalTransitionToStage6(targetStage);
        return;
      }
      if (easterEggCount >= REQUIRED_EGG_COUNT && !textDestroyed) {
        dispatchSubtitleLine(
          "아직 걱정이 남아있어요. 우리 걱정을 부셔볼까요? 💥 ",
        );
        return;
      }
      if (easterEggCount < REQUIRED_EGG_COUNT) {
        dispatchSubtitleLine(
          "아직 열리지 않은 것 같아요. 섬을 더 둘러볼까요? 🗺",
        );
        return;
      }
      return;
    }

    /** @type {{ stampSubtitle: string | null } | null} */
    let eggTap = null;
    if (RAY_TARGET_TO_EGG_KEY[target]) {
      eggTap = tryRegisterEasterEggFromRayTarget(
        /** @type {"notice"|"gameMachine"|"icecream"|"tent"} */ (target),
      );
    }

    if (target === "icecream") {
      if (!iceCreamCartRef) {
        if (import.meta.env.DEV) {
          console.warn(
            "[Stage3] icecream 클릭 감지됨. 하지만 카트 ref가 없습니다(INT 네이밍/계층 확인).",
          );
        }
        return;
      }
      if (iceCreamTemplates.length === 0) {
        if (import.meta.env.DEV) {
          console.warn(
            "[Stage3] 아이스크림 템플릿이 비어 있습니다. GLB 경로·네트워크를 확인하세요.",
          );
        }
        return;
      }
      spawnIceCreamFromCart();
      if (eggTap?.stampSubtitle) {
        dispatchSubtitleLine(eggTap.stampSubtitle);
      }
      return;
    }
    if (target === "notice") {
      showNoticeModal();
      if (eggTap?.stampSubtitle) {
        pendingEggDiscoverySubtitle = eggTap.stampSubtitle;
      }
      return;
    }
    if (target === "gameMachine") {
      playGameMachineClickSound();
      openMinigame({
        camera: cameraRef,
        gameMachineRef,
        orbitControls: debugControls?.getOrbitControls?.() ?? null,
      });
      if (eggTap?.stampSubtitle) {
        pendingEggDiscoverySubtitle = eggTap.stampSubtitle;
      }
      return;
    }
    // INT_tent → 껌 카드(타로) 모달 (효과음은 openGumCardsModal 내부)
    if (target === "tent") {
      openGumCardsModal();
      if (eggTap?.stampSubtitle) {
        pendingEggDiscoverySubtitle = eggTap.stampSubtitle;
      }
      return;
    }
    if (target === "well") {
      playRandomWellClickSound();
      window.dispatchEvent(new CustomEvent("gum:wellClick"));
      return;
    }
    if (target === "clock") return;
  }

  function updateStreetLightProximitySound() {
    const userPos = character?.getPosition?.();
    if (!userPos || streetLightWorldPositions.length === 0) {
      wasNearStreetLight = false;
      return;
    }
    const radiusSq = STREET_LIGHT_TRIGGER_RADIUS * STREET_LIGHT_TRIGGER_RADIUS;
    const isNear = streetLightWorldPositions.some((p) => {
      const dx = p.x - userPos.x;
      const dz = p.z - userPos.z;
      return dx * dx + dz * dz <= radiusSq;
    });
    if (!isNear) {
      wasNearStreetLight = false;
      return;
    }
    const now = Date.now();
    if (
      !wasNearStreetLight &&
      now - lastStreetLightSoundAtMs >= STREET_LIGHT_TRIGGER_COOLDOWN_MS
    ) {
      playRandomStreetLightClickSound();
      lastStreetLightSoundAtMs = now;
    }
    wasNearStreetLight = true;
  }

  function updateClockProximitySound() {
    const userPos = character?.getPosition?.();
    if (!userPos || clockWorldPositions.length === 0) {
      wasNearClock = false;
      return;
    }
    const radiusSq = CLOCK_TRIGGER_RADIUS * CLOCK_TRIGGER_RADIUS;
    const isNear = clockWorldPositions.some((p) => {
      const dx = p.x - userPos.x;
      const dz = p.z - userPos.z;
      return dx * dx + dz * dz <= radiusSq;
    });
    if (!isNear) {
      wasNearClock = false;
      return;
    }
    const now = Date.now();
    if (
      !wasNearClock &&
      now - lastClockSoundAtMs >= CLOCK_TRIGGER_COOLDOWN_MS
    ) {
      playRandomClockClickSound();
      lastClockSoundAtMs = now;
    }
    wasNearClock = true;
  }

  let _iceCreamGroundMat = null;
  let _iceCreamMat = null;

  /** 캐릭터용 처리지 Y + 보정(섬 실제 메시와 무한 평면 높이 차이) */
  function getIceCreamPhysicsGroundY() {
    return (
      stage3GroundY +
      Number(config.icecreamCart?.["physicsGroundYOffset"] ?? 0.45)
    );
  }

  function syncIceCreamGroundPlane() {
    if (!iceCreamGroundBody) return;
    const y = getIceCreamPhysicsGroundY();
    iceCreamGroundBody.position.set(0, y, 0);
  }

  /** 아이스크림용 물리 월드 초기화 (지면, 중력) */
  function initIceCreamPhysics() {
    if (iceCreamPhysicsWorld) return;
    _iceCreamGroundMat = new CANNON.Material("icecreamGround");
    _iceCreamMat = new CANNON.Material("icecream");
    iceCreamPhysicsWorld = new CANNON.World({
      gravity: new CANNON.Vec3(0, -18, 0),
    });
    iceCreamGroundBody = new CANNON.Body({
      type: CANNON.Body.STATIC,
      shape: new CANNON.Plane(),
      material: _iceCreamGroundMat,
    });
    iceCreamGroundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    iceCreamGroundBody.position.set(0, getIceCreamPhysicsGroundY(), 0);
    iceCreamPhysicsWorld.addBody(iceCreamGroundBody);
    iceCreamPhysicsWorld.addContactMaterial(
      new CANNON.ContactMaterial(_iceCreamGroundMat, _iceCreamMat, {
        friction: 0.4,
        restitution: 0.25,
      }),
    );
  }
  function removeSpawnedIceCreamAt(index) {
    const item = spawnedIceCreams[index];
    if (!item) return;
    if (item.body && item.landSoundHandler) {
      item.body.removeEventListener("collide", item.landSoundHandler);
      item.landSoundHandler = undefined;
    }
    if (iceCreamPhysicsWorld && item.body) {
      iceCreamPhysicsWorld.removeBody(item.body);
    }
    if (sceneRef) {
      sceneRef.remove(item.group);
    }
    item.group.traverse((child) => {
      if (!child.isMesh) return;
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        const m = child.material;
        if (Array.isArray(m)) m.forEach((x) => x.dispose());
        else m.dispose();
      }
    });
    spawnedIceCreams.splice(index, 1);
  }

  function spawnIceCreamFromCart() {
    if (!sceneRef) return;
    if (!iceCreamCartRef && !STAGE3_ICECREAM_DEBUG_BOX_ONLY) {
      if (import.meta.env.DEV) {
        console.warn("[Stage3] 카트가 아직 로드되지 않았습니다.");
      }
      return;
    }
    const maxSpawns = config.icecreamCart?.maxSpawns ?? 10;
    if (spawnedIceCreams.length >= maxSpawns) {
      if (import.meta.env.DEV) {
        console.warn(
          `[Stage3] 아이스크림 스폰 상한(${maxSpawns}) 도달: 가장 오래된 오브젝트를 제거 후 새로 스폰합니다.`,
        );
      }
      removeSpawnedIceCreamAt(0);
    }
    if (STAGE3_ICECREAM_DEBUG_BOX_ONLY) {
      const debugHalf = 0.45;
      const debugMesh = new THREE.Mesh(
        new THREE.BoxGeometry(debugHalf * 2, debugHalf * 2, debugHalf * 2),
        new THREE.MeshBasicMaterial({
          color: 0xff3355,
          wireframe: false,
          depthTest: false,
          transparent: true,
          opacity: 0.9,
        }),
      );
      const charPos = character?.getPosition?.() ?? null;
      if (charPos) {
        debugMesh.position.set(charPos.x, charPos.y + 1.4, charPos.z);
      } else if (cameraRef) {
        cameraRef.getWorldDirection(_iceSpawnDir);
        debugMesh.position
          .copy(cameraRef.position)
          .add(_iceSpawnDir.multiplyScalar(3));
      } else {
        debugMesh.position.set(0, stage3GroundY + 1.5, 0);
      }
      debugMesh.name = "DEBUG_IceCreamBox";
      debugMesh.renderOrder = 999;
      sceneRef.add(debugMesh);
      spawnedIceCreams.push({ group: debugMesh, body: null });
      return;
    }
    initIceCreamPhysics();
    syncIceCreamGroundPlane();
    if (iceCreamCartRef) {
      iceCreamCartRef.updateMatrixWorld(true);
      const cartBox = new THREE.Box3().setFromObject(iceCreamCartRef);
      if (!cartBox.isEmpty()) {
        cartBox.getCenter(_iceCartWorld);
      } else {
        iceCreamCartRef.getWorldPosition(_iceCartWorld);
      }
    } else if (character?.getPosition?.()) {
      const p = character.getPosition();
      _iceCartWorld.set(p.x, Math.max(stage3GroundY + 0.5, p.y), p.z);
    } else {
      _iceCartWorld.set(0, stage3GroundY + 0.7, 0);
    }

    // 1) 시각 오브젝트 준비: 디버그 모드면 GLB 대신 박스만 생성
    let clone;
    /** 물리/월드 위치를 따라가는 루트(메시 중심 보정은 자식에만 둔다) */
    let spawnRoot = null;
    let halfExtents;
    if (STAGE3_ICECREAM_DEBUG_BOX_ONLY) {
      const debugHalf = 0.18;
      halfExtents = new CANNON.Vec3(debugHalf, debugHalf, debugHalf);
      clone = new THREE.Group();
      const debugBox = new THREE.Mesh(
        new THREE.BoxGeometry(debugHalf * 2, debugHalf * 2, debugHalf * 2),
        new THREE.MeshBasicMaterial({
          color: 0xff3355,
          wireframe: true,
          transparent: true,
          opacity: 0.95,
          depthTest: true,
        }),
      );
      debugBox.name = "DEBUG_IceCreamBox";
      clone.add(debugBox);
    } else {
      if (iceCreamTemplates.length === 0) {
        if (import.meta.env.DEV) {
          console.warn(
            "[Stage3] 스폰 모델 로드 실패. 콘솔에서 '아이스크림 스폰 모델 로드 실패' 확인.",
          );
        }
        return;
      }
      const template =
        iceCreamTemplates[Math.floor(Math.random() * iceCreamTemplates.length)];
      clone = template.scene.clone(true);
      clone.frustumCulled = false;
      const spawnScale = config.icecreamCart?.spawnScale ?? 0.5;
      const maxVisualSize = config.icecreamCart?.maxVisualSize ?? 0.9;
      const minVisualSize = Number(
        config.icecreamCart?.["minVisualSize"] ?? 0.35,
      );
      clone.position.set(0, 0, 0);
      clone.scale.setScalar(spawnScale);
      clone.updateMatrixWorld(true);
      clone.traverse((child) => {
        if (!child.isMesh) return;
        child.visible = true;
        child.castShadow = true;
        child.receiveShadow = true;
        child.frustumCulled = false;
      });
      const box = new THREE.Box3().setFromObject(clone);
      box.getSize(_iceModelSize);
      const maxDim = Math.max(
        _iceModelSize.x,
        _iceModelSize.y,
        _iceModelSize.z,
      );
      if (maxDim > 1e-6 && (maxDim > maxVisualSize || maxDim < minVisualSize)) {
        const target =
          maxDim > maxVisualSize
            ? maxVisualSize
            : Math.max(minVisualSize, maxDim);
        const fit = target / maxDim;
        clone.scale.multiplyScalar(fit);
        clone.updateMatrixWorld(true);
        box.setFromObject(clone);
        box.getSize(_iceModelSize);
      }
      box.getCenter(_iceModelCenter);
      clone.position.sub(_iceModelCenter);
      clone.updateMatrixWorld(true);
      spawnRoot = new THREE.Group();
      spawnRoot.name = "SpawnedIceCreamRoot";
      spawnRoot.add(clone);
    }

    // 2) 스폰 위치: 카트 바운딩 중심 주변 수평 원환에서 랜덤
    const radiusMin = Number(config.icecreamCart?.["spawnRadiusMin"] ?? 0.3);
    const radiusMax = Number(config.icecreamCart?.["spawnRadiusMax"] ?? 1.15);
    const span = Math.max(0, radiusMax - radiusMin);
    const angle = Math.random() * Math.PI * 2;
    // 균등 분포(원판): r² 균등
    const t = Math.random();
    const r = radiusMin + Math.sqrt(t) * span;
    const dx = Math.cos(angle) * r;
    const dz = Math.sin(angle) * r;
    const sx = _iceCartWorld.x + dx;
    const sz = _iceCartWorld.z + dz;
    const heightJitter = Number(
      config.icecreamCart?.["spawnHeightJitter"] ?? 0.2,
    );
    const floorY = getIceCreamPhysicsGroundY();
    const baseY = Math.max(
      floorY + 0.35,
      _iceCartWorld.y + (config.icecreamCart?.spawnHeightAboveCart ?? 0.55),
    );
    const sy = baseY + (Math.random() * 2 - 1) * Math.max(0, heightJitter);

    // 발사 방향: 기본은 [스폰 지점 → 유저 캐릭터]. 없으면 카트→캐릭 / 카트 앞쪽 폴백.
    const charPos = character?.getPosition?.() ?? null;
    if (charPos) {
      _iceSpawnDir.set(charPos.x - sx, 0, charPos.z - sz);
    }
    if (!charPos || _iceSpawnDir.lengthSq() < 1e-6) {
      if (charPos) {
        _iceSpawnDir.set(
          charPos.x - _iceCartWorld.x,
          0,
          charPos.z - _iceCartWorld.z,
        );
      } else if (iceCreamCartRef) {
        _iceSpawnDir.set(0, 0, -1);
        _iceSpawnDir.applyQuaternion(
          iceCreamCartRef.getWorldQuaternion(_iceCartQuat),
        );
        _iceSpawnDir.y = 0;
      } else {
        _iceSpawnDir.set(dx, 0, dz);
      }
    }
    if (_iceSpawnDir.lengthSq() < 1e-6) {
      _iceSpawnDir.set(0, 0, 1);
    }
    _iceSpawnDir.normalize();
    const spreadRad = Number(
      config.icecreamCart?.["launchTowardPlayerSpread"] ?? 0.28,
    );
    if (spreadRad > 0) {
      const jitter = (Math.random() * 2 - 1) * spreadRad;
      const c = Math.cos(jitter);
      const s = Math.sin(jitter);
      const x = _iceSpawnDir.x;
      const z = _iceSpawnDir.z;
      _iceSpawnDir.set(x * c - z * s, 0, x * s + z * c);
      _iceSpawnDir.normalize();
    }

    /** @type {THREE.Object3D} */
    let groupForScene = clone;
    if (spawnRoot) {
      spawnRoot.position.set(sx, sy, sz);
      spawnRoot.updateMatrixWorld(true);
      groupForScene = spawnRoot;
    } else {
      clone.position.set(sx, sy, sz);
      clone.updateMatrixWorld(true);
    }

    // 3) 물리 바디 생성
    if (!halfExtents) {
      const box = new THREE.Box3().setFromObject(groupForScene);
      box.getSize(_iceModelSize);
      const minHalf = 0.08;
      halfExtents = new CANNON.Vec3(
        Math.max(_iceModelSize.x * 0.5, minHalf),
        Math.max(_iceModelSize.y * 0.5, minHalf),
        Math.max(_iceModelSize.z * 0.5, minHalf),
      );
    }
    const boxShape = new CANNON.Box(halfExtents);
    const body = new CANNON.Body({
      mass: 0.3,
      shape: boxShape,
      position: new CANNON.Vec3(sx, sy, sz),
      material: _iceCreamMat,
      linearDamping: 0.1,
      angularDamping: 0.3,
    });
    const vHoriz =
      Number(config.icecreamCart?.["launchHorizontalMin"] ?? 3.1) +
      Math.random() *
        Number(config.icecreamCart?.["launchHorizontalSpread"] ?? 1.6);
    const vUp =
      Number(config.icecreamCart?.["launchUpMin"] ?? 5.6) +
      Math.random() * Number(config.icecreamCart?.["launchUpSpread"] ?? 3.2);
    body.velocity.set(_iceSpawnDir.x * vHoriz, vUp, _iceSpawnDir.z * vHoriz);
    body.angularVelocity.set(
      (Math.random() - 0.5) * 4,
      (Math.random() - 0.5) * 4,
      (Math.random() - 0.5) * 4,
    );

    iceCreamPhysicsWorld.addBody(body);
    sceneRef.add(groupForScene);
    const iceEntry = { group: groupForScene, body };
    const landHandler = (e) => {
      if (iceEntry.landSoundPlayed) return;
      if (e.body !== iceCreamGroundBody) return;
      iceEntry.landSoundPlayed = true;
      if (ICECREAM_LAND_SOUND_PATHS.length === 0) return;
      const path =
        ICECREAM_LAND_SOUND_PATHS[
          Math.floor(Math.random() * ICECREAM_LAND_SOUND_PATHS.length)
        ];
      const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
      const landAudio = new window.Audio();
      const v = Number(config.icecreamCart?.landSoundVolume ?? 0.22);
      landAudio.volume = Math.min(1, Math.max(0, v));
      landAudio.src = base + path;
      landAudio.play().catch(() => {});
    };
    iceEntry.landSoundHandler = landHandler;
    iceEntry.landSoundPlayed = false;
    body.addEventListener("collide", landHandler);
    spawnedIceCreams.push(iceEntry);
  }

  function updateSpawnedIceCreams(delta) {
    if (!iceCreamPhysicsWorld) return;
    const substeps = config.icecreamCart?.physicsSubsteps ?? 2;
    iceCreamPhysicsWorld.step(1 / 60, delta, substeps);
    for (let i = 0; i < spawnedIceCreams.length; i++) {
      const s = spawnedIceCreams[i];
      if (!s.body) continue;
      s.group.position.copy(s.body.position);
      s.group.quaternion.copy(s.body.quaternion);
    }
  }

  /** 최신 handwriting 메타데이터 1개 반환 (없으면 null) */
  async function getLatestHandwritingMetadata() {
    if (!supabase) return null;
    const sessionId = getSessionId();
    let list = [];
    for (const folder of [sessionId, sessionId + "/"]) {
      let files;
      let error;
      try {
        const res = await supabase.storage
          .from(HANDWRITING_BUCKET)
          .list(folder.replace(/\/$/, ""), { limit: 500 });
        files = res.data;
        error = res.error;
      } catch (e) {
        if (import.meta.env.DEV) {
          console.warn(
            "[Stage3] handwriting Storage 목록 실패(네트워크 전환 등) — DB 폴백 시도:",
            e?.message ?? e,
          );
        }
        break;
      }
      if (!error && Array.isArray(files)) {
        const svgFiles = files.filter(
          (f) => f.name && String(f.name).toLowerCase().endsWith(".svg"),
        );
        const prefix = folder.replace(/\/$/, "")
          ? folder.replace(/\/$/, "") + "/"
          : "";
        list = svgFiles.map((f) => ({
          path: prefix + f.name,
          id: f.name.replace(/\.svg$/i, ""),
          createdAt: f.created_at ?? null,
        }));
        if (list.length > 0) break;
      }
    }
    if (list.length === 0) {
      try {
        const { data: rows } = await supabase
          .from(HANDWRITING_TABLE)
          .select("storage_path, created_at")
          .eq("session_id", sessionId)
          .order("created_at", { ascending: true })
          .limit(500);
        if (Array.isArray(rows) && rows.length > 0) {
          list = rows.map((r) => ({
            path: String(r.storage_path ?? ""),
            id: String(r.storage_path ?? "").replace(/\.svg$/i, ""),
            createdAt: r.created_at ?? null,
          }));
        }
      } catch (e) {
        if (import.meta.env.DEV) {
          console.warn("[Stage3] handwriting DB 조회 실패:", e?.message ?? e);
        }
      }
    }
    if (list.length === 0) return null;
    list.sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return ta - tb;
    });
    const latest = list[list.length - 1];
    const { data: urlData } = supabase.storage
      .from(HANDWRITING_BUCKET)
      .getPublicUrl(latest.path);
    return { id: latest.id, url: urlData?.publicUrl ?? "" };
  }

  function setReadableRotationTowardCamera(group, camera, _groundY) {
    const dir = new THREE.Vector3(
      camera.position.x - group.position.x,
      0,
      camera.position.z - group.position.z,
    );
    if (dir.lengthSq() < 1e-6) return;
    dir.normalize();
    const yaw = Math.atan2(dir.x, dir.z);
    group.rotation.set(0, yaw, 0);
  }

  // Stage3에서는 낙하 중 회전을 사용하지 않으므로, 회전 속도 계산 유틸은 제거.

  /** 씬에서 Stage3 글자 그룹만 모두 제거 (떠 있는 것 포함) */
  function removeAllLetterGroupsFromScene(scene) {
    const toRemove = [];
    scene.traverse((obj) => {
      if (obj.userData?.isStage3Letter) toRemove.push(obj);
    });
    toRemove.forEach((obj) => {
      scene.remove(obj);
      disposeHandwritingSvgPlaneGroup(obj);
    });
    letterState = null;
  }

  /**
   * @param {{ holdFallUntilIntroTopView?: boolean }} [letterOptions]
   */
  async function loadLetterFromSvgUrl(
    scene,
    camera,
    groundY,
    svgUrl,
    debugId,
    letterOptions = {},
  ) {
    if (!svgUrl) return;
    const { holdFallUntilIntroTopView = false } = letterOptions;

    // 로딩 중 중복 요청이 들어오면 마지막 요청만 저장했다가 이어서 처리
    if (letterLoadInProgress) {
      pendingSvgUrlToLoad = svgUrl;
      pendingSvgUrlDebugId = debugId;
      return;
    }

    letterLoadInProgress = true;
    removeAllLetterGroupsFromScene(scene);

    let nextSvgUrl = svgUrl;
    let _nextDebugId = debugId;

    try {
      // pending을 포함해 "하나라도 더 있으면" 순차 처리
      // (연속 REST 할당에도 마지막 SVG가 반영되도록)
      while (nextSvgUrl) {
        const currentSvgUrl = nextSvgUrl;
        nextSvgUrl = null;
        _nextDebugId = null;

        try {
          const baseH =
            config.letterTargetHeight ?? STAGE3_LETTER_TARGET_HEIGHT;
          const randomFactor =
            STAGE3_LETTER_HEIGHT_RANDOM_MIN +
            Math.random() *
              (STAGE3_LETTER_HEIGHT_RANDOM_MAX -
                STAGE3_LETTER_HEIGHT_RANDOM_MIN);
          const targetH = baseH * randomFactor;

          const built =
            (await createHandwritingSvgVolumeGroup(currentSvgUrl, {
              targetWorldHeight: targetH,
            })) ??
            (await createHandwritingSvgPlaneGroup(currentSvgUrl, {
              targetWorldHeight: targetH,
            }));
          if (!built) return;

          const { group } = built;
          group.userData.isStage3Letter = true;

          group.updateMatrixWorld(true);
          const box = new THREE.Box3().setFromObject(group);
          const letterBottomOffset = Math.max(0, -box.min.y);
          const landingY = groundY + letterBottomOffset;

          const startY = landingY + STAGE3_SPAWN_HEIGHT + Math.random() * 4;
          const spawnX = config.letterSpawnXZ?.x ?? 0;
          const spawnZ = config.letterSpawnXZ?.z ?? 0;
          group.position.set(spawnX, startY, spawnZ);
          group.rotation.set(0, 0, 0);
          scene.add(group);

          const speedFactor = 0.6 + Math.random() * 0.4;
          const gravity = STAGE3_GRAVITY * speedFactor;
          const initialVy =
            (STAGE3_INITIAL_VY - Math.random() * 0.3) * speedFactor;

          letterState = {
            group,
            holdFallUntilIntroTopView,
            initialVyDeferred: initialVy,
            velocity: {
              y: holdFallUntilIntroTopView ? 0 : initialVy,
              rotationX: 0,
              rotationY: 0,
              rotationZ: 0,
            },
            gravity,
            groundY,
            landingY,
            bounces: 0,
            landed: false,
            hitCount: 0,
          };
        } catch (e) {
          console.warn("[Stage3] svg 로드 실패:", e);
        }

        // while 내부에서 계속 로딩이 필요할 경우 pending을 소비
        if (pendingSvgUrlToLoad) {
          nextSvgUrl = pendingSvgUrlToLoad;
          _nextDebugId = pendingSvgUrlDebugId;
          pendingSvgUrlToLoad = null;
          pendingSvgUrlDebugId = null;
          removeAllLetterGroupsFromScene(scene);
        } else {
          nextSvgUrl = null;
        }
      }
    } catch (e) {
      if (import.meta.env.DEV) {
        console.warn("[Stage3] 글자 로드 실패:", e);
      }
    } finally {
      letterLoadInProgress = false;
    }
  }

  /**
   * @param {{ holdFallUntilIntroTopView?: boolean }} [letterOptions]
   */
  async function loadLatestLetter(scene, camera, groundY, letterOptions = {}) {
    const metadata = await getLatestHandwritingMetadata();
    if (!metadata?.url) {
      return;
    }
    await loadLetterFromSvgUrl(
      scene,
      camera,
      groundY,
      metadata.url,
      metadata.id,
      letterOptions,
    );
  }

  /** 0키: 글자 다시 떨어뜨리기 (디버깅용). 이미 없으면 최신 글자 재로드 후 낙하 */
  function resetLetterFall() {
    if (letterState) {
      const s = letterState;
      const speedFactor = 0.25 + Math.random() * 0.75;
      const startY = s.landingY + STAGE3_SPAWN_HEIGHT + Math.random() * 4;
      const startX = config.letterSpawnXZ?.x ?? 0;
      const startZ = config.letterSpawnXZ?.z ?? 0;
      const gravity = STAGE3_GRAVITY * speedFactor;
      const initialVy = (STAGE3_INITIAL_VY - Math.random() * 0.3) * speedFactor;

      s.group.position.set(startX, startY, startZ);
      s.group.rotation.set(0, 0, 0);

      s.velocity.y = initialVy;
      s.velocity.rotationX = 0;
      s.velocity.rotationY = 0;
      s.velocity.rotationZ = 0;
      s.gravity = gravity;
      s.bounces = 0;
      s.landed = false;
      s.hitCount = 0;
      return;
    }
    if (sceneRef && cameraRef && stage3GroundY > 0) {
      if (assignedSvgUrl) {
        loadLetterFromSvgUrl(
          sceneRef,
          cameraRef,
          stage3GroundY,
          assignedSvgUrl,
          assignedWorryId,
          { holdFallUntilIntroTopView: false },
        );
      } else {
        loadLatestLetter(sceneRef, cameraRef, stage3GroundY);
      }
    }
  }

  function updateLetter(delta, camera) {
    if (!letterState || letterState.landed) return;
    const s = letterState;
    if (s.holdFallUntilIntroTopView) {
      if (cameraIntro.introTopViewCommitted || cameraIntro.completed) {
        s.holdFallUntilIntroTopView = false;
        s.velocity.y = s.initialVyDeferred;
      } else {
        return;
      }
    }
    const nextY = s.group.position.y + s.velocity.y * delta;
    if (nextY <= s.landingY) {
      // 첫 충돌 시 한 번만 가볍게 바운스해서 무게감을 표현
      if ((s.bounces ?? 0) < 1 && Math.abs(s.velocity.y) > 2) {
        s.group.position.y = s.landingY;
        s.velocity.y = -s.velocity.y * LETTER_BOUNCE_RESTITUTION;
        s.bounces = (s.bounces ?? 0) + 1;
        return;
      }

      s.group.position.y = s.landingY;
      s.velocity.y = 0;
      s.velocity.rotationX = 0;
      s.velocity.rotationY = 0;
      s.velocity.rotationZ = 0;
      setReadableRotationTowardCamera(s.group, camera, s.groundY);
      s.landed = true;
      return;
    }
    s.velocity.y += s.gravity * delta;
    s.group.position.y = nextY;
    s.group.rotation.x += s.velocity.rotationX * delta;
    s.group.rotation.y += s.velocity.rotationY * delta;
    s.group.rotation.z += s.velocity.rotationZ * delta;
  }

  const _v3 = new THREE.Vector3();
  const _v3b = new THREE.Vector3();
  const _v3c = new THREE.Vector3();
  const _normal = new THREE.Vector3();

  /** 그룹 내 모든 메시에서 월드 공간 삼각형 수집 */
  function collectTrianglesFromGroup(group) {
    group.updateMatrixWorld(true);
    const triangles = [];
    let meshIndex = 0;
    group.traverse((child) => {
      if (!child.isMesh || !child.geometry) return;
      const geom = child.geometry;
      const posAttr = geom.getAttribute("position");
      const normAttr = geom.getAttribute("normal");
      if (!posAttr) return;
      const index = geom.getIndex();
      const matrix = child.matrixWorld;
      const addTri = (i0, i1, i2) => {
        _v3.fromBufferAttribute(posAttr, i0);
        _v3b.fromBufferAttribute(posAttr, i1);
        _v3c.fromBufferAttribute(posAttr, i2);
        _v3.applyMatrix4(matrix);
        _v3b.applyMatrix4(matrix);
        _v3c.applyMatrix4(matrix);
        const p0 = _v3.clone();
        const p1 = _v3b.clone();
        const p2 = _v3c.clone();
        if (normAttr) {
          _normal.fromBufferAttribute(normAttr, i0);
          _normal.transformDirection(matrix);
          const n0 = _normal.clone();
          _normal.fromBufferAttribute(normAttr, i1);
          _normal.transformDirection(matrix);
          const n1 = _normal.clone();
          _normal.fromBufferAttribute(normAttr, i2);
          _normal.transformDirection(matrix);
          const n2 = _normal.clone();
          triangles.push({ p0, p1, p2, n0, n1, n2, meshIndex });
        } else {
          triangles.push({
            p0,
            p1,
            p2,
            n0: new THREE.Vector3(0, 1, 0),
            n1: new THREE.Vector3(0, 1, 0),
            n2: new THREE.Vector3(0, 1, 0),
            meshIndex,
          });
        }
      };
      meshIndex += 1;
      if (index) {
        for (let i = 0; i < index.count; i += 3) {
          addTri(index.getX(i), index.getX(i + 1), index.getX(i + 2));
        }
      } else {
        for (let i = 0; i < posAttr.count; i += 3) {
          addTri(i, i + 1, i + 2);
        }
      }
    });
    return triangles;
  }

  /** 자음/모음(shape) 단위로 분할 — shape가 2개 이상이면 한 번에 2개까지 묶어 떨어짐 */
  function partitionTrianglesByShape(triangles) {
    const byShape = new Map();
    const _c = new THREE.Vector3();
    for (const tri of triangles) {
      const idx = tri.meshIndex ?? 0;
      if (!byShape.has(idx)) byShape.set(idx, []);
      byShape.get(idx).push(tri);
    }
    const shapeCenters = [];
    for (const [, list] of byShape) {
      _c.set(0, 0, 0);
      for (const t of list) _c.add(t.p0).add(t.p1).add(t.p2);
      _c.multiplyScalar(1 / (list.length * 3));
      shapeCenters.push({ list, centroidX: _c.x });
    }
    shapeCenters.sort((a, b) => a.centroidX - b.centroidX);
    const fromLeft = Math.random() < 0.5;
    const n = shapeCenters.length;
    const takeTwo = n >= 2;
    /** @type {number[]} */
    const takeIndices = [];
    if (takeTwo) {
      if (fromLeft) {
        takeIndices.push(0, 1);
      } else {
        takeIndices.push(n - 1, n - 2);
      }
    } else {
      takeIndices.push(fromLeft ? 0 : n - 1);
    }
    const takeSet = new Set(takeIndices);
    const toFly = shapeCenters
      .filter((_, i) => takeSet.has(i))
      .flatMap((s) => s.list);
    const remaining = shapeCenters
      .filter((_, i) => !takeSet.has(i))
      .flatMap((s) => s.list);
    if (toFly.length === 0) return { remaining: triangles, fragments: [] };
    return { remaining, fragments: [toFly] };
  }

  /** 절단면 위 정점: x를 cutX로 고정, 노멀은 평면 법선(단무지 썬 것처럼 깔끔한 단면) */
  const CUT_NORMAL_LEFT = new THREE.Vector3(1, 0, 0);
  const CUT_NORMAL_RIGHT = new THREE.Vector3(-1, 0, 0);

  function clipTriangleByPlane(tri, cutX) {
    const d0 = tri.p0.x - cutX;
    const d1 = tri.p1.x - cutX;
    const d2 = tri.p2.x - cutX;
    const left = [];
    const right = [];
    const pushTri = (arr, q0, q1, q2, m0, m1, m2) => {
      arr.push({
        p0: q0.clone(),
        p1: q1.clone(),
        p2: q2.clone(),
        n0: m0.clone(),
        n1: m1.clone(),
        n2: m2.clone(),
      });
    };
    const onPlane = (pA, pB, t) => {
      const p = new THREE.Vector3().lerpVectors(pA, pB, t);
      p.x = cutX;
      return p;
    };
    if (d0 <= 0 && d1 <= 0 && d2 <= 0) {
      pushTri(left, tri.p0, tri.p1, tri.p2, tri.n0, tri.n1, tri.n2);
      return { left, right };
    }
    if (d0 >= 0 && d1 >= 0 && d2 >= 0) {
      pushTri(right, tri.p0, tri.p1, tri.p2, tri.n0, tri.n1, tri.n2);
      return { left, right };
    }
    const t01 = d0 - d1 !== 0 ? -d0 / (d1 - d0) : 0;
    const t12 = d1 - d2 !== 0 ? -d1 / (d2 - d1) : 0;
    const t20 = d2 - d0 !== 0 ? -d2 / (d0 - d2) : 0;
    if (d0 >= 0 && d1 < 0 && d2 < 0) {
      const A = onPlane(tri.p0, tri.p1, t01);
      const B = onPlane(tri.p0, tri.p2, t20);
      pushTri(right, tri.p0, A, B, tri.n0, CUT_NORMAL_RIGHT, CUT_NORMAL_RIGHT);
      pushTri(left, tri.p1, tri.p2, B, tri.n1, tri.n2, CUT_NORMAL_LEFT);
      pushTri(left, tri.p1, B, A, tri.n1, CUT_NORMAL_LEFT, CUT_NORMAL_LEFT);
    } else if (d0 < 0 && d1 >= 0 && d2 < 0) {
      const A = onPlane(tri.p0, tri.p1, t01);
      const B = onPlane(tri.p1, tri.p2, t12);
      pushTri(right, tri.p1, A, B, tri.n1, CUT_NORMAL_RIGHT, CUT_NORMAL_RIGHT);
      pushTri(left, tri.p0, A, tri.p2, tri.n0, CUT_NORMAL_LEFT, tri.n2);
      pushTri(left, A, B, tri.p2, CUT_NORMAL_LEFT, CUT_NORMAL_LEFT, tri.n2);
    } else if (d0 < 0 && d1 < 0 && d2 >= 0) {
      const A = onPlane(tri.p1, tri.p2, t12);
      const B = onPlane(tri.p0, tri.p2, t20);
      pushTri(right, tri.p2, B, A, tri.n2, CUT_NORMAL_RIGHT, CUT_NORMAL_RIGHT);
      pushTri(left, tri.p0, tri.p1, A, tri.n0, tri.n1, CUT_NORMAL_LEFT);
      pushTri(left, tri.p0, A, B, tri.n0, CUT_NORMAL_LEFT, CUT_NORMAL_LEFT);
    } else if (d0 < 0 && d1 >= 0 && d2 >= 0) {
      const A = onPlane(tri.p0, tri.p1, t01);
      const B = onPlane(tri.p0, tri.p2, t20);
      pushTri(left, tri.p0, A, B, tri.n0, CUT_NORMAL_LEFT, CUT_NORMAL_LEFT);
      pushTri(right, tri.p1, B, A, tri.n1, CUT_NORMAL_RIGHT, CUT_NORMAL_RIGHT);
      pushTri(right, tri.p1, tri.p2, B, tri.n1, tri.n2, CUT_NORMAL_RIGHT);
    } else if (d0 >= 0 && d1 < 0 && d2 >= 0) {
      const A = onPlane(tri.p0, tri.p1, t01);
      const B = onPlane(tri.p1, tri.p2, t12);
      pushTri(left, tri.p1, A, B, tri.n1, CUT_NORMAL_LEFT, CUT_NORMAL_LEFT);
      pushTri(right, tri.p0, A, tri.p2, tri.n0, CUT_NORMAL_RIGHT, tri.n2);
      pushTri(right, A, B, tri.p2, CUT_NORMAL_RIGHT, CUT_NORMAL_RIGHT, tri.n2);
    } else if (d0 >= 0 && d1 >= 0 && d2 < 0) {
      const A = onPlane(tri.p1, tri.p2, t12);
      const B = onPlane(tri.p0, tri.p2, t20);
      pushTri(left, tri.p2, B, A, tri.n2, CUT_NORMAL_LEFT, CUT_NORMAL_LEFT);
      pushTri(right, tri.p0, tri.p1, A, tri.n0, tri.n1, CUT_NORMAL_RIGHT);
      pushTri(right, tri.p0, A, B, tri.n0, CUT_NORMAL_RIGHT, CUT_NORMAL_RIGHT);
    }
    return { left, right };
  }

  /**
   * 글자 로컬 x 기준 평면으로 실제 클리핑 → 칼로 썬 것처럼 깔끔한 절단면. 캡 없음.
   */
  function partitionTrianglesOneSlice(triangles, group, fraction) {
    group.updateMatrixWorld(true);
    const invWorld = new THREE.Matrix4().copy(group.matrixWorld).invert();
    const matrixWorld = group.matrixWorld;
    const toWorld = (p) => p.clone().applyMatrix4(matrixWorld);
    const _triLocal = {
      p0: new THREE.Vector3(),
      p1: new THREE.Vector3(),
      p2: new THREE.Vector3(),
      n0: new THREE.Vector3(),
      n1: new THREE.Vector3(),
      n2: new THREE.Vector3(),
    };
    let minX = Infinity;
    let maxX = -Infinity;
    const localTris = [];
    for (const tri of triangles) {
      _triLocal.p0.copy(tri.p0).applyMatrix4(invWorld);
      _triLocal.p1.copy(tri.p1).applyMatrix4(invWorld);
      _triLocal.p2.copy(tri.p2).applyMatrix4(invWorld);
      _triLocal.n0.copy(tri.n0).transformDirection(invWorld);
      _triLocal.n1.copy(tri.n1).transformDirection(invWorld);
      _triLocal.n2.copy(tri.n2).transformDirection(invWorld);
      const x = (_triLocal.p0.x + _triLocal.p1.x + _triLocal.p2.x) / 3;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      localTris.push({
        p0: _triLocal.p0.clone(),
        p1: _triLocal.p1.clone(),
        p2: _triLocal.p2.clone(),
        n0: _triLocal.n0.clone(),
        n1: _triLocal.n1.clone(),
        n2: _triLocal.n2.clone(),
      });
    }
    const range = maxX - minX;
    if (range < 1e-6)
      return {
        remaining: triangles,
        fragments: [],
        cutX: null,
        fromLeft: false,
      };
    const fromLeft = Math.random() < 0.5;
    const cutXLocal = fromLeft
      ? minX + range * fraction
      : maxX - range * fraction;
    const allLeft = [];
    const allRight = [];
    for (const tri of localTris) {
      const { left, right } = clipTriangleByPlane(tri, cutXLocal);
      allLeft.push(...left);
      allRight.push(...right);
    }
    const toWorldTri = (t) => ({
      p0: toWorld(t.p0),
      p1: toWorld(t.p1),
      p2: toWorld(t.p2),
      n0: t.n0.clone().transformDirection(matrixWorld),
      n1: t.n1.clone().transformDirection(matrixWorld),
      n2: t.n2.clone().transformDirection(matrixWorld),
    });
    const toFly = (fromLeft ? allLeft : allRight).map(toWorldTri);
    const remaining = (fromLeft ? allRight : allLeft).map(toWorldTri);
    if (toFly.length === 0)
      return {
        remaining: triangles,
        fragments: [],
        cutX: null,
        fromLeft: false,
      };
    return { remaining, fragments: [toFly], cutX: null, fromLeft };
  }

  /** 삼각형 배열 → 중심 기준 로컬 BufferGeometry */
  function trianglesToGeometry(triangles, centerWorld) {
    if (triangles.length === 0) return null;
    const positions = [];
    const normals = [];
    for (const tri of triangles) {
      positions.push(
        tri.p0.x - centerWorld.x,
        tri.p0.y - centerWorld.y,
        tri.p0.z - centerWorld.z,
        tri.p1.x - centerWorld.x,
        tri.p1.y - centerWorld.y,
        tri.p1.z - centerWorld.z,
        tri.p2.x - centerWorld.x,
        tri.p2.y - centerWorld.y,
        tri.p2.z - centerWorld.z,
      );
      normals.push(
        tri.n0.x,
        tri.n0.y,
        tri.n0.z,
        tri.n1.x,
        tri.n1.y,
        tri.n1.z,
        tri.n2.x,
        tri.n2.y,
        tri.n2.z,
      );
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geom.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
    geom.computeBoundingSphere();
    return geom;
  }

  function getHitTarget() {
    const origin = (
      character?.getPosition?.() ??
      cameraRef?.position ??
      new THREE.Vector3(0, 0, 0)
    ).clone();
    let best = null;
    let bestDist = HIT_RANGE;
    if (letterState?.landed && letterState.hitCount < HITS_TO_DESTROY) {
      const d = letterState.group.position.distanceTo(origin);
      if (d < bestDist) {
        bestDist = d;
        best = {
          type: "letter",
          group: letterState.group,
          groundY: letterState.groundY,
        };
      }
    }
    for (let i = 0; i < fragments.length; i++) {
      if (fragments[i].age >= FRAGMENT_FADE_START) continue;
      const d = fragments[i].group.position.distanceTo(origin);
      if (d < bestDist) {
        bestDist = d;
        best = { type: "fragment", index: i, groundY: fragments[i].groundY };
      }
    }
    return best;
  }

  /** 풀에서 fragment 슬롯 할당 (없으면 새로 생성). geom, mat은 caller가 생성 후 전달 */
  function allocFragment(geom, mat) {
    if (fragmentPool.length > 0) {
      const slot = fragmentPool.pop();
      slot.group.geometry = geom;
      slot.group.material = mat.clone();
      return slot;
    }
    const mesh = new THREE.Mesh(geom, mat.clone());
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return {
      group: mesh,
      velocity: new THREE.Vector3(),
      angularVelocity: new THREE.Vector3(),
    };
  }

  function pickRandomFlowerAssetUrl() {
    const rel =
      FRAGMENT_FLOWER_PATHS[
        Math.floor(Math.random() * FRAGMENT_FLOWER_PATHS.length)
      ];
    return resolvePublicAssetUrl(rel);
  }

  function disposeStandaloneFlowerGroup(g) {
    if (!g) return;
    if (sceneRef) sceneRef.remove(g);
    g.traverse((child) => {
      if (child.isMesh) {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          const m = child.material;
          if (Array.isArray(m)) m.forEach((x) => x.dispose());
          else m.dispose();
        }
      }
    });
  }

  function updateStandaloneFlowers(delta) {
    for (let i = standaloneFlowers.length - 1; i >= 0; i--) {
      const s = standaloneFlowers[i];
      if (s.age >= FLOWER_BLOOM_DURATION) continue;
      s.age += delta;
      if (s.age < FLOWER_BLOOM_DURATION) {
        const bt = s.age / FLOWER_BLOOM_DURATION;
        const bloomEase = 1 - (1 - bt) ** 3;
        s.group.scale.setScalar(bloomEase * FLOWER_SCALE);
      } else {
        s.group.scale.setScalar(FLOWER_SCALE);
      }
    }
  }

  function spawnFlowerAt(x, z, groundY) {
    if (!sceneRef) return;
    const url = pickRandomFlowerAssetUrl();
    const gy = groundY ?? stage3GroundY;
    void loadGltfTemplateCached(url)
      .then((gltf) => {
        if (!isStage3Active || !sceneRef) return;
        const flower = gltf.scene.clone(true);
        flower.position.set(x, gy + FLOWER_Y_OFFSET, z);
        flower.rotation.y = Math.random() * Math.PI * 2;
        flower.traverse((ch) => {
          if (ch instanceof THREE.Mesh) {
            ch.castShadow = true;
            ch.receiveShadow = true;
          }
        });
        flower.scale.setScalar(0);
        sceneRef.add(flower);
        standaloneFlowers.push({ group: flower, age: 0 });
      })
      .catch(() => {});
  }

  /** fragment 슬롯을 풀에 반환 (geometry/material dispose) */
  function releaseFragment(f) {
    sceneRef?.remove(f.group);
    if (f.group.geometry) {
      f.group.geometry.dispose();
      f.group.geometry = null;
    }
    if (f.group.material) {
      f.group.material.dispose();
      f.group.material = null;
    }
    if (fragmentPool.length < FRAGMENT_POOL_MAX) {
      fragmentPool.push(f);
    }
  }

  function createFragmentMeshes(fragTriangles, mat, groundY) {
    for (const triList of fragTriangles) {
      if (triList.length === 0) continue;
      const fragCenter = new THREE.Vector3(0, 0, 0);
      for (const tri of triList) {
        fragCenter.add(tri.p0).add(tri.p1).add(tri.p2);
      }
      fragCenter.multiplyScalar(1 / (triList.length * 3));
      const geom = trianglesToGeometry(triList, fragCenter);
      if (!geom) continue;
      const slot = allocFragment(geom, mat);
      slot.group.position.copy(fragCenter);
      slot.group.rotation.set(
        Math.random() * Math.PI,
        Math.random() * Math.PI,
        Math.random() * Math.PI,
      );
      const mul = FRAGMENT_BURST_IMPULSE_MUL;
      slot.velocity.set(
        (Math.random() - 0.5) * 6 * mul,
        (Math.random() * 2 + 3) * mul,
        (Math.random() - 0.5) * 6 * mul,
      );
      slot.angularVelocity.set(
        (Math.random() - 0.5) * 4 * mul,
        (Math.random() - 0.5) * 4 * mul,
        (Math.random() - 0.5) * 4 * mul,
      );
      sceneRef.add(slot.group);
      fragments.push({
        group: slot.group,
        velocity: slot.velocity,
        angularVelocity: slot.angularVelocity,
        age: 0,
        groundY,
        flowerSpawned: false,
      });
    }
  }

  function onEnterHit() {
    if (!sceneRef) return;
    const target = getHitTarget();
    if (!target) return;

    character?.playHammerCue?.();

    const mat = new THREE.MeshStandardMaterial({
      color: 0x2e2e2e,
      metalness: 0.1,
      roughness: 0.8,
      transparent: true,
      opacity: 1,
    });

    if (target.type === "fragment") {
      const fragIdx = target.index;
      const frag = fragments[fragIdx];
      const mesh = frag.group;
      const tris = collectTrianglesFromGroup(mesh);
      if (tris.length === 0) return;
      const { remaining, fragments: fragTriangles } =
        partitionTrianglesOneSlice(tris, mesh, FRACTION_PER_HIT);
      releaseFragment(frag);
      fragments.splice(fragIdx, 1);
      createFragmentMeshes(fragTriangles, mat, target.groundY);
      if (remaining.length > 0) {
        const fragCenter = new THREE.Vector3(0, 0, 0);
        for (const tri of remaining) {
          fragCenter.add(tri.p0).add(tri.p1).add(tri.p2);
        }
        fragCenter.multiplyScalar(1 / (remaining.length * 3));
        const geom = trianglesToGeometry(remaining, fragCenter);
        if (geom) {
          const slot = allocFragment(geom, mat);
          const rmul = FRAGMENT_BURST_IMPULSE_MUL;
          slot.group.position.copy(fragCenter);
          slot.velocity.set(
            (Math.random() - 0.5) * 5 * rmul,
            (Math.random() * 1.5 + 2.5) * rmul,
            (Math.random() - 0.5) * 5 * rmul,
          );
          slot.angularVelocity.set(
            (Math.random() - 0.5) * 3 * rmul,
            (Math.random() - 0.5) * 3 * rmul,
            (Math.random() - 0.5) * 3 * rmul,
          );
          sceneRef.add(slot.group);
          fragments.push({
            group: slot.group,
            velocity: slot.velocity,
            angularVelocity: slot.angularVelocity,
            age: 0,
            groundY: target.groundY,
            flowerSpawned: false,
          });
        }
      }
      return;
    }

    const group = target.group;
    const triangles = collectTrianglesFromGroup(group);
    if (triangles.length === 0) return;

    const hasMultipleShapes =
      new Set(triangles.map((t) => t.meshIndex ?? 0)).size > 1;
    const { remaining, fragments: fragTriangles } = hasMultipleShapes
      ? partitionTrianglesByShape(triangles)
      : partitionTrianglesOneSlice(triangles, group, FRACTION_PER_HIT);

    createFragmentMeshes(fragTriangles, mat, target.groundY);

    const hitCount = ++letterState.hitCount;

    if (remaining.length === 0 || hitCount >= HITS_TO_DESTROY) {
      sceneRef.remove(group);
      disposeHandwritingSvgPlaneGroup(group);
      letterState = null;
      textDestroyed = true;
      tryDispatchWorryCompletionCelebration();
      return;
    }

    const letterMaterial = group.children.find(
      (c) => c.isMesh && c.material,
    )?.material;
    /** Slice merge is single BufferGeometry — use cap (textured) material only if array. */
    const remMat = Array.isArray(letterMaterial)
      ? letterMaterial[0].clone()
      : letterMaterial
        ? letterMaterial.clone()
        : mat.clone();
    if (!remMat.transparent) {
      remMat.transparent = true;
      remMat.opacity = 1;
    }

    const remainingCenter = new THREE.Vector3(0, 0, 0);
    for (const tri of remaining) {
      remainingCenter.add(tri.p0).add(tri.p1).add(tri.p2);
    }
    remainingCenter.multiplyScalar(1 / (remaining.length * 3));
    const invWorld = new THREE.Matrix4().copy(group.matrixWorld).invert();
    const remainingCenterLocal = remainingCenter.clone().applyMatrix4(invWorld);
    for (const tri of remaining) {
      tri.p0.applyMatrix4(invWorld).sub(remainingCenterLocal);
      tri.p1.applyMatrix4(invWorld).sub(remainingCenterLocal);
      tri.p2.applyMatrix4(invWorld).sub(remainingCenterLocal);
      tri.n0 = tri.n0.clone().transformDirection(invWorld);
      tri.n1 = tri.n1.clone().transformDirection(invWorld);
      tri.n2 = tri.n2.clone().transformDirection(invWorld);
    }
    const remainingGeom = trianglesToGeometry(
      remaining,
      new THREE.Vector3(0, 0, 0),
    );
    if (!remainingGeom) {
      letterState = null;
      return;
    }
    const remainingMesh = new THREE.Mesh(remainingGeom, remMat);
    remainingMesh.castShadow = true;
    remainingMesh.receiveShadow = true;
    while (group.children.length > 0) {
      const old = group.children[0];
      group.remove(old);
      disposeHandwritingSvgPlaneGroup(old);
    }
    group.add(remainingMesh);
    group.position.copy(remainingCenter);
  }

  function updateFragments(delta) {
    const g = STAGE3_GRAVITY * FRAGMENT_GRAVITY_MUL;
    for (let i = fragments.length - 1; i >= 0; i--) {
      const f = fragments[i];
      const groundY = f.groundY ?? stage3GroundY;
      f.group.position.x += f.velocity.x * delta;
      f.group.position.y += f.velocity.y * delta;
      f.group.position.z += f.velocity.z * delta;
      f.velocity.y += g * delta;
      if (f.group.position.y < groundY) {
        f.group.position.y = groundY;
        f.velocity.y = -f.velocity.y * FRAGMENT_BOUNCE_RESTITUTION;
        f.velocity.x *= FRAGMENT_GROUND_FRICTION;
        f.velocity.z *= FRAGMENT_GROUND_FRICTION;
        f.angularVelocity.x *= FRAGMENT_GROUND_FRICTION;
        f.angularVelocity.y *= FRAGMENT_GROUND_FRICTION;
        f.angularVelocity.z *= FRAGMENT_GROUND_FRICTION;
        if (!f.flowerSpawned) {
          f.flowerSpawned = true;
          spawnFlowerAt(f.group.position.x, f.group.position.z, groundY);
        }
      }
      f.group.rotation.x += f.angularVelocity.x * delta;
      f.group.rotation.y += f.angularVelocity.y * delta;
      f.group.rotation.z += f.angularVelocity.z * delta;
      f.age += delta;
      if (f.age >= FRAGMENT_FADE_START) {
        const fadeDur = FRAGMENT_FADE_END - FRAGMENT_FADE_START;
        const t = THREE.MathUtils.clamp(
          (f.age - FRAGMENT_FADE_START) / fadeDur,
          0,
          1,
        );
        const opacity = Math.max(0, 1 - t);
        if (f.group.material) f.group.material.opacity = opacity;
      }
      if (f.age >= FRAGMENT_FADE_END) {
        releaseFragment(f);
        fragments.splice(i, 1);
      }
    }
  }

  return {
    camera: null,

    setup(scene, renderer) {
      isStage3Active = true;
      gumCancelled = false;
      easterEggCount = 0;
      textDestroyed = false;
      discoveredEggs.clear();
      worryCompletionCelebrationDone = false;
      stage3IntroFlowStarted = false;
      cameraShakeEndTime = 0;
      pendingEggDiscoverySubtitle = null;
      if (stage3EntryStampRevealTimerId != null) {
        window.clearTimeout(stage3EntryStampRevealTimerId);
        stage3EntryStampRevealTimerId = null;
      }
      stage3LightingRestore = {
        toneMappingExposure: renderer.toneMappingExposure,
        environmentIntensity: scene.environmentIntensity,
        renderer,
      };
      renderer.toneMappingExposure += STAGE3_TONE_MAPPING_EXPOSURE_DELTA;
      scene.environmentIntensity += STAGE3_ENVIRONMENT_INTENSITY_DELTA;

      const canvas = renderer.domElement;
      sceneRef = scene;
      canvasRef = canvas;

      character = createCharacterController({
        scene,
        glbLoader,
        config,
        getKeys: () => keyboard.keys,
      });

      this.camera = new THREE.PerspectiveCamera(
        config.camera.fov,
        window.innerWidth / window.innerHeight,
        config.camera.near,
        config.camera.far,
      );
      this.camera.position.set(
        config.camera.position.x,
        config.camera.position.y,
        config.camera.position.z,
      );
      if (config.camera.lookAt) {
        this.camera.lookAt(
          config.camera.lookAt.x,
          config.camera.lookAt.y,
          config.camera.lookAt.z,
        );
      } else {
        this.camera.lookAt(0, 0, 0);
      }

      skyBackgroundTexture = createSkyGradientTexture(
        config.background.gradient,
      );
      scene.background = skyBackgroundTexture;

      keyboard.mount();
      window.addEventListener("keydown", handleStageKeyDown, { capture: true });
      canvas.addEventListener("pointerdown", handlePointerDown, {
        capture: true,
      });
      canvas.addEventListener("pointermove", handlePointerMove);
      canvas.addEventListener("pointerleave", handlePointerLeave);

      window.addEventListener(
        NOTICE_MODAL_USER_CLOSED_EVENT,
        handleNoticeModalClosedForEggSubtitle,
      );
      unlistenGumCardsForEggSubtitle = onGumCardsModalClose(() => {
        flushPendingEggDiscoverySubtitle();
      });

      debugControls = createStageDebugControls({
        scene,
        camera: this.camera,
        domElement: canvas,
        getPropRoots: () => [],
        getPropPath: () => "",
        options: {
          stageName: "stage3",
          getInitialCameraConfig: () => config.camera,
          forceOrbit: true, // OrbitControls 활성화 (마우스 드래그로 회전/줌)
          manageCursor: false, // 아이스크림 카트 호버 시 pointer 커서 직접 처리
        },
      });

      // gum_server: start → 그다음 current 폴링 (예약만 있고 start 전이면 서버는 idle)
      void (async () => {
        try {
          const ok = await postMonitorStart();
          if (!ok) {
            console.warn(
              "[Stage3] monitor start 실패 — 폴링은 계속 (fallback 가능)",
            );
          }
        } catch (e) {
          console.warn("[Stage3] monitor start 예외:", e);
        }
        startMonitorPolling();
      })();

      loadStage3Background({
        scene,
        glbLoader,
        config,
        getIsActive: () => isStage3Active,
        onReady: ({ model, center, backgroundMaxY, backgroundBounds }) => {
          backgroundModel = model;
          ensureStage3UiMounted();
          updateStampSlotsFilled(0);
          if (isStage3Active) {
            playStage3IntroAudioTwice();
          }
          debugControls.setOrbitTarget(center);
          cameraRef = this.camera;
          stage3GroundY = backgroundMaxY;
          if (assignedSvgUrl) {
            loadLetterFromSvgUrl(
              scene,
              this.camera,
              backgroundMaxY,
              assignedSvgUrl,
              assignedWorryId,
              { holdFallUntilIntroTopView: true },
            );
          } else {
            // 우선순위: REST busy(1순위)를 기다리고,
            // 일정 시간 동안 busy가 없을 때만 fallback(2순위)로 최신 글자를 로드
            const stageCamera = this.camera;
            monitorFallbackTimeoutId = window.setTimeout(() => {
              if (monitorRestAssignmentReceived || assignedSvgUrl) return;
              loadLatestLetter(scene, stageCamera, backgroundMaxY, {
                holdFallUntilIntroTopView: false,
              });
            }, STAGE3_MONITOR_FALLBACK_TIMEOUT_MS);
          }

          const useStatic = config.model.useStaticObstacleColliders !== false;
          const rawColliders = useStatic
            ? collectIslandStaticColliderBoxes(model)
            : [];
          const islandStaticColliders = useStatic
            ? filterCollidersExcludingDominantTerrain(
                rawColliders,
                backgroundBounds,
              )
            : [];
          if (import.meta.env.DEV) {
            // dev-only collider diagnostics intentionally muted to reduce console noise.
          }
          character.setup(
            backgroundMaxY,
            backgroundBounds,
            islandStaticColliders,
          );

          // 섬 GLB는 backgroundLoader에서 이미 `scene.add(model)`로 들어와 있기 때문에,
          // 카메라 인트로 시작 타이밍을 뒤로 미루면 섬(특히 하단)이 회전 시작 전 잠깐 보일 수 있음.
          // 따라서 gumFollowers.init() 같은 비동기 로딩보다 먼저 카메라 인트로를 활성화한다.
          if (isStage3Active) {
            startCameraIntro(center, backgroundBounds);
          }

          registerIslandInteractions(model);
          portalVortexMaterial = applyPortalVortexToModel(model);

          gumFollowers = createGumFollowersController({
            scene,
            glbLoader,
            config,
            getUserState: () => ({
              position: character?.getPosition?.() ?? null,
              yaw: character?.getYaw?.() ?? null,
              moving: character?.getIsMoving?.() ?? false,
            }),
          });

          void gumFollowers
            .init({
              backgroundMaxY,
              isCancelled: () => !isStage3Active || gumCancelled,
              staticColliderBoxes: islandStaticColliders,
            })
            .catch((e) => {
              if (import.meta.env.DEV) {
                console.warn("[Stage3] 껌딱지 모델 로드 실패:", e);
              }
              gumFollowers?.cleanup?.();
              gumFollowers = null;
            });
          void preloadIceCreamTemplates().catch((e) => {
            if (import.meta.env.DEV) {
              console.warn("[Stage3] 아이스크림 preload 오류:", e ?? "");
            }
          });
        },
      });

      if (import.meta.env.DEV) {
        // dev-only setup diagnostics intentionally muted to reduce console noise.
      }
    },

    update(delta) {
      if (debugControls) debugControls.update(delta);
      if (portalVortexMaterial) {
        portalVortexMaterial.uniforms.uTime.value += delta;
      }
      updateCameraIntro(delta);
      updateLetter(delta, this.camera);
      updateFragments(delta);
      updateStandaloneFlowers(delta);
      updateSpawnedIceCreams(delta);
      let cameraYawAssistRad = 0;
      if (
        cameraRef &&
        character &&
        cameraIntro.completed &&
        !cameraIntro.active
      ) {
        const charPos = character.getPosition?.();
        if (charPos) {
          cameraYawAssistRad = updateStage3CameraYawAssist(
            delta,
            cameraRef,
            charPos,
            character.getIsMoving?.() ?? false,
          );
        }
      }
      if (character) {
        character.update(delta, this.camera, {
          skipCameraFollow: cameraIntro.active || !cameraIntro.completed,
          cameraYawAssistRad,
        });
      }
      updateStreetLightProximitySound();
      updateClockProximitySound();
      if (gumFollowers) {
        gumFollowers.update(delta);
      }

      const nowSec = globalThis.performance.now() / 1000;
      if (cameraRef && nowSec < cameraShakeEndTime) {
        const w = (cameraShakeEndTime - nowSec) / 0.5;
        const a = 0.14 * w;
        cameraRef.position.x += (Math.random() - 0.5) * a;
        cameraRef.position.y += (Math.random() - 0.5) * a * 0.55;
        cameraRef.position.z += (Math.random() - 0.5) * a;
      }

      if (cameraRef && canvasRef) {
        const charPos = character?.getPosition?.();
        const nearLetter =
          Boolean(
            letterState?.landed &&
            charPos &&
            letterState.group.position.distanceTo(charPos) <=
              WORRY_ENTER_HINT_DIST,
          ) && !textDestroyed;
        const gumBubbleAnchorOk = Boolean(
          gumFollowers?.getPrimaryFollowerBubbleAnchorWorld?.(_projWorry),
        );
        if (userWorryEnterBubbleEl) {
          if (nearLetter && gumBubbleAnchorOk) {
            if (userWorryEnterBubblePhase === "off") {
              userWorryEnterBubblePhase = "show";
              userWorryEnterBubbleT = STAGE3_USER_ENTER_BUBBLE_SHOW_SEC;
            }
            userWorryEnterBubbleT -= delta;
            if (userWorryEnterBubbleT <= 0) {
              if (userWorryEnterBubblePhase === "show") {
                userWorryEnterBubblePhase = "gap";
                userWorryEnterBubbleT = STAGE3_USER_ENTER_BUBBLE_GAP_SEC;
              } else {
                userWorryEnterBubblePhase = "show";
                userWorryEnterBubbleT = STAGE3_USER_ENTER_BUBBLE_SHOW_SEC;
              }
            }
            const bubbleVisible = userWorryEnterBubblePhase === "show";
            if (bubbleVisible) {
              cameraRef.updateMatrixWorld(true);
              _projWorry.project(cameraRef);
              const rect = canvasRef.getBoundingClientRect();
              const x = (_projWorry.x * 0.5 + 0.5) * rect.width + rect.left;
              const y = (-_projWorry.y * 0.5 + 0.5) * rect.height + rect.top;
              userWorryEnterBubbleEl.style.left = `${x}px`;
              userWorryEnterBubbleEl.style.top = `${y}px`;
              userWorryEnterBubbleEl.classList.add("is-visible");
            } else {
              userWorryEnterBubbleEl.classList.remove("is-visible");
            }
          } else {
            userWorryEnterBubblePhase = "off";
            userWorryEnterBubbleT = 0;
            userWorryEnterBubbleEl.classList.remove("is-visible");
          }
        }
      }
    },

    cleanup(scene) {
      isStage3Active = false;
      gumCancelled = true;
      pendingEggDiscoverySubtitle = null;
      if (stage3EntryStampRevealTimerId != null) {
        window.clearTimeout(stage3EntryStampRevealTimerId);
        stage3EntryStampRevealTimerId = null;
      }
      window.removeEventListener(
        NOTICE_MODAL_USER_CLOSED_EVENT,
        handleNoticeModalClosedForEggSubtitle,
      );
      if (unlistenGumCardsForEggSubtitle) {
        unlistenGumCardsForEggSubtitle();
        unlistenGumCardsForEggSubtitle = null;
      }
      disposeStage3Ui();
      cameraIntro.active = false;
      cameraIntro.transitioning = false;
      cameraIntro.completed = false;
      cameraIntro.introTopViewCommitted = false;
      smoothedCameraYawAssist = 0;
      smoothedCameraYawAssistDemand = 0;
      cameraAssistTargets.length = 0;
      keyboard.unmount();
      window.removeEventListener("keydown", handleStageKeyDown, {
        capture: true,
      });

      if (character) {
        character.cleanup();
        character = null;
      }
      if (gumFollowers) {
        gumFollowers.cleanup();
        gumFollowers = null;
      }
      if (canvasRef) {
        if (_pointerMoveRafId !== 0) {
          cancelAnimationFrame(_pointerMoveRafId);
          _pointerMoveRafId = 0;
        }
        canvasRef.removeEventListener("pointerdown", handlePointerDown, {
          capture: true,
        });
        canvasRef.removeEventListener("pointermove", handlePointerMove);
        canvasRef.removeEventListener("pointerleave", handlePointerLeave);
        canvasRef.style.cursor = "default";
        canvasRef = null;
      }
      window.dispatchEvent(new CustomEvent("gum:closeNoticeModal"));
      closeMinigame({
        camera: cameraRef ?? this.camera,
        orbitControls: debugControls?.getOrbitControls?.() ?? null,
      });
      cameraRef = null;
      dispatchMinigameClose();
      dispatchGumCardsModalClose();
      intRaycastMeshes.length = 0;
      streetLightWorldPositions.length = 0;
      wasNearStreetLight = false;
      lastStreetLightSoundAtMs = 0;
      clockWorldPositions.length = 0;
      wasNearClock = false;
      lastClockSoundAtMs = 0;
      if (unlistenMinigameClose) {
        unlistenMinigameClose();
        unlistenMinigameClose = null;
      }
      gameMachineRef = null;
      disposeNoticePaperAudio();
      disposeStreetLightSound();
      disposePortalTransitionSound();
      if (gameMachineClickAudio) {
        gameMachineClickAudio.pause();
        gameMachineClickAudio.src = "";
        gameMachineClickAudio = null;
      }

      spawnedIceCreams.forEach((s) => {
        if (s.body && s.landSoundHandler) {
          s.body.removeEventListener("collide", s.landSoundHandler);
          s.landSoundHandler = undefined;
        }
        if (iceCreamPhysicsWorld && s.body) {
          iceCreamPhysicsWorld.removeBody(s.body);
        }
        scene.remove(s.group);
        s.group.traverse((child) => {
          if (child.isMesh) {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
              const m = child.material;
              if (Array.isArray(m)) m.forEach((x) => x.dispose());
              else m.dispose();
            }
          }
        });
      });
      spawnedIceCreams.length = 0;
      if (iceCreamPhysicsWorld && iceCreamGroundBody) {
        iceCreamPhysicsWorld.removeBody(iceCreamGroundBody);
        iceCreamGroundBody = null;
      }
      iceCreamPhysicsWorld = null;
      iceCreamCartRef = null;
      disposeIceCreamTemplates();

      if (monitorFallbackTimeoutId) {
        window.clearTimeout(monitorFallbackTimeoutId);
        monitorFallbackTimeoutId = null;
      }

      stopMonitorPolling();

      if (debugControls) {
        debugControls.dispose();
        debugControls = null;
      }

      removeAllLetterGroupsFromScene(scene);
      standaloneFlowers.forEach((s) => disposeStandaloneFlowerGroup(s.group));
      standaloneFlowers.length = 0;
      fragments.forEach((f) => releaseFragment(f));
      fragments.length = 0;
      fragmentPool.forEach((slot) => {
        if (slot.group.geometry) slot.group.geometry.dispose();
        if (slot.group.material) slot.group.material.dispose();
      });
      fragmentPool.length = 0;

      objects.forEach((obj) => {
        scene.remove(obj);
        obj.traverse((child) => {
          if (child.isMesh) {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
              if (Array.isArray(child.material)) {
                child.material.forEach((m) => m.dispose());
              } else {
                child.material.dispose();
              }
            }
          }
        });
      });
      objects.length = 0;

      if (backgroundModel) {
        scene.remove(backgroundModel);
        portalVortexMaterial = null;
        backgroundModel.traverse((child) => {
          if (!child.isMesh && !child.isPoints) return;
          if (child.geometry) child.geometry.dispose();
          if (child.material) {
            if (Array.isArray(child.material)) {
              child.material.forEach((m) => m.dispose());
            } else {
              child.material.dispose();
            }
          }
        });
        backgroundModel = null;
      }

      if (skyBackgroundTexture) {
        skyBackgroundTexture.dispose();
        skyBackgroundTexture = null;
      }
      scene.background = null;

      if (stage3LightingRestore) {
        const {
          renderer: r,
          toneMappingExposure,
          environmentIntensity,
        } = stage3LightingRestore;
        r.toneMappingExposure = toneMappingExposure;
        scene.environmentIntensity = environmentIntensity;
        stage3LightingRestore = null;
      }

      if (import.meta.env.DEV) {
        // dev-only cleanup diagnostics intentionally muted to reduce console noise.
      }
    },
  };
}
