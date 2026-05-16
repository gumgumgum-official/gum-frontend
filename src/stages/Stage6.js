/**
 * Stage6: 헤어짐 (공항 배경, 배웅)
 * @returns {import("../types.js").StageInstance}
 */
import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { getGLBLoader } from "../utils/common/assetLoaders.js";
import { createKeyboardInput } from "../utils/common/keyboardInput.js";
import {
  loadGltfTemplateCached,
  resolvePublicAssetUrl,
} from "../utils/common/gltfTemplateCache.js";
import { createCharacterController } from "../utils/stages/stage3/characterController.js";
import { STAGE6_CONFIG } from "../config/stages/stage6/stage6.js";
import {
  STAGE6_AIRPORT_ANNOUNCEMENT_SUBTITLE_CUES,
  STAGE6_AIRPORT_ANNOUNCEMENT_SUBTITLE_LEAD_SEC,
} from "../config/stages/stage6/stage6AirportAnnouncement.js";
import {
  AIRPORT_CHIME_HIDE_EVENT,
  AIRPORT_CHIME_SHOW_EVENT,
  AIRPORT_SUBTITLE_HIDE_EVENT,
  AIRPORT_SUBTITLE_SHOW_EVENT,
  AIRPORT_SUBTITLE_UPDATE_EVENT,
  STAGE6_BOARDING_RESET_EVENT,
  STAGE6_FINISH_EVENT,
  STAGE6_INT_CLICK_EVENT,
  STAGE6_INTERACTION_LOCK_EVENT,
  STAGE6_INTERACTION_UNLOCK_EVENT,
  STAGE6_NAME_MODAL_SHOW_EVENT,
  STAGE6_POSTER_MODAL_HIDE_EVENT,
  STAGE6_POSTER_MODAL_SHOW_EVENT,
  STAGE6_SUBTITLE_SEQUENCE_EVENT,
} from "../events/stage6Events.js";
import { isElectronLikeUserAgent } from "../utils/common/envUtils.js";
import {
  createBagPhysics,
  BAG_OBJECT_NAME,
} from "../utils/stages/stage6/bagPhysics.js";
const INT_PREFIX = "INT_";
const CHAR_ROOT_NAMES = [
  "INT_Gum_Cry",
  "INT_Gum_Heart",
  "INT_Gum_Camera",
  "INT_Gum_Airplane",
  "INT_Gum_Lollipop",
];
/** 각 캐릭터 hover 시 말풍선에 표시할 텍스트 */
const CHAR_SPEECH_MAP = {
  INT_Gum_Cry: "가지마..나랑 더 놀자...🥺",
  INT_Gum_Heart: "이거 내 진심인데 받아줄래?💕",
  INT_Gum_Camera: "찰칵! 📸",
  INT_Gum_Airplane: "아~더 놀고싶어!나랑 더 놀자~~✈️",
  INT_Gum_Lollipop: "같이..먹을래..?🍭",
};
const CHAR_BUBBLE_VISIBLE_SEC = 2.5;
const CHAR_BUBBLE_OFFSET_Y = 0.92;
const CHAR_ANIM_MAP = {
  INT_Gum_Cry: [],
  INT_Gum_Heart: ["Heart_Offer_Rig", "Heart_Offer_Prop"],
  INT_Gum_Camera: [
    "Shutter_EyeDefL",
    "Shutter_EyeZZL",
    "Shutter_PropCam",
    "Shutter_Flash",
  ],
  INT_Gum_Airplane: ["Plane_Throw_Rig", "Plane_Throw_Prop"],
  INT_Gum_Lollipop: ["Lollipop_ArmShake_Rig", "Lollipop_Shake"],
};
const EXTRA_CLICKABLE_OBJECT_NAMES = new Set(["OBJ_ATM", "OBJ_Tel"]);
const ATM_OBJECT_NAME = "OBJ_ATM";
const TEL_OBJECT_NAME = "OBJ_Tel";
const TEL_EMISSIVE_DARK_STRENGTH = 0.06;
const TEL_EMISSIVE_BRIGHT_STRENGTH = 1.25;
const TEL_EMISSIVE_TWEEN_SPEED = 3.5;
const PHONE_RING_SOUND_PATH = "/static/sounds/airport/phone_ring.mp3";
const PHONE_RING_SOUND_VOLUME = 0.42;
const PHONE_HANGUP_SOUND_PATH = "/static/sounds/airport/phone_hangup.mp3";
const PHONE_HANGUP_SOUND_VOLUME = 0.49;
const PHONE_CALL_SOUNDS = [
  "/static/sounds/airport/phone_love.mp3",
  "/static/sounds/airport/phone_prank.mp3",
];
const PHONE_CALL_RING_SUBTITLES = [
  "당신을 사랑하는 익명의 껌딱지에게 전화가 왔네요!",
  "어! 또 다시 전화가 온 것 같아요! 한번 받아볼까요?",
];
const PHONE_CALL_SOUND_VOLUME = 0.49;
const TEL_ACTIVATE_DELAY_AFTER_ANNOUNCEMENT_MS = 5000;
const TEL_RING_AGAIN_DELAY_MS = 10000;
const TEL_ATM_TRIGGER_DELAY_AFTER_LAST_CALL_MS = 5000;
const ATM_INTERACTION_REQUIRED_COUNT = 3;
const ATM_EMISSIVE_DARK_STRENGTH = 0.06;
const ATM_EMISSIVE_BRIGHT_STRENGTH = 1.25;
const ATM_EMISSIVE_TWEEN_SPEED = 3.5;
const _down = new THREE.Vector3(0, -1, 0);
const _floorRayOrigin = new THREE.Vector3();
const _escWorld = new THREE.Vector3();
const _toCam = new THREE.Vector3();

/**
 * @param {THREE.Object3D} obj
 * @returns {obj is THREE.Mesh}
 */
function isMeshObject3D(obj) {
  return "isMesh" in obj && obj.isMesh === true;
}

function normalizeAnimToken(name) {
  return String(name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * GLB 교체 시 clip 명의 구분자/대소문자가 바뀌어도 최대한 안전하게 매칭한다.
 * @param {THREE.AnimationClip[]} animations
 * @param {string} clipName
 */
function findAnimationClipLoose(animations, clipName) {
  const exact = THREE.AnimationClip.findByName(animations, clipName);
  if (exact) return exact;
  const needle = normalizeAnimToken(clipName);
  return (
    animations.find((clip) => normalizeAnimToken(clip?.name) === needle) ??
    animations.find((clip) =>
      normalizeAnimToken(clip?.name).includes(needle),
    ) ??
    null
  );
}

/** @param {THREE.Object3D} root */
function collectMeshesDeep(root) {
  /** @type {THREE.Mesh[]} */
  const meshes = [];
  root.traverse((o) => {
    if (isMeshObject3D(o)) meshes.push(o);
  });
  return meshes;
}

/**
 * 천장보다 아래에서 쏴야 첫 히트가 바닥이 된다.
 * @param {THREE.Mesh[]} meshes
 * @param {number} x
 * @param {number} z
 * @param {THREE.Raycaster} rc
 * @param {number} rayStartY
 */
function raycastFloorY(meshes, x, z, rc, rayStartY) {
  _floorRayOrigin.set(x, rayStartY, z);
  rc.set(_floorRayOrigin, _down);
  const hits = rc.intersectObjects(meshes, false);
  return hits.length > 0 ? hits[0].point.y : null;
}

/**
 * Stage6 공항 씬에서 OBJ_/INT_ 서브트리 메쉬를 정적 충돌 AABB로 수집한다.
 * @param {THREE.Object3D} root
 * @returns {Array<{ minX: number, maxX: number, minZ: number, maxZ: number, minY: number, maxY: number }>}
 */
function collectStage6StaticColliderBoxes(root) {
  /** @type {Array<{ minX: number, maxX: number, minZ: number, maxZ: number, minY: number, maxY: number }>} */
  const out = [];
  const tmp = new THREE.Box3();
  root.updateMatrixWorld(true);
  root.traverse((obj) => {
    if (!isMeshObject3D(obj)) return;
    /** @type {THREE.Object3D | null} */
    let p = obj;
    let underColliderRoot = false;
    while (p) {
      if (
        typeof p.name === "string" &&
        (p.name.startsWith("OBJ_") || p.name.startsWith("INT_"))
      ) {
        underColliderRoot = true;
        break;
      }
      p = p.parent;
    }
    if (!underColliderRoot) return;
    tmp.setFromObject(obj);
    if (tmp.isEmpty()) return;
    out.push({
      minX: tmp.min.x,
      maxX: tmp.max.x,
      minZ: tmp.min.z,
      maxZ: tmp.max.z,
      minY: tmp.min.y,
      maxY: tmp.max.y,
    });
  });
  return out;
}

export function Stage6() {
  const objects = [];
  /** @type {import("../types.js").Stage6Config} */
  const config = STAGE6_CONFIG;
  const airportSubtitleLeadSec =
    Number(STAGE6_AIRPORT_ANNOUNCEMENT_SUBTITLE_LEAD_SEC ?? 0.75) || 0;
  const airportAnnouncementSubtitleCues = Array.isArray(
    STAGE6_AIRPORT_ANNOUNCEMENT_SUBTITLE_CUES,
  )
    ? STAGE6_AIRPORT_ANNOUNCEMENT_SUBTITLE_CUES
    : [];
  const glbLoader = getGLBLoader();
  const fbxLoader = new FBXLoader();
  const isElectronLike = isElectronLikeUserAgent();
  const stage6ModelUrl = resolvePublicAssetUrl(config.model.path);
  // Stage6 진입 직전에 디코더/파서를 워밍업해서 첫 표시 지연을 줄인다.
  void loadGltfTemplateCached(stage6ModelUrl).catch(() => {});
  let isStage6Active = true;
  const intRaycastMeshes = [];
  const pointer = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();
  let canvasRef = null;
  let cameraRef = null;
  let onPointerDown = null;
  let onPointerMove = null;
  let onInteractionLock = null;
  let onInteractionUnlock = null;
  const interactedTargets = new Set();
  /** @type {string | null} */
  let hoveredCharacterName = null;
  let isAtmActivated = false;
  /** @type {THREE.Object3D | null} */
  let atmRootRef = null;
  let isTelActivated = false;
  let isTelRinging = false;
  let telEmissiveProgress = 0;
  let telEmissiveTarget = 0;
  let telCallIndex = 0;
  let telActivateTimeoutId = 0;
  let telRingAgainTimeoutId = 0;
  /** @type {THREE.Object3D | null} */
  let telRootRef = null;
  /** @type {Array<THREE.Material & { emissive?: THREE.Color, emissiveIntensity?: number, userData?: Record<string, any> }>} */
  const atmEmissiveMaterials = [];
  let atmEmissiveProgress = 0;
  let atmEmissiveTarget = 0;
  /** @type {Array<THREE.Material & { emissive?: THREE.Color, emissiveIntensity?: number, userData?: Record<string, any> }>} */
  const telEmissiveMaterials = [];
  let isSceneInteractionLocked = false;
  let isFinishFired = false;
  let airplaneCallSignTimeoutId = 0;
  let airportAnnounceIntroTimeoutId = 0;
  /** @type {HTMLAudioElement | null} */
  let airplaneCallSignAudio = null;
  /** @type {HTMLAudioElement | null} */
  let airportAnnounceIntroAudio = null;
  /** @type {HTMLAudioElement | null} */
  let photoboothCurtainAudio = null;
  /** @type {HTMLAudioElement | null} */
  let atmClickAudio = null;
  /** @type {HTMLAudioElement | null} */
  let phoneRingAudio = null;
  /** @type {HTMLAudioElement | null} */
  let phoneHangupAudio = null;
  /** @type {HTMLAudioElement | null} */
  let phoneCallAudio = null;
  let isAirportChimeVisible = false;

  const bagPhysics = createBagPhysics();

  function isLoadingOverlayVisible() {
    const loadingOverlay = document.getElementById("loading-overlay");
    if (!loadingOverlay) return false;
    const style = window.getComputedStyle(loadingOverlay);
    return style.display !== "none" && style.visibility !== "hidden";
  }

  /** @type {{ toneMappingExposure: number, renderer: THREE.WebGLRenderer } | null} */
  let stage6ExposureRestore = null;

  /** Stage3 포탈 전환 직후 안내·자막이 바로 이어지도록 진입 무음 구간 최소화 */
  const AIRPLANE_CALL_SIGN_DELAY_MS = 420;
  const AIRPLANE_CALL_SIGN_VOLUME = 0.55;
  /** 칠 사인 오디오 재생 후 chime 아이콘을 표시하기 시작할 시간(초) */
  const CHIME_INDICATOR_TRIGGER_TIME_SEC = 0.58;
  const AIRPORT_ANNOUNCE_INTRO_DELAY_AFTER_CALL_SIGN_MS = 100;
  const AIRPORT_ANNOUNCE_INTRO_VOLUME = 0.55;
  /** `INT_Photobooth` 클릭 시 (normalize → `photobooth`) */
  const PHOTOBOOTH_CURTAIN_SOUND_PATH = "/static/sounds/airport/curtain.mp3";
  const PHOTOBOOTH_CURTAIN_SOUND_VOLUME = 0.55;
  /** `OBJ_ATM` 클릭 시 */
  const ATM_CLICK_SOUND_PATH = "/static/sounds/click.mp3";
  const ATM_CLICK_SOUND_VOLUME = 0.5;
  let activeSubtitleCueIndex = -1;
  let isAirportSubtitleVisible = false;
  const keyboard = createKeyboardInput([
    "ArrowUp",
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
    "w",
    "W",
    "a",
    "A",
    "s",
    "S",
    "d",
    "D",
    "KeyW",
    "KeyA",
    "KeyS",
    "KeyD",
  ]);
  /** @type {ReturnType<typeof createCharacterController> | null} */
  let character = null;
  /** @type {THREE.AnimationMixer | null} */
  let charMixer = null;
  /** @type {Record<string, THREE.AnimationAction[]>} */
  const charActions = {};
  /** @type {Record<string, THREE.Object3D | null>} */
  const charRoots = {};
  /** THREE.js scene에서 remove만 하고 dispose하지 않을 캐시된 gltf.scene */
  let gltfSceneRef = null;

  // 말풍선 상태
  /** @type {HTMLDivElement | null} */
  let charBubbleEl = null;
  /** @type {string | null} 현재 말풍선이 표시 중인 캐릭터 이름 */
  let charBubbleActiveChar = null;
  let charBubbleRemaining = 0;
  const _charBubbleBox = new THREE.Box3();
  const _charBubbleSize = new THREE.Vector3();
  const _charBubbleProjected = new THREE.Vector3();

  // Tel 말풍선 상태 (int-click 스타일)
  /** @type {HTMLDivElement | null} */
  let telBubbleEl = null;
  const _telBubbleBox = new THREE.Box3();
  const _telBubbleSize = new THREE.Vector3();
  const _telBubbleProjected = new THREE.Vector3();

  function dispatchAirportSubtitleTextByTime(currentSec) {
    const syncedSec = Math.max(0, currentSec + airportSubtitleLeadSec);
    const nextIdx = airportAnnouncementSubtitleCues.findIndex(
      (cue) => syncedSec >= cue.startSec && syncedSec < cue.endSec,
    );
    if (nextIdx < 0) {
      activeSubtitleCueIndex = -1;
      if (isAirportSubtitleVisible) {
        window.dispatchEvent(new CustomEvent(AIRPORT_SUBTITLE_HIDE_EVENT));
        isAirportSubtitleVisible = false;
      }
      return;
    }

    if (nextIdx === activeSubtitleCueIndex && isAirportSubtitleVisible) return;
    activeSubtitleCueIndex = nextIdx;
    const text = airportAnnouncementSubtitleCues[nextIdx].text;
    if (!isAirportSubtitleVisible) {
      window.dispatchEvent(
        new CustomEvent(AIRPORT_SUBTITLE_SHOW_EVENT, { detail: { text } }),
      );
      isAirportSubtitleVisible = true;
      return;
    }
    window.dispatchEvent(
      new CustomEvent(AIRPORT_SUBTITLE_UPDATE_EVENT, { detail: { text } }),
    );
  }

  function cancelAirplaneCallSignScheduled() {
    if (airplaneCallSignTimeoutId) {
      window.clearTimeout(airplaneCallSignTimeoutId);
      airplaneCallSignTimeoutId = 0;
    }
    if (airportAnnounceIntroTimeoutId) {
      window.clearTimeout(airportAnnounceIntroTimeoutId);
      airportAnnounceIntroTimeoutId = 0;
    }
    if (telActivateTimeoutId) {
      window.clearTimeout(telActivateTimeoutId);
      telActivateTimeoutId = 0;
    }
    if (airplaneCallSignAudio) {
      airplaneCallSignAudio.onplay = null;
      airplaneCallSignAudio.ontimeupdate = null;
      airplaneCallSignAudio.onended = null;
      airplaneCallSignAudio.pause();
      airplaneCallSignAudio.currentTime = 0;
      airplaneCallSignAudio.src = "";
      airplaneCallSignAudio = null;
    }
    if (isAirportChimeVisible) {
      window.dispatchEvent(new CustomEvent(AIRPORT_CHIME_HIDE_EVENT));
      isAirportChimeVisible = false;
    }
    if (airportAnnounceIntroAudio) {
      airportAnnounceIntroAudio.onplay = null;
      airportAnnounceIntroAudio.ontimeupdate = null;
      airportAnnounceIntroAudio.onended = null;
      airportAnnounceIntroAudio.pause();
      airportAnnounceIntroAudio.currentTime = 0;
      airportAnnounceIntroAudio.src = "";
      airportAnnounceIntroAudio = null;
    }
    activeSubtitleCueIndex = -1;
    isAirportSubtitleVisible = false;
    window.dispatchEvent(new CustomEvent(AIRPORT_SUBTITLE_HIDE_EVENT));
  }

  function playAirportAnnounceIntro() {
    if (!airportAnnounceIntroAudio) {
      airportAnnounceIntroAudio = new window.Audio();
      airportAnnounceIntroAudio.preload = "auto";
      airportAnnounceIntroAudio.src = resolvePublicAssetUrl(
        "/static/sounds/airport/airport_announce_intro.mp3",
      );
    }
    airportAnnounceIntroAudio.volume = AIRPORT_ANNOUNCE_INTRO_VOLUME;
    airportAnnounceIntroAudio.currentTime = 0;

    // Autoplay may be silently blocked (Promise stays pending forever on SPA nav).
    // Use this flag to fire the fallback exactly once whether catch() or watchdog fires.
    let announceFallbackFired = false;
    const runAnnounceFallback = () => {
      if (announceFallbackFired || !isStage6Active) return;
      announceFallbackFired = true;
      isSceneInteractionLocked = false;
      const cues = STAGE6_AIRPORT_ANNOUNCEMENT_SUBTITLE_CUES ?? [];
      let cueIdx = 0;
      const showNextCue = () => {
        if (!isStage6Active || cueIdx >= cues.length) {
          window.dispatchEvent(new CustomEvent(AIRPORT_SUBTITLE_HIDE_EVENT));
          telActivateTimeoutId = window.setTimeout(() => {
            telActivateTimeoutId = 0;
            activateTelRinging();
          }, TEL_ACTIVATE_DELAY_AFTER_ANNOUNCEMENT_MS);
          return;
        }
        const cue = cues[cueIdx];
        cueIdx++;
        window.dispatchEvent(
          new CustomEvent(AIRPORT_SUBTITLE_SHOW_EVENT, {
            detail: { text: cue.text },
          }),
        );
        const holdMs =
          cueIdx < cues.length
            ? (cues[cueIdx].startSec - cue.startSec) * 1000
            : 2500;
        window.setTimeout(showNextCue, Math.max(holdMs, 400));
      };
      showNextCue();
    };

    airportAnnounceIntroAudio.onplay = () => {
      announceFallbackFired = true; // audio is actually playing, suppress watchdog
      activeSubtitleCueIndex = -1;
      isAirportSubtitleVisible = false;
      dispatchAirportSubtitleTextByTime(0);
    };
    airportAnnounceIntroAudio.ontimeupdate = () => {
      dispatchAirportSubtitleTextByTime(
        Number(airportAnnounceIntroAudio?.currentTime ?? 0),
      );
    };
    airportAnnounceIntroAudio.onended = () => {
      activeSubtitleCueIndex = -1;
      isAirportSubtitleVisible = false;
      window.dispatchEvent(new CustomEvent(AIRPORT_SUBTITLE_HIDE_EVENT));
      isSceneInteractionLocked = false;
      telActivateTimeoutId = window.setTimeout(() => {
        telActivateTimeoutId = 0;
        activateTelRinging();
      }, TEL_ACTIVATE_DELAY_AFTER_ANNOUNCEMENT_MS);
    };
    const announcePlayPromise = airportAnnounceIntroAudio.play();
    if (
      announcePlayPromise &&
      typeof announcePlayPromise.catch === "function"
    ) {
      announcePlayPromise.catch(runAnnounceFallback);
    }
    // Watchdog: covers the case where play() returns a pending-forever Promise
    window.setTimeout(runAnnounceFallback, 2500);
  }

  function playAtmClickSound() {
    const src = resolvePublicAssetUrl(ATM_CLICK_SOUND_PATH);
    if (!atmClickAudio) {
      atmClickAudio = new window.Audio();
      atmClickAudio.preload = "auto";
    }
    atmClickAudio.volume = ATM_CLICK_SOUND_VOLUME;
    atmClickAudio.pause();
    atmClickAudio.currentTime = 0;
    atmClickAudio.src = src;
    try {
      atmClickAudio.load();
    } catch {
      // ignore
    }
    const p = atmClickAudio.play();
    if (p && typeof p.catch === "function") {
      p.catch(() => {});
    }
  }

  function playPhotoboothCurtainSound() {
    const src = resolvePublicAssetUrl(PHOTOBOOTH_CURTAIN_SOUND_PATH);
    if (!photoboothCurtainAudio) {
      photoboothCurtainAudio = new window.Audio();
      photoboothCurtainAudio.preload = "auto";
    }
    photoboothCurtainAudio.volume = PHOTOBOOTH_CURTAIN_SOUND_VOLUME;
    photoboothCurtainAudio.pause();
    photoboothCurtainAudio.currentTime = 0;
    photoboothCurtainAudio.src = src;
    try {
      photoboothCurtainAudio.load();
    } catch {
      // ignore
    }
    const p = photoboothCurtainAudio.play();
    if (p && typeof p.catch === "function") {
      p.catch(() => {});
    }
  }

  function playAirplaneCallSignOnce(onStarted) {
    if (!airplaneCallSignAudio) {
      airplaneCallSignAudio = new window.Audio();
      airplaneCallSignAudio.preload = "auto";
      airplaneCallSignAudio.src = resolvePublicAssetUrl(
        "/static/sounds/airport/airplane_call_sign.mp3",
      );
    }
    if (airplaneCallSignTimeoutId) {
      window.clearTimeout(airplaneCallSignTimeoutId);
      airplaneCallSignTimeoutId = 0;
    }
    isAirportChimeVisible = false;
    airplaneCallSignAudio.onplay = () => {
      window.dispatchEvent(new CustomEvent(AIRPORT_CHIME_SHOW_EVENT));
      isAirportChimeVisible = true;
      if (airplaneCallSignTimeoutId) {
        window.clearTimeout(airplaneCallSignTimeoutId);
        airplaneCallSignTimeoutId = 0;
      }
      airplaneCallSignTimeoutId = window.setTimeout(() => {
        airplaneCallSignTimeoutId = 0;
        onStarted?.();
      }, 1000);
    };
    airplaneCallSignAudio.ontimeupdate = null;
    airplaneCallSignAudio.onended = () => {
      if (isAirportChimeVisible) {
        window.dispatchEvent(new CustomEvent(AIRPORT_CHIME_HIDE_EVENT));
        isAirportChimeVisible = false;
      }
    };
    airplaneCallSignAudio.volume = AIRPLANE_CALL_SIGN_VOLUME;
    airplaneCallSignAudio.currentTime = 0;
    airplaneCallSignAudio.play().catch(() => {
      if (isAirportChimeVisible) {
        window.dispatchEvent(new CustomEvent(AIRPORT_CHIME_HIDE_EVENT));
        isAirportChimeVisible = false;
      }
      onStarted?.();
    });
  }

  function scheduleAirplaneCallSign() {
    cancelAirplaneCallSignScheduled();
    airplaneCallSignTimeoutId = window.setTimeout(() => {
      airplaneCallSignTimeoutId = 0;
      if (!airplaneCallSignAudio) {
        airplaneCallSignAudio = new window.Audio();
        airplaneCallSignAudio.preload = "auto";
        airplaneCallSignAudio.src = resolvePublicAssetUrl(
          "/static/sounds/airport/airplane_call_sign.mp3",
        );
      }
      airplaneCallSignAudio.volume = AIRPLANE_CALL_SIGN_VOLUME;
      airplaneCallSignAudio.currentTime = 0;
      isAirportChimeVisible = false;

      if (!isStage6Active) return;

      // Watchdog: if ding audio never plays (Promise pending), skip to announcement
      let chimeFallbackFired = false;
      const runChimeFallback = () => {
        if (chimeFallbackFired || !isStage6Active) return;
        chimeFallbackFired = true;
        if (isAirportChimeVisible) {
          window.dispatchEvent(new CustomEvent(AIRPORT_CHIME_HIDE_EVENT));
          isAirportChimeVisible = false;
        }
        airportAnnounceIntroTimeoutId = window.setTimeout(() => {
          airportAnnounceIntroTimeoutId = 0;
          if (isStage6Active) playAirportAnnounceIntro();
        }, AIRPORT_ANNOUNCE_INTRO_DELAY_AFTER_CALL_SIGN_MS);
      };

      airplaneCallSignAudio.onplay = null;
      airplaneCallSignAudio.ontimeupdate = () => {
        chimeFallbackFired = true; // audio is playing, suppress watchdog
        if (isAirportChimeVisible) return;
        if (
          Number(airplaneCallSignAudio?.currentTime ?? 0) <
          CHIME_INDICATOR_TRIGGER_TIME_SEC
        ) {
          return;
        }
        window.dispatchEvent(new CustomEvent(AIRPORT_CHIME_SHOW_EVENT));
        isAirportChimeVisible = true;
      };
      airplaneCallSignAudio.onended = () => {
        if (isAirportChimeVisible) {
          window.dispatchEvent(new CustomEvent(AIRPORT_CHIME_HIDE_EVENT));
          isAirportChimeVisible = false;
        }
        airportAnnounceIntroTimeoutId = window.setTimeout(() => {
          airportAnnounceIntroTimeoutId = 0;
          if (isStage6Active) playAirportAnnounceIntro();
        }, AIRPORT_ANNOUNCE_INTRO_DELAY_AFTER_CALL_SIGN_MS);
      };
      const chimePlayPromise = airplaneCallSignAudio.play();
      if (chimePlayPromise && typeof chimePlayPromise.catch === "function") {
        chimePlayPromise.catch(runChimeFallback);
      }
      // Watchdog: covers pending-forever Promise (AudioContext suspended on SPA nav)
      window.setTimeout(runChimeFallback, 2500);
    }, AIRPLANE_CALL_SIGN_DELAY_MS);
  }

  const handleKeyDown = (event) => {
    if (
      isSceneInteractionLocked ||
      isLoadingOverlayVisible() ||
      isFinishFired
    ) {
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      isFinishFired = true;
      window.dispatchEvent(new CustomEvent(STAGE6_FINISH_EVENT));
    }
  };

  function createCharBubbleEl() {
    const el = document.createElement("div");
    el.className = "speech-bubble-stage2 speech-bubble-stage6-size";
    el.setAttribute("aria-hidden", "true");
    document.body.appendChild(el);
    return el;
  }

  function updateCharBubblePosition(charName) {
    if (!charBubbleEl || !canvasRef || !cameraRef) return false;
    const charRoot = charRoots[charName];
    if (!charRoot) return false;
    _charBubbleBox.setFromObject(charRoot);
    if (_charBubbleBox.isEmpty()) return false;
    _charBubbleBox.getCenter(_charBubbleProjected);
    _charBubbleBox.getSize(_charBubbleSize);
    _charBubbleProjected.y += _charBubbleSize.y * CHAR_BUBBLE_OFFSET_Y;
    _charBubbleProjected.project(cameraRef);
    const rect = canvasRef.getBoundingClientRect();
    const rw = rect.width || 1;
    const rh = rect.height || 1;
    const x = rect.left + (_charBubbleProjected.x * 0.5 + 0.5) * rw;
    const y = rect.top + (-_charBubbleProjected.y * 0.5 + 0.5) * rh;
    charBubbleEl.style.left = `${x}px`;
    charBubbleEl.style.top = `${y}px`;
    return true;
  }

  function showCharBubble(charName) {
    const text = CHAR_SPEECH_MAP[charName];
    if (!text || !charBubbleEl) return;
    if (!updateCharBubblePosition(charName)) return;
    charBubbleEl.classList.remove("is-visible");
    charBubbleEl.textContent = text;
    requestAnimationFrame(() => {
      if (charBubbleEl) charBubbleEl.classList.add("is-visible");
    });
    charBubbleActiveChar = charName;
    charBubbleRemaining = CHAR_BUBBLE_VISIBLE_SEC;
  }

  function hideCharBubble() {
    if (!charBubbleEl) return;
    charBubbleEl.classList.remove("is-visible");
    charBubbleActiveChar = null;
    charBubbleRemaining = 0;
  }

  function createTelBubbleEl() {
    const el = document.createElement("div");
    el.className =
      "speech-bubble-stage2 speech-bubble-stage3-user speech-bubble-stage3-int-click";
    el.setAttribute("aria-hidden", "true");
    document.body.appendChild(el);
    return el;
  }

  function updateTelBubblePosition() {
    if (!telBubbleEl || !canvasRef || !cameraRef || !telRootRef) return false;
    _telBubbleBox.setFromObject(telRootRef);
    if (_telBubbleBox.isEmpty()) return false;
    _telBubbleBox.getCenter(_telBubbleProjected);
    _telBubbleBox.getSize(_telBubbleSize);
    _telBubbleProjected.y += _telBubbleSize.y * 0.85;
    _telBubbleProjected.project(cameraRef);
    const rect = canvasRef.getBoundingClientRect();
    const rw = rect.width || 1;
    const rh = rect.height || 1;
    const x = rect.left + (_telBubbleProjected.x * 0.5 + 0.5) * rw;
    const y = rect.top + (-_telBubbleProjected.y * 0.5 + 0.5) * rh;
    telBubbleEl.style.left = `${x}px`;
    telBubbleEl.style.top = `${y}px`;
    return true;
  }

  function showTelBubble(text) {
    if (!telBubbleEl) return;
    if (!updateTelBubblePosition()) return;
    telBubbleEl.classList.remove("is-visible");
    telBubbleEl.textContent = text;
    requestAnimationFrame(() => {
      if (telBubbleEl) telBubbleEl.classList.add("is-visible");
    });
  }

  function hideTelBubble() {
    if (!telBubbleEl) return;
    telBubbleEl.classList.remove("is-visible");
  }

  function playCharacter(charName) {
    const actions = charActions[charName];
    if (!actions?.length) {
      showCharBubble(charName);
      return;
    }
    for (const a of actions) a.reset().play();
    showCharBubble(charName);
  }

  function setupCharAnimations(sceneRoot, animations) {
    charMixer = new THREE.AnimationMixer(sceneRoot);
    for (const charName of CHAR_ROOT_NAMES) {
      charRoots[charName] = sceneRoot.getObjectByName(charName) ?? null;
      const clipNames = CHAR_ANIM_MAP[charName] ?? [];
      charActions[charName] = [];
      for (const clipName of clipNames) {
        const clip = findAnimationClipLoose(animations, clipName);
        if (!clip) {
          console.warn(`[Stage6] anim clip not found: ${clipName}`);
          continue;
        }
        const action = charMixer.clipAction(clip);
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
        charActions[charName].push(action);
      }
    }
  }

  function normalizeIntNameToken(value) {
    return String(value ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  }

  function isAtmHitTarget(hit) {
    return (
      hit?.intName === ATM_OBJECT_NAME ||
      normalizeIntNameToken(hit?.target) ===
        normalizeIntNameToken(ATM_OBJECT_NAME)
    );
  }

  function dispatchStage6SubtitleSequence(messages) {
    window.dispatchEvent(
      new CustomEvent(STAGE6_SUBTITLE_SEQUENCE_EVENT, {
        detail: { messages },
      }),
    );
  }

  function collectAtmInteractiveRoot(rootModel) {
    atmRootRef = null;
    rootModel.traverse((obj) => {
      if (atmRootRef || obj?.name !== ATM_OBJECT_NAME) return;
      atmRootRef = obj;
    });
  }

  function registerAtmEmissiveMaterials() {
    atmEmissiveMaterials.length = 0;
    if (!atmRootRef) return;
    atmRootRef.traverse((child) => {
      const mesh = /** @type {THREE.Mesh} */ (child);
      if (!mesh?.isMesh || !mesh.material) return;
      const materials = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      materials.forEach((rawMaterial) => {
        const material = /** @type {typeof atmEmissiveMaterials[number]} */ (
          rawMaterial
        );
        if (!material?.emissive) return;
        const hasVisibleEmissive = material.emissive.getHex() !== 0x000000;
        material.userData = material.userData ?? {};
        if (!material.userData.stage6AtmBaseEmissive) {
          material.userData.stage6AtmBaseEmissive = hasVisibleEmissive
            ? material.emissive.clone()
            : new THREE.Color(0x7fd6ff);
        }
        atmEmissiveMaterials.push(material);
      });
    });
  }

  function applyAtmEmissive(progress) {
    const strength = THREE.MathUtils.lerp(
      ATM_EMISSIVE_DARK_STRENGTH,
      ATM_EMISSIVE_BRIGHT_STRENGTH,
      progress,
    );
    atmEmissiveMaterials.forEach((material) => {
      const baseColor = material.userData?.stage6AtmBaseEmissive;
      if (!baseColor || !material.emissive) return;
      material.emissive.copy(baseColor).multiplyScalar(strength);
      if (typeof material.emissiveIntensity === "number") {
        material.emissiveIntensity = 1;
      }
      material.needsUpdate = true;
    });
  }

  function collectTelInteractiveRoot(rootModel) {
    telRootRef = null;
    rootModel.traverse((obj) => {
      if (telRootRef || obj?.name !== TEL_OBJECT_NAME) return;
      telRootRef = obj;
    });
  }

  function registerTelEmissiveMaterials() {
    telEmissiveMaterials.length = 0;
    if (!telRootRef) return;
    telRootRef.traverse((child) => {
      const mesh = /** @type {THREE.Mesh} */ (child);
      if (!mesh?.isMesh || !mesh.material) return;
      const materials = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      materials.forEach((rawMaterial) => {
        const material = /** @type {typeof telEmissiveMaterials[number]} */ (
          rawMaterial
        );
        if (!material?.emissive) return;
        const hasVisibleEmissive = material.emissive.getHex() !== 0x000000;
        material.userData = material.userData ?? {};
        if (!material.userData.stage6TelBaseEmissive) {
          material.userData.stage6TelBaseEmissive = hasVisibleEmissive
            ? material.emissive.clone()
            : new THREE.Color(0x7fd6ff);
        }
        telEmissiveMaterials.push(material);
      });
    });
  }

  function applyTelEmissive(progress) {
    const strength = THREE.MathUtils.lerp(
      TEL_EMISSIVE_DARK_STRENGTH,
      TEL_EMISSIVE_BRIGHT_STRENGTH,
      progress,
    );
    telEmissiveMaterials.forEach((material) => {
      const baseColor = material.userData?.stage6TelBaseEmissive;
      if (!baseColor || !material.emissive) return;
      material.emissive.copy(baseColor).multiplyScalar(strength);
      if (typeof material.emissiveIntensity === "number") {
        material.emissiveIntensity = 1;
      }
      material.needsUpdate = true;
    });
  }

  function isTelHitTarget(hit) {
    return (
      hit?.intName === TEL_OBJECT_NAME ||
      normalizeIntNameToken(hit?.target) ===
        normalizeIntNameToken(TEL_OBJECT_NAME)
    );
  }

  function playPhoneRing() {
    if (!phoneRingAudio) {
      phoneRingAudio = new window.Audio();
      phoneRingAudio.preload = "auto";
      phoneRingAudio.loop = true;
      phoneRingAudio.src = resolvePublicAssetUrl(PHONE_RING_SOUND_PATH);
    }
    phoneRingAudio.volume = PHONE_RING_SOUND_VOLUME;
    phoneRingAudio.currentTime = 0;
    const p = phoneRingAudio.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
    isTelRinging = true;
  }

  function stopPhoneRing() {
    if (phoneRingAudio) {
      phoneRingAudio.pause();
      phoneRingAudio.currentTime = 0;
    }
    isTelRinging = false;
  }

  function activateTelRinging() {
    if (!isStage6Active) return;
    isTelActivated = true;
    telEmissiveTarget = 1;
    playPhoneRing();
    showTelBubble("click!");
    const ringSubtitle =
      PHONE_CALL_RING_SUBTITLES[telCallIndex] ?? PHONE_CALL_RING_SUBTITLES[0];
    dispatchStage6SubtitleSequence([{ text: ringSubtitle, holdMs: 3000 }]);
  }

  function startPhoneCallAfterHangup(callSrc) {
    if (!phoneCallAudio) {
      phoneCallAudio = new window.Audio();
      phoneCallAudio.preload = "auto";
    }
    phoneCallAudio.onended = null;
    phoneCallAudio.pause();
    phoneCallAudio.currentTime = 0;
    phoneCallAudio.src = callSrc;
    phoneCallAudio.volume = PHONE_CALL_SOUND_VOLUME;
    phoneCallAudio.onended = () => {
      if (telCallIndex < PHONE_CALL_SOUNDS.length && isStage6Active) {
        telEmissiveTarget = 0;
        isTelActivated = false;
        telRingAgainTimeoutId = window.setTimeout(() => {
          telRingAgainTimeoutId = 0;
          if (isStage6Active) {
            isTelActivated = true;
            telEmissiveTarget = 1;
            playPhoneRing();
            showTelBubble("click!");
            const ringSubtitle =
              PHONE_CALL_RING_SUBTITLES[telCallIndex] ??
              PHONE_CALL_RING_SUBTITLES[PHONE_CALL_RING_SUBTITLES.length - 1];
            dispatchStage6SubtitleSequence([
              { text: ringSubtitle, holdMs: 3000 },
            ]);
          }
        }, TEL_RING_AGAIN_DELAY_MS);
      } else {
        telEmissiveTarget = 0;
        telRingAgainTimeoutId = window.setTimeout(() => {
          telRingAgainTimeoutId = 0;
          if (isStage6Active && !isAtmActivated) {
            activateAtmKiosk();
          }
        }, TEL_ATM_TRIGGER_DELAY_AFTER_LAST_CALL_MS);
      }
    };
    try {
      phoneCallAudio.load();
    } catch {
      // ignore
    }
    const p = phoneCallAudio.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
  }

  function playCurrentPhoneCall() {
    if (telCallIndex >= PHONE_CALL_SOUNDS.length) return;
    stopPhoneRing();
    hideTelBubble();
    isTelActivated = false;
    const callIdx = telCallIndex;
    const callSrc = resolvePublicAssetUrl(PHONE_CALL_SOUNDS[callIdx]);
    telCallIndex++;
    if (!phoneHangupAudio) {
      phoneHangupAudio = new window.Audio();
      phoneHangupAudio.preload = "auto";
      phoneHangupAudio.src = resolvePublicAssetUrl(PHONE_HANGUP_SOUND_PATH);
    }
    phoneHangupAudio.onended = null;
    phoneHangupAudio.pause();
    phoneHangupAudio.currentTime = 0;
    phoneHangupAudio.volume = PHONE_HANGUP_SOUND_VOLUME;
    phoneHangupAudio.onended = () => {
      if (isStage6Active) startPhoneCallAfterHangup(callSrc);
    };
    const p = phoneHangupAudio.play();
    if (p && typeof p.catch === "function") {
      p.catch(() => {
        if (isStage6Active) startPhoneCallAfterHangup(callSrc);
      });
    }
  }

  function activateAtmKiosk() {
    if (isAtmActivated) return;
    isAtmActivated = true;
    atmEmissiveTarget = 1;
    playAirplaneCallSignOnce(() => {
      dispatchStage6SubtitleSequence([
        {
          text: "탑승 수속이 시작되었습니다.",
          holdMs: 2000,
        },
        {
          text: "키오스크에서 체크인을 완료해주세요.",
          holdMs: 2000,
        },
      ]);
    });
  }

  function registerNonAtmInteraction(hit) {
    if (!hit || isAtmHitTarget(hit) || isTelHitTarget(hit) || isAtmActivated)
      return;
    const interactionKey = hit.intName || hit.target;
    if (!interactionKey || interactedTargets.has(interactionKey)) return;
    interactedTargets.add(interactionKey);
    if (interactedTargets.size >= ATM_INTERACTION_REQUIRED_COUNT) {
      activateAtmKiosk();
    }
  }

  function registerIntInteractions(rootModel) {
    intRaycastMeshes.length = 0;
    collectAtmInteractiveRoot(rootModel);
    /** @type {Set<THREE.Mesh>} */
    const meshSet = new Set();
    rootModel.traverse((obj) => {
      if (typeof obj.name !== "string") return;
      if (
        !obj.name.startsWith(INT_PREFIX) &&
        !EXTRA_CLICKABLE_OBJECT_NAMES.has(obj.name)
      ) {
        return;
      }
      obj.traverse((child) => {
        if (child?.isMesh) meshSet.add(child);
      });
    });
    intRaycastMeshes.push(...meshSet);
    collectTelInteractiveRoot(rootModel);
    registerAtmEmissiveMaterials();
    registerTelEmissiveMaterials();
    applyAtmEmissive(atmEmissiveProgress);
    applyTelEmissive(telEmissiveProgress);
    if (import.meta.env.DEV) {
      console.log(
        `[Stage6] INT_ clickable mesh count: ${intRaycastMeshes.length}`,
      );
    }
  }

  function getPointerHitTarget(event) {
    if (!canvasRef || !cameraRef || intRaycastMeshes.length === 0) return null;
    const rect = canvasRef.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, cameraRef);
    const hits = raycaster.intersectObjects(intRaycastMeshes, false);
    for (const hit of hits) {
      let p = hit.object;
      let topIntNode = null;
      while (p) {
        if (
          typeof p.name === "string" &&
          (p.name.startsWith(INT_PREFIX) ||
            EXTRA_CLICKABLE_OBJECT_NAMES.has(p.name))
        ) {
          topIntNode = p;
        }
        p = p.parent;
      }
      if (topIntNode) {
        const suffix = topIntNode.name.startsWith(INT_PREFIX)
          ? topIntNode.name.slice(INT_PREFIX.length)
          : topIntNode.name;
        return {
          intName: topIntNode.name,
          target: normalizeIntNameToken(suffix),
        };
      }
    }
    return null;
  }

  return {
    camera: null,

    setup(scene, renderer) {
      isStage6Active = true;
      const canvas = renderer.domElement;
      canvasRef = canvas;
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
      cameraRef = this.camera;

      scene.background = new THREE.Color(config.background.color);
      character = createCharacterController({
        scene,
        glbLoader,
        config,
        getKeys: () => keyboard.keys,
      });
      keyboard.mount();

      const exposureDelta = Number(config.toneMappingExposureDelta ?? 0.14);
      stage6ExposureRestore = {
        toneMappingExposure: renderer.toneMappingExposure,
        renderer,
      };
      renderer.toneMappingExposure += exposureDelta;

      interactedTargets.clear();
      isAtmActivated = false;
      atmEmissiveTarget = 0;
      atmEmissiveProgress = 0;
      atmRootRef = null;
      atmEmissiveMaterials.length = 0;
      if (telRingAgainTimeoutId) {
        window.clearTimeout(telRingAgainTimeoutId);
        telRingAgainTimeoutId = 0;
      }
      if (telActivateTimeoutId) {
        window.clearTimeout(telActivateTimeoutId);
        telActivateTimeoutId = 0;
      }
      isTelActivated = false;
      isTelRinging = false;
      telEmissiveTarget = 0;
      telEmissiveProgress = 0;
      telCallIndex = 0;
      telRootRef = null;
      telEmissiveMaterials.length = 0;
      isSceneInteractionLocked = false;
      isFinishFired = false;
      window.dispatchEvent(new CustomEvent(STAGE6_BOARDING_RESET_EVENT));
      onInteractionLock = () => {
        isSceneInteractionLocked = true;
      };
      onInteractionUnlock = () => {
        isSceneInteractionLocked = false;
      };
      window.addEventListener(STAGE6_INTERACTION_LOCK_EVENT, onInteractionLock);
      window.addEventListener(
        STAGE6_INTERACTION_UNLOCK_EVENT,
        onInteractionUnlock,
      );
      window.addEventListener("keydown", handleKeyDown, { capture: true });
      onPointerDown = (event) => {
        const hit = getPointerHitTarget(event);
        if (!hit) return;
        const isCharacterHit = CHAR_ROOT_NAMES.includes(hit.intName);
        if (isSceneInteractionLocked && !isCharacterHit) return;
        if (hit.target === "photobooth") {
          playPhotoboothCurtainSound();
        }
        const isAtmHit = isAtmHitTarget(hit);
        const isTelHit = isTelHitTarget(hit);
        if (isTelHit) {
          if (isTelActivated) {
            playCurrentPhoneCall();
          }
        } else if (isAtmHit) {
          playAtmClickSound();
          if (!isAtmActivated) {
            dispatchStage6SubtitleSequence([
              {
                text: "아직 탑승 수속이 시작되지 않았어요. 잠시 둘러보세요 🙂",
                holdMs: 2200,
              },
            ]);
          } else {
            window.dispatchEvent(new CustomEvent(STAGE6_NAME_MODAL_SHOW_EVENT));
          }
        } else {
          registerNonAtmInteraction(hit);
        }
        if (hit.target === "boardpic" || hit.target === "poster") {
          window.dispatchEvent(
            new CustomEvent(STAGE6_POSTER_MODAL_SHOW_EVENT, {
              detail: {
                imageSrc:
                  config.boardPosterImage ?? "/assets/poster/stamp_poster.png",
                intName: hit.intName,
              },
            }),
          );
        }
        window.dispatchEvent(
          new CustomEvent(STAGE6_INT_CLICK_EVENT, {
            detail: hit,
          }),
        );
      };
      canvas.addEventListener("pointerdown", onPointerDown, { capture: true });
      onPointerMove = (event) => {
        const hit = getPointerHitTarget(event);
        const isCharacterHit = !!hit && CHAR_ROOT_NAMES.includes(hit.intName);
        // 씬 잠금 중에도 캐릭터 hover 애니메이션은 허용.
        if (isSceneInteractionLocked && !isCharacterHit) {
          canvas.style.cursor = "default";
          hoveredCharacterName = null;
          return;
        }

        if (isCharacterHit && hit) {
          if (hoveredCharacterName !== hit.intName) {
            playCharacter(hit.intName);
            hoveredCharacterName = hit.intName;
          }
        } else {
          hoveredCharacterName = null;
        }
        canvas.style.cursor = hit ? "pointer" : "default";
      };
      canvas.addEventListener("pointermove", onPointerMove);

      charBubbleEl = createCharBubbleEl();
      telBubbleEl = createTelBubbleEl();

      isSceneInteractionLocked = true;

      // 배경 GLB 로드: 템플릿 캐시 (animated 씬은 gltf.scene 직접 사용)
      void loadGltfTemplateCached(stage6ModelUrl)
        .then((gltf) => {
          if (!isStage6Active) return;
          const model = gltf.scene;
          gltfSceneRef = model;

          // SkinnedMesh 프러스텀 컬링 해제 (§11.2: 카메라 가장자리 사라짐 방지)
          model.traverse((o) => {
            if (/** @type {any} */ (o).isSkinnedMesh) {
              /** @type {any} */ (o).frustumCulled = false;
            }
          });

          // Electron 웹뷰에서만 transmission 소재 fallback
          if (isElectronLike && !model.userData.stage6ElectronPatched) {
            model.userData.stage6ElectronPatched = true;
            model.traverse((child) => {
              const mesh = /** @type {any} */ (child);
              if (!mesh.isMesh || !mesh.material) return;
              const mats = Array.isArray(mesh.material)
                ? mesh.material
                : [mesh.material];
              for (const mat of mats) {
                if (
                  !mat ||
                  !(
                    typeof mat.transmission === "number" && mat.transmission > 0
                  )
                )
                  continue;
                mat.transmission = 0;
                mat.transparent = true;
                mat.opacity = Math.min(
                  typeof mat.opacity === "number" ? mat.opacity : 1,
                  0.42,
                );
                if (typeof mat.roughness === "number")
                  mat.roughness = Math.max(mat.roughness, 0.08);
                if (typeof mat.metalness === "number")
                  mat.metalness = Math.min(mat.metalness, 0.05);
                if (typeof mat.envMapIntensity === "number")
                  mat.envMapIntensity = Math.max(mat.envMapIntensity, 1.15);
                if ("depthWrite" in mat) mat.depthWrite = false;
                mat.needsUpdate = true;
              }
            });
          }

          model.traverse((child) => {
            const mesh = /** @type {any} */ (child);
            if (mesh.isMesh) {
              if (config.model.castShadow !== undefined)
                mesh.castShadow = config.model.castShadow;
              if (config.model.receiveShadow !== undefined)
                mesh.receiveShadow = config.model.receiveShadow;
            }
          });

          model.position.set(
            config.model.position?.x ?? 0,
            config.model.position?.y ?? 0,
            config.model.position?.z ?? 0,
          );
          model.updateMatrixWorld(true);

          objects.push(model);
          scene.add(model);

          // 애니메이션 시스템 초기화 (§5: mixer 1개, gltf.scene 전체)
          setupCharAnimations(model, gltf.animations ?? []);

          registerIntInteractions(model);

          // BG_Floor만 대상으로 바닥 레이캐스트 (§11.11: 성능 최적화)
          const bgFloor = model.getObjectByName("BG_Floor");
          const floorMeshes = bgFloor
            ? collectMeshesDeep(bgFloor)
            : collectMeshesDeep(model);

          const bounds = new THREE.Box3().setFromObject(model);
          const esc =
            model.getObjectByName("INT_Escalator1") ||
            model.getObjectByName("INT_Escalator2");

          let spawnX = (bounds.min.x + bounds.max.x) * 0.5;
          let spawnZ = (bounds.min.z + bounds.max.z) * 0.5;
          let rayStartY = bounds.max.y + 1;

          if (esc) {
            esc.updateMatrixWorld(true);
            esc.getWorldPosition(_escWorld);
            rayStartY = Math.max(_escWorld.y + 4, bounds.min.y + 2);
            const camPos = config.camera.position;
            _toCam.set(camPos.x - _escWorld.x, 0, camPos.z - _escWorld.z);
            if (_toCam.lengthSq() < 1e-6) {
              _toCam.set(0, 0, 1);
            } else {
              _toCam.normalize();
            }
            const frontDist =
              Number(config.character?.escalatorFrontDistance ?? 1.1) || 1.1;
            spawnX = _escWorld.x + _toCam.x * frontDist;
            spawnZ = _escWorld.z + _toCam.z * frontDist;
          }

          let floorY = raycastFloorY(
            floorMeshes,
            spawnX,
            spawnZ,
            raycaster,
            rayStartY,
          );
          if (floorY == null) {
            if (esc) {
              esc.updateMatrixWorld(true);
              esc.getWorldPosition(_escWorld);
              floorY = _escWorld.y;
            } else {
              floorY = bounds.min.y + 0.05;
            }
          }

          const allStaticColliders = collectStage6StaticColliderBoxes(model);
          const staticColliderBoxes = bagPhysics.setup(
            model.getObjectByName(BAG_OBJECT_NAME) ?? null,
            allStaticColliders,
          );

          const characterController = /** @type {any} */ (character);
          characterController?.setup(floorY, bounds, staticColliderBoxes, {
            worldSpawnXZ: { x: spawnX, z: spawnZ },
          });

          // GLB 씬이 실제로 준비된 뒤에 공항 안내 오디오/자막 시퀀스를 시작
          scheduleAirplaneCallSign();
        })
        .catch((err) => {
          console.error(
            `❌ Stage6 배경 로드 에러 (${config.model.path}):`,
            err,
          );
          // 배경 로드 실패해도 안내 방송은 진행 (기존 동작 유지)
          scheduleAirplaneCallSign();
        });

      // 벤치 로드 (config.bench 있을 때)
      const benchConfig = config.bench;
      if (benchConfig) {
        glbLoader.load(benchConfig.path, {
          onLoad: (gltf) => {
            const model = gltf.scene;
            model.position.set(
              benchConfig.position?.x ?? 0,
              benchConfig.position?.y ?? 0,
              benchConfig.position?.z ?? 0,
            );
            model.rotation.set(
              ((benchConfig.rotation?.x ?? 0) * Math.PI) / 180,
              ((benchConfig.rotation?.y ?? 0) * Math.PI) / 180,
              ((benchConfig.rotation?.z ?? 0) * Math.PI) / 180,
            );
            model.scale.setScalar(benchConfig.scale ?? 1);
            model.traverse((child) => {
              if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
              }
            });
            objects.push(model);
            scene.add(model);
            bagPhysics.addBenchColliders(model);
          },
          onError: (err) =>
            console.warn("❌ Stage6 bench 로드 실패:", benchConfig.path, err),
        });
      }

      // 커튼 FBX 로드
      const curtainConfig = config.curtain;
      if (curtainConfig?.path) {
        fbxLoader.load(
          curtainConfig.path,
          (object) => {
            object.position.set(
              curtainConfig.position?.x ?? 0,
              curtainConfig.position?.y ?? 0,
              curtainConfig.position?.z ?? 0,
            );
            object.rotation.set(
              ((curtainConfig.rotation?.x ?? 0) * Math.PI) / 180,
              ((curtainConfig.rotation?.y ?? 0) * Math.PI) / 180,
              ((curtainConfig.rotation?.z ?? 0) * Math.PI) / 180,
            );
            object.scale.setScalar(curtainConfig.scale ?? 1);

            object.traverse((child) => {
              if (child instanceof THREE.Mesh) {
                if (curtainConfig.castShadow !== undefined) {
                  child.castShadow = curtainConfig.castShadow;
                }
                if (curtainConfig.receiveShadow !== undefined) {
                  child.receiveShadow = curtainConfig.receiveShadow;
                }
              }
            });

            objects.push(object);
            scene.add(object);
          },
          undefined,
          (err) => {
            console.error("❌ Stage6 커튼 로드 에러:", err);
          },
        );
      }
    },

    update(delta) {
      atmEmissiveProgress = THREE.MathUtils.damp(
        atmEmissiveProgress,
        atmEmissiveTarget,
        ATM_EMISSIVE_TWEEN_SPEED,
        delta,
      );
      if (atmEmissiveMaterials.length > 0) {
        applyAtmEmissive(atmEmissiveProgress);
      }
      telEmissiveProgress = THREE.MathUtils.damp(
        telEmissiveProgress,
        telEmissiveTarget,
        TEL_EMISSIVE_TWEEN_SPEED,
        delta,
      );
      if (telEmissiveMaterials.length > 0) {
        applyTelEmissive(telEmissiveProgress);
      }

      if (charMixer) charMixer.update(delta);

      if (charBubbleActiveChar) {
        updateCharBubblePosition(charBubbleActiveChar);
        charBubbleRemaining -= delta;
        if (charBubbleRemaining <= 0) {
          hideCharBubble();
        }
      }

      if (isTelRinging && telBubbleEl) {
        updateTelBubblePosition();
      }

      if (character) {
        character.update(delta, this.camera, { skipCameraFollow: true });
      }

      bagPhysics.update(
        character?.getPosition() ?? null,
        config.character.collisionRadius ?? 0.22,
        delta,
        this.camera,
      );
    },

    cleanup(scene) {
      isStage6Active = false;
      cancelAirplaneCallSignScheduled();
      keyboard.unmount();
      if (character) {
        character.cleanup();
        character = null;
      }
      if (photoboothCurtainAudio) {
        photoboothCurtainAudio.pause();
        photoboothCurtainAudio.src = "";
        photoboothCurtainAudio = null;
      }
      if (atmClickAudio) {
        atmClickAudio.pause();
        atmClickAudio.src = "";
        atmClickAudio = null;
      }
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
      window.dispatchEvent(new CustomEvent(STAGE6_POSTER_MODAL_HIDE_EVENT));
      window.dispatchEvent(new CustomEvent(STAGE6_BOARDING_RESET_EVENT));
      if (canvasRef && onPointerDown) {
        canvasRef.removeEventListener("pointerdown", onPointerDown, {
          capture: true,
        });
      }
      if (canvasRef && onPointerMove) {
        canvasRef.removeEventListener("pointermove", onPointerMove);
        canvasRef.style.cursor = "default";
      }
      if (onInteractionLock) {
        window.removeEventListener(
          STAGE6_INTERACTION_LOCK_EVENT,
          onInteractionLock,
        );
      }
      if (onInteractionUnlock) {
        window.removeEventListener(
          STAGE6_INTERACTION_UNLOCK_EVENT,
          onInteractionUnlock,
        );
      }
      canvasRef = null;
      cameraRef = null;
      onPointerDown = null;
      onPointerMove = null;
      onInteractionLock = null;
      onInteractionUnlock = null;
      interactedTargets.clear();
      hoveredCharacterName = null;
      isAtmActivated = false;
      atmRootRef = null;
      atmEmissiveMaterials.length = 0;
      atmEmissiveProgress = 0;
      atmEmissiveTarget = 0;
      if (telRingAgainTimeoutId) {
        window.clearTimeout(telRingAgainTimeoutId);
        telRingAgainTimeoutId = 0;
      }
      if (phoneRingAudio) {
        phoneRingAudio.pause();
        phoneRingAudio.src = "";
        phoneRingAudio = null;
      }
      if (phoneHangupAudio) {
        phoneHangupAudio.onended = null;
        phoneHangupAudio.pause();
        phoneHangupAudio.src = "";
        phoneHangupAudio = null;
      }
      if (phoneCallAudio) {
        phoneCallAudio.onended = null;
        phoneCallAudio.pause();
        phoneCallAudio.src = "";
        phoneCallAudio = null;
      }
      isTelActivated = false;
      isTelRinging = false;
      telRootRef = null;
      telEmissiveMaterials.length = 0;
      telEmissiveProgress = 0;
      telEmissiveTarget = 0;
      telCallIndex = 0;
      isSceneInteractionLocked = false;
      intRaycastMeshes.length = 0;

      bagPhysics.cleanup();

      if (charMixer) {
        charMixer.stopAllAction();
        charMixer = null;
      }
      for (const k of Object.keys(charActions)) delete charActions[k];
      for (const k of Object.keys(charRoots)) delete charRoots[k];

      hideCharBubble();
      if (charBubbleEl?.parentNode)
        charBubbleEl.parentNode.removeChild(charBubbleEl);
      charBubbleEl = null;

      hideTelBubble();
      if (telBubbleEl?.parentNode)
        telBubbleEl.parentNode.removeChild(telBubbleEl);
      telBubbleEl = null;

      // gltf.scene은 캐시에 유지 — remove만, dispose 금지
      const cachedScene = gltfSceneRef;
      gltfSceneRef = null;

      objects.forEach((obj) => {
        scene.remove(obj);
        if (obj === cachedScene) return;
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

      if (stage6ExposureRestore) {
        const { renderer: r, toneMappingExposure } = stage6ExposureRestore;
        r.toneMappingExposure = toneMappingExposure;
        stage6ExposureRestore = null;
      }

      scene.background = null;
    },
  };
}
