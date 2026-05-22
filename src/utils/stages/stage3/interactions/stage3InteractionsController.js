/**
 * Stage3 INT_* 레이캐스트·클릭 상호작용·근접 사운드·포탈 통과·카메라 yaw assist
 */
import * as THREE from "three";
import { resolvePublicAssetUrl } from "../../../common/gltfTemplateCache.js";
import {
  STAGE3_INT_PREFIX,
  STAGE3_INT_SUFFIX_TO_TARGET,
  STAGE3_INT_CLICK_HINT_RADIUS,
  STAGE3_INT_CLICK_HINT_OFFSET_Y,
  PORTAL_PASS_TRIGGER_RADIUS_SCALE,
  PORTAL_PASS_TRIGGER_RADIUS_MIN,
  PORTAL_PASS_TRIGGER_RADIUS_MAX,
  GAME_MACHINE_CLICK_SOUND_PATH,
  LOOP_CLIP_NAMES,
  STAGE3_CLICK_ONCE_ANIM_SETS,
  CLOCK_ALARM_START_FRAME,
  CLOCK_ALARM_END_FRAME,
  CLOCK_ALARM_SOUND_PATH,
} from "../../../../config/stages/stage3/stage3Interactions.js";
import {
  playRandomWellClickSound,
  playWellBubblePopSound,
} from "../playWellClickSound.js";
import { onMinigameClose, closeMinigame } from "../minigameLauncher.js";
import { resumeStage3BackgroundAmbientFromOverlay } from "../../../common/stage3IntroAudio.js";
import { notifyStage3IntroInputBlocked } from "../stage3IntroInputBlockedNotify.js";

/**
 * @typedef {"notice" | "gameMachine" | "tent" | "vendingMachine" | "portal" | "well" | "clock" | "gumtoongji"} Stage3InteractionTarget
 */

/**
 * @param {{
 *   getCamera: () => import("three").PerspectiveCamera | null,
 *   getCanvas: () => HTMLCanvasElement | null,
 *   getConfig: () => import("../../../../types.js").Stage3Config,
 *   getCharacter: () => { getPosition?: () => import("three").Vector3; getIsMoving?: () => boolean } | null,
 *   getVendingMachineController: () => ReturnType<typeof import("../vendingMachine/stage3VendingMachineController.js").createStage3VendingMachineController>,
 *   getCameraIntroState: () => { completed: boolean; active: boolean },
 *   isInteractionBlocked: () => boolean,
 *   isIntroPresentationLocked: () => boolean,
 *   getPortalTransitionInProgress: () => boolean,
 *   isPortalOpenForStageTransition: () => boolean,
 *   onTryEnterPortal: () => void,
 *   onPortalBlocked: () => void,
 *   tryAdvanceStampSequence: (stepKey: string) => void,
 *   tryRegisterEasterEggFromRayTarget: (target: string) => { stampSubtitle: string | null } | null,
 *   dispatchSubtitleLine: (text: string) => void,
 *   showNoticeModal: () => void,
 *   showGameMachineModal: () => void,
 *   openGumCardsModal: () => void,
 *   hideStage3InteractionBubbles: () => void,
 *   syncStampPanelVisibilityByOverlay: () => void,
 *   queueStampStepOnModalClose: (stepKey: string) => void,
 *   flushQueuedStampStepOnModalClose: (stepKey: string) => void,
 *   flushPendingEggDiscoverySubtitle: () => void,
 *   setPendingEggDiscoverySubtitle: (text: string) => void,
 *   onGameMachineModalClose: () => void,
 *   onOpenTentModal: () => void,
 *   getDebugControls: () => { getOrbitControls?: () => unknown } | null,
 * }} params
 */
export function createStage3InteractionsController({
  getCamera,
  getCanvas,
  getConfig,
  getCharacter,
  getVendingMachineController,
  getCameraIntroState,
  isInteractionBlocked,
  isIntroPresentationLocked,
  getPortalTransitionInProgress,
  isPortalOpenForStageTransition,
  onTryEnterPortal,
  onPortalBlocked,
  tryAdvanceStampSequence,
  tryRegisterEasterEggFromRayTarget,
  dispatchSubtitleLine,
  showNoticeModal,
  showGameMachineModal,
  openGumCardsModal,
  hideStage3InteractionBubbles,
  syncStampPanelVisibilityByOverlay,
  queueStampStepOnModalClose,
  flushQueuedStampStepOnModalClose,
  flushPendingEggDiscoverySubtitle,
  setPendingEggDiscoverySubtitle,
  onGameMachineModalClose,
  onOpenTentModal,
  getDebugControls,
}) {
  /** @type {HTMLAudioElement | null} */
  let gameMachineClickAudio = null;
  let unlistenMinigameClose = null;
  /** @type {THREE.Object3D | null} */
  let gameMachineRef = null;

  const _pointer = new THREE.Vector2();
  const _raycaster = new THREE.Raycaster();
  const intRaycastMeshes = [];
  const gumtoongjiRaycastMeshes = [];
  const cameraAssistTargets = [];
  let smoothedCameraYawAssist = 0;
  let smoothedCameraYawAssistDemand = 0;
  const intProximityTargets = [];
  /** @type {Stage3InteractionTarget | null} */
  let activeIntHintTarget = null;
  const portalPassTriggerSphere = new THREE.Sphere();
  let hasPortalPassTriggerSphere = false;
  let wasInsidePortalPassTrigger = false;

  /** island ambient 루프 전용 mixer (그네·파도·모닥불·풍선 등) */
  /** @type {import("three").AnimationMixer | null} */
  let islandLoopMixer = null;

  /** @type {ReturnType<typeof setTimeout> | null} */
  let _clockAlarmStartTimeoutId = null;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let _clockAlarmStopTimeoutId = null;
  /** @type {HTMLAudioElement | null} */
  let _clockAlarmAudio = null;

  /** @type {Map<string, { mixer: import("three").AnimationMixer, actions: import("three").AnimationAction[] }>} */
  const clickOnceSets = new Map();

  const _camAssistBox = new THREE.Box3();
  const _camAssistSphere = new THREE.Sphere();
  const _intHintWorld = new THREE.Vector3();
  const _portalTriggerCenter = new THREE.Vector3();
  const _camProjView = new THREE.Matrix4();
  const _camFrustum = new THREE.Frustum();

  /** @type {HTMLDivElement | null} */
  let intClickHintBubbleEl = null;

  let _pointerMoveRafId = 0;
  /** @type {PointerEvent | null} */
  let _lastPointerEvent = null;

  /** @param {THREE.Vector3} origin @param {THREE.Box3} box */
  function xzDistanceToFootprintBox(origin, box) {
    const cx = THREE.MathUtils.clamp(origin.x, box.min.x, box.max.x);
    const cz = THREE.MathUtils.clamp(origin.z, box.min.z, box.max.z);
    const dx = origin.x - cx;
    const dz = origin.z - cz;
    return Math.sqrt(dx * dx + dz * dz);
  }

  function normalizeIntNameToken(value) {
    return String(value ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  }

  /** @param {THREE.Object3D} root */
  function hasGgumCharacterDescendant(root) {
    let found = false;
    root.traverse((node) => {
      if (found) return;
      const token = normalizeIntNameToken(node?.name);
      if (!token) return;
      if (
        token.includes("gumtoongji") ||
        token.includes("ggumtoongji") ||
        token.includes("ggumddi")
      ) {
        found = true;
      }
    });
    return found;
  }

  /** @param {THREE.Object3D} root */
  function isBenchIntObject(root) {
    let found = false;
    root.traverse((node) => {
      if (found) return;
      const token = normalizeIntNameToken(node?.name);
      if (!token) return;
      if (
        token.includes("bench") ||
        token.includes("chair") ||
        token.includes("seat")
      ) {
        found = true;
      }
    });
    return found;
  }

  /**
   * @param {string} suffix
   * @returns {Stage3InteractionTarget | null}
   */
  function intSuffixToTarget(suffix) {
    const lower = normalizeIntNameToken(suffix);
    const mapped = STAGE3_INT_SUFFIX_TO_TARGET[lower];
    return /** @type {Stage3InteractionTarget | null} */ (mapped ?? null);
  }

  /** @param {THREE.Object3D} hitObject */
  function resolveIntPointerTarget(hitObject) {
    let p = hitObject;
    while (p) {
      if (typeof p.name === "string" && p.name.startsWith(STAGE3_INT_PREFIX)) {
        const suffix = p.name.slice(STAGE3_INT_PREFIX.length);
        return intSuffixToTarget(suffix);
      }
      p = p.parent;
    }
    return null;
  }

  /** @param {string} trigger */
  function playClickOnceSet(trigger) {
    const set = clickOnceSets.get(trigger);
    if (!set) return;
    if (set.blockReplay && set._playingCount > 0) return;
    if (set.blockReplay) set._playingCount = set.actions.length;
    for (const a of set.actions) a.reset().play();
  }

  function playGameMachineClickSound() {
    const src = resolvePublicAssetUrl(GAME_MACHINE_CLICK_SOUND_PATH);
    if (!gameMachineClickAudio) {
      gameMachineClickAudio = new window.Audio();
      gameMachineClickAudio.preload = "auto";
      gameMachineClickAudio.volume = 1;
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

  function tryEnterPortal() {
    if (getPortalTransitionInProgress()) return;
    if (isPortalOpenForStageTransition()) {
      onTryEnterPortal();
      return;
    }
    onPortalBlocked();
  }

  /**
   * @param {Stage3InteractionTarget} target
   * @returns {boolean}
   */
  function runInteractionForTarget(target) {
    playClickOnceSet(target);

    if (target === "gumtoongji") {
      playClickOnceSet("well");
      playWellBubblePopSound();
      tryAdvanceStampSequence("gumtoongji");
      return true;
    }

    if (target === "portal") {
      tryEnterPortal();
      return true;
    }

    const vendingMachineController = getVendingMachineController();

    if (target === "vendingMachine") {
      if (!vendingMachineController.getMachineRef()) {
        if (import.meta.env.DEV) {
          console.warn(
            "[Stage3] vendingMachine 클릭 감지됨. 하지만 머신 ref가 없습니다(INT 네이밍/계층 확인).",
          );
        }
        return false;
      }
      if (!vendingMachineController.hasTemplates()) {
        if (import.meta.env.DEV) {
          console.warn(
            "[Stage3] 벤딩머신 템플릿이 비어 있습니다. GLB 경로·네트워크를 확인하세요.",
          );
        }
        return false;
      }
      const eggTap = tryRegisterEasterEggFromRayTarget("icecream");
      vendingMachineController.spawnFromMachine();
      tryAdvanceStampSequence("icecream");
      if (eggTap?.stampSubtitle) {
        dispatchSubtitleLine(eggTap.stampSubtitle);
      }
      return true;
    }

    if (target === "notice") {
      const eggTap = tryRegisterEasterEggFromRayTarget("notice");
      showNoticeModal();
      queueStampStepOnModalClose("notice");
      if (eggTap?.stampSubtitle) {
        setPendingEggDiscoverySubtitle(eggTap.stampSubtitle);
      }
      return true;
    }
    if (target === "gameMachine") {
      const eggTap = tryRegisterEasterEggFromRayTarget("gameMachine");
      playGameMachineClickSound();
      showGameMachineModal();
      queueStampStepOnModalClose("gameMachine");
      if (eggTap?.stampSubtitle) {
        setPendingEggDiscoverySubtitle(eggTap.stampSubtitle);
      }
      return true;
    }
    if (target === "tent") {
      onOpenTentModal();
      openGumCardsModal();
      queueStampStepOnModalClose("tent");
      const eggTap = tryRegisterEasterEggFromRayTarget("tent");
      if (eggTap?.stampSubtitle) {
        setPendingEggDiscoverySubtitle(eggTap.stampSubtitle);
      }
      return true;
    }
    if (target === "well") {
      playRandomWellClickSound();
      playWellBubblePopSound();
      window.dispatchEvent(new CustomEvent("gum:wellClick"));
      return true;
    }
    if (target === "clock") {
      if (_clockAlarmStartTimeoutId !== null)
        clearTimeout(_clockAlarmStartTimeoutId);
      if (_clockAlarmStopTimeoutId !== null)
        clearTimeout(_clockAlarmStopTimeoutId);
      if (_clockAlarmAudio) {
        _clockAlarmAudio.pause();
        _clockAlarmAudio = null;
      }

      _clockAlarmStartTimeoutId = setTimeout(
        () => {
          _clockAlarmStartTimeoutId = null;
          _clockAlarmAudio = new window.Audio(
            resolvePublicAssetUrl(CLOCK_ALARM_SOUND_PATH),
          );
          _clockAlarmAudio.play().catch(() => {});
          _clockAlarmStopTimeoutId = setTimeout(
            () => {
              _clockAlarmStopTimeoutId = null;
              if (_clockAlarmAudio) {
                _clockAlarmAudio.pause();
                _clockAlarmAudio = null;
              }
            },
            Math.round(
              ((CLOCK_ALARM_END_FRAME - CLOCK_ALARM_START_FRAME) / 24) * 1000,
            ),
          );
        },
        Math.round((CLOCK_ALARM_START_FRAME / 24) * 1000),
      );

      tryAdvanceStampSequence("clock");
      return true;
    }
    return false;
  }

  /** @returns {Stage3InteractionTarget | null} */
  function getPointerHitTarget(clientX, clientY) {
    const camera = getCamera();
    const canvas = getCanvas();
    if (!camera || !canvas) return null;

    const rect = canvas.getBoundingClientRect();
    _pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    _pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    _raycaster.setFromCamera(_pointer, camera);

    if (gumtoongjiRaycastMeshes.length > 0) {
      const gHits = _raycaster.intersectObjects(gumtoongjiRaycastMeshes, false);
      if (gHits.length > 0) return "gumtoongji";
    }

    const vendingMachineController = getVendingMachineController();
    if (intRaycastMeshes.length === 0) return null;
    const hits = _raycaster.intersectObjects(intRaycastMeshes, false);
    if (hits.length === 0) return null;
    for (let i = 0; i < hits.length; i++) {
      const hitObj = hits[i].object;
      const resolved = resolveIntPointerTarget(hitObj);
      if (resolved) return resolved;
      if (vendingMachineController.isMachineHit(hitObj)) {
        return "vendingMachine";
      }
    }
    return null;
  }

  function handlePointerMove(event) {
    const canvas = getCanvas();
    if (!canvas) return;
    _lastPointerEvent = event;
    if (_pointerMoveRafId !== 0) return;
    _pointerMoveRafId = requestAnimationFrame(() => {
      _pointerMoveRafId = 0;
      const e = _lastPointerEvent;
      if (!e || !getCanvas()) return;
      if (isInteractionBlocked()) {
        canvas.style.cursor = "default";
        return;
      }
      const target = getPointerHitTarget(e.clientX, e.clientY);
      canvas.style.cursor = target ? "pointer" : "default";
    });
  }

  function handlePointerLeave() {
    const canvas = getCanvas();
    if (canvas) canvas.style.cursor = "default";
  }

  function handlePointerDown(event) {
    const camera = getCamera();
    const canvas = getCanvas();
    if (!camera || !canvas) return;
    if (isIntroPresentationLocked()) {
      notifyStage3IntroInputBlocked("click");
      return;
    }
    if (isInteractionBlocked()) return;
    const target = getPointerHitTarget(event.clientX, event.clientY);
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    runInteractionForTarget(target);
  }

  function handleIntClickHintPointerDown(event) {
    if (isIntroPresentationLocked()) {
      notifyStage3IntroInputBlocked("click");
      return;
    }
    if (isInteractionBlocked()) return;
    if (!activeIntHintTarget) return;
    event.preventDefault();
    event.stopPropagation();
    runInteractionForTarget(activeIntHintTarget);
  }

  /**
   * @param {THREE.Object3D} islandModel
   * @param {import("three").AnimationClip[]} [animations]
   */
  function registerIslandInteractions(islandModel, animations = []) {
    const vendingMachineController = getVendingMachineController();
    intRaycastMeshes.length = 0;
    gumtoongjiRaycastMeshes.length = 0;
    cameraAssistTargets.length = 0;
    intProximityTargets.length = 0;
    smoothedCameraYawAssist = 0;
    smoothedCameraYawAssistDemand = 0;
    vendingMachineController.clearMachineRef();
    gameMachineRef = null;
    hasPortalPassTriggerSphere = false;
    wasInsidePortalPassTrigger = false;

    if (islandLoopMixer) {
      islandLoopMixer.stopAllAction();
      islandLoopMixer = null;
    }

    for (const set of clickOnceSets.values()) set.mixer.stopAllAction();
    clickOnceSets.clear();

    /** @type {THREE.Object3D | null} */
    let gumtoongjiRoot = null;
    islandModel.traverse((obj) => {
      if (obj.name === "ANIM_Gumtoongji") gumtoongjiRoot = obj;
    });

    if (gumtoongjiRoot) {
      gumtoongjiRoot.traverse((obj) => {
        const meshLike = /** @type {any} */ (obj);
        if (meshLike.isSkinnedMesh) {
          meshLike.frustumCulled = false;
          meshLike.raycast = THREE.SkinnedMesh.prototype.raycast;
        }
        if (meshLike.isMesh && !meshLike.isSkinnedMesh) {
          meshLike.raycast = THREE.Mesh.prototype.raycast;
        }
        if (meshLike.isMesh || meshLike.isSkinnedMesh) {
          gumtoongjiRaycastMeshes.push(obj);
        }
      });
      if (import.meta.env.DEV) {
        console.log(
          "[Gumtoongji] 레이캐스트 메시 수:",
          gumtoongjiRaycastMeshes.length,
        );
      }
    } else if (import.meta.env.DEV) {
      console.warn(
        "[Gumtoongji] root(ANIM_Gumtoongji) 없음 — 레이캐스트 비활성",
      );
    }

    // island ambient 루프 애니메이션 (그네·파도·모닥불·풍선 등) — 씬 로드 즉시 무한 재생
    if (animations.length > 0) {
      islandLoopMixer = new THREE.AnimationMixer(islandModel);
      for (const name of LOOP_CLIP_NAMES) {
        const clip = THREE.AnimationClip.findByName(animations, name);
        if (!clip) {
          if (import.meta.env.DEV) console.warn(`[Loop] clip 없음: ${name}`);
          continue;
        }
        const action = islandLoopMixer.clipAction(clip);
        action.setLoop(THREE.LoopRepeat, Infinity);
        action.clampWhenFinished = false;
        action.play();
      }
    }

    if (unlistenMinigameClose) {
      unlistenMinigameClose();
      unlistenMinigameClose = null;
    }

    const meshSet = new Set();
    const assistRootSet = /** @type {Set<THREE.Object3D>} */ (new Set());
    const rootNames = [];

    islandModel.traverse((obj) => {
      if (
        typeof obj.name !== "string" ||
        !obj.name.startsWith(STAGE3_INT_PREFIX)
      ) {
        return;
      }
      rootNames.push(obj.name);
      const suffix = obj.name.slice(STAGE3_INT_PREFIX.length);
      const intTarget = intSuffixToTarget(suffix);
      if (intTarget != null) {
        assistRootSet.add(obj);
      }
      if (intTarget === "gameMachine") gameMachineRef = obj;
      if (intTarget === "vendingMachine")
        vendingMachineController.setMachineRef(obj);
      obj.traverse((child) => {
        if (child.isMesh) meshSet.add(child);
      });
    });

    const machineRef = vendingMachineController.getMachineRef();
    if (machineRef) {
      assistRootSet.add(machineRef);
    }

    /** @type {THREE.Object3D | null} */
    let portalRef = null;
    islandModel.traverse((obj) => {
      if (
        typeof obj.name !== "string" ||
        !obj.name.startsWith(STAGE3_INT_PREFIX)
      ) {
        return;
      }
      const suffix = obj.name.slice(STAGE3_INT_PREFIX.length);
      if (intSuffixToTarget(suffix) === "portal") portalRef = obj;
    });

    if (portalRef) {
      portalRef.updateMatrixWorld(true);
      _camAssistBox.setFromObject(portalRef);
      if (!_camAssistBox.isEmpty()) {
        _camAssistBox.getBoundingSphere(portalPassTriggerSphere);
        portalPassTriggerSphere.radius = THREE.MathUtils.clamp(
          portalPassTriggerSphere.radius * PORTAL_PASS_TRIGGER_RADIUS_SCALE,
          PORTAL_PASS_TRIGGER_RADIUS_MIN,
          PORTAL_PASS_TRIGGER_RADIUS_MAX,
        );
        hasPortalPassTriggerSphere = true;
      }
    }

    for (const root of assistRootSet) {
      root.updateMatrixWorld(true);
      _camAssistBox.setFromObject(root);
      _camAssistBox.getBoundingSphere(_camAssistSphere);
      cameraAssistTargets.push({ sphere: _camAssistSphere.clone() });
    }

    islandModel.traverse((obj) => {
      if (
        typeof obj.name !== "string" ||
        !obj.name.startsWith(STAGE3_INT_PREFIX)
      ) {
        return;
      }
      const suffix = obj.name.slice(STAGE3_INT_PREFIX.length);
      const intTarget = intSuffixToTarget(suffix);
      if (hasGgumCharacterDescendant(obj)) return;
      if (intTarget !== "clock" && isBenchIntObject(obj)) return;
      if (intTarget == null) return;
      obj.updateMatrixWorld(true);
      _camAssistBox.setFromObject(obj);
      if (_camAssistBox.isEmpty()) return;
      _camAssistBox.getBoundingSphere(_camAssistSphere);
      const isWell = intTarget === "well";
      const isVendingMachine = intTarget === "vendingMachine";
      const anchorWorld = new THREE.Vector3(
        isWell
          ? _camAssistBox.max.x + 0.5
          : (_camAssistBox.min.x + _camAssistBox.max.x) * 0.5,
        isWell
          ? (_camAssistBox.min.y + _camAssistBox.max.y) * 0.5 + 0.6
          : isVendingMachine
            ? _camAssistBox.max.y - 0.7
            : _camAssistBox.max.y + STAGE3_INT_CLICK_HINT_OFFSET_Y,
        (_camAssistBox.min.z + _camAssistBox.max.z) * 0.5,
      );
      intProximityTargets.push({
        sphere: _camAssistSphere.clone(),
        footprintBox: _camAssistBox.clone(),
        anchorWorld,
        hintText: intTarget === "portal" ? "통과!" : "Click!",
        hintVariant: isWell ? "well-side" : "default",
        target: intTarget,
      });
    });

    intRaycastMeshes.push(...meshSet);

    if (animations.length > 0) {
      if (import.meta.env.DEV) {
        console.log(
          "[Stage3 ClickOnce] 전체 클립:",
          animations.map((c) => c.name),
        );
      }
      for (const def of STAGE3_CLICK_ONCE_ANIM_SETS) {
        const root =
          def.objectName == null
            ? islandModel
            : islandModel.getObjectByName(def.objectName);
        if (!root) {
          if (import.meta.env.DEV) {
            console.warn(`[Stage3 ClickOnce] 오브젝트 없음: ${def.objectName}`);
          }
          continue;
        }
        const mixer = new THREE.AnimationMixer(root);
        const clampWhenFinished = def.clampWhenFinished ?? false;
        const actions = [];
        for (const clipName of def.clipNames) {
          const clip = THREE.AnimationClip.findByName(animations, clipName);
          if (!clip) {
            if (import.meta.env.DEV) {
              console.warn(
                `[Stage3 ClickOnce] clip 없음: ${clipName} (${def.objectName ?? "root"})`,
              );
            }
            continue;
          }
          const action = mixer.clipAction(clip);
          action.setLoop(THREE.LoopOnce, 1);
          action.clampWhenFinished = clampWhenFinished;
          actions.push(action);
        }
        if (actions.length > 0) {
          /** @type {{ mixer: import("three").AnimationMixer; actions: import("three").AnimationAction[]; blockReplay: boolean; _playingCount: number }} */
          const setEntry = {
            mixer,
            actions,
            blockReplay: def.blockReplay ?? false,
            _playingCount: 0,
          };
          if (def.blockReplay) {
            mixer.addEventListener("finished", () => {
              setEntry._playingCount = Math.max(0, setEntry._playingCount - 1);
            });
          }
          clickOnceSets.set(def.trigger, setEntry);
        }
      }
    }

    if (gameMachineRef) {
      unlistenMinigameClose = onMinigameClose(() => {
        onGameMachineModalClose();
        hideStage3InteractionBubbles();
        flushQueuedStampStepOnModalClose("gameMachine");
        syncStampPanelVisibilityByOverlay();
        resumeStage3BackgroundAmbientFromOverlay();
        closeMinigame({
          camera: getCamera(),
          orbitControls: getDebugControls()?.getOrbitControls?.() ?? null,
        });
        flushPendingEggDiscoverySubtitle();
      });
    }

    vendingMachineController.warnMachineNotFound(rootNames);
  }

  function updateIntClickHintBubble() {
    const camera = getCamera();
    const canvas = getCanvas();
    if (!intClickHintBubbleEl || !camera || !canvas) return;
    if (isInteractionBlocked()) {
      activeIntHintTarget = null;
      intClickHintBubbleEl.classList.remove("is-visible");
      return;
    }
    const charPos = getCharacter()?.getPosition?.();
    if (!charPos || intProximityTargets.length === 0) {
      activeIntHintTarget = null;
      intClickHintBubbleEl.classList.remove("is-visible");
      return;
    }
    let nearest = null;
    let nearestEdgeDist = Infinity;
    for (let i = 0; i < intProximityTargets.length; i++) {
      const target = intProximityTargets[i];
      const edgeDist = xzDistanceToFootprintBox(charPos, target.footprintBox);
      if (
        edgeDist > STAGE3_INT_CLICK_HINT_RADIUS ||
        edgeDist >= nearestEdgeDist
      ) {
        continue;
      }
      nearest = target;
      nearestEdgeDist = edgeDist;
    }
    if (!nearest) {
      activeIntHintTarget = null;
      intClickHintBubbleEl.classList.remove("is-visible");
      return;
    }
    if (nearest.target === "portal" && !isPortalOpenForStageTransition()) {
      activeIntHintTarget = null;
      intClickHintBubbleEl.classList.remove("is-visible");
      return;
    }
    activeIntHintTarget = nearest.target ?? null;
    _intHintWorld.copy(nearest.anchorWorld);
    camera.updateMatrixWorld(true);
    _intHintWorld.project(camera);
    const rect = canvas.getBoundingClientRect();
    const x = (_intHintWorld.x * 0.5 + 0.5) * rect.width + rect.left;
    const y = (-_intHintWorld.y * 0.5 + 0.5) * rect.height + rect.top;
    intClickHintBubbleEl.textContent = nearest.hintText;
    intClickHintBubbleEl.classList.toggle(
      "speech-bubble-stage3-int-click--well-side",
      nearest.hintVariant === "well-side",
    );
    intClickHintBubbleEl.style.left = `${x}px`;
    intClickHintBubbleEl.style.top = `${y}px`;
    intClickHintBubbleEl.classList.add("is-visible");
  }

  function updatePortalPassTrigger() {
    const charPos = getCharacter()?.getPosition?.();
    if (
      !charPos ||
      !hasPortalPassTriggerSphere ||
      getPortalTransitionInProgress()
    ) {
      wasInsidePortalPassTrigger = false;
      return;
    }
    _portalTriggerCenter.copy(portalPassTriggerSphere.center);
    const dx = charPos.x - _portalTriggerCenter.x;
    const dz = charPos.z - _portalTriggerCenter.z;
    const portalRadius = portalPassTriggerSphere.radius;
    const insidePortalPassTrigger =
      dx * dx + dz * dz <= portalRadius * portalRadius;
    if (!wasInsidePortalPassTrigger && insidePortalPassTrigger) {
      tryEnterPortal();
    }
    wasInsidePortalPassTrigger = insidePortalPassTrigger;
  }

  /**
   * @param {number} delta
   * @param {THREE.PerspectiveCamera} camera
   * @param {THREE.Vector3} charPos
   * @param {boolean} isMoving
   */
  function updateCameraYawAssist(delta, camera, charPos, isMoving) {
    const config = getConfig();
    const ch = config.character;
    const maxRad = ch.cameraYawAssistMaxRad ?? 0.38;
    const maxDist = ch.cameraYawAssistMaxDistance ?? 42;
    const onlyMoving = ch.cameraYawAssistOnlyWhenMoving !== false;
    const lk = Math.max(ch.cameraYawAssistLerp ?? 0.09, 0.02);
    const demandTau =
      ch.cameraYawAssistDemandEaseSec ?? Math.max(0.2, 0.11 / lk);
    const easeTau = ch.cameraYawAssistEaseSec ?? Math.max(0.28, 0.15 / lk);
    const introDecayTau = 0.22;
    const cameraIntro = getCameraIntroState();

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

  function bindCanvas(canvas) {
    canvas.addEventListener("pointerdown", handlePointerDown, {
      capture: true,
    });
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerleave", handlePointerLeave);
  }

  function unbindCanvas(canvas) {
    if (_pointerMoveRafId !== 0) {
      cancelAnimationFrame(_pointerMoveRafId);
      _pointerMoveRafId = 0;
    }
    canvas.removeEventListener("pointerdown", handlePointerDown, {
      capture: true,
    });
    canvas.removeEventListener("pointermove", handlePointerMove);
    canvas.removeEventListener("pointerleave", handlePointerLeave);
    canvas.style.cursor = "default";
  }

  function attachIntClickHintBubble(el) {
    detachIntClickHintBubble();
    intClickHintBubbleEl = el;
    el.addEventListener("pointerdown", handleIntClickHintPointerDown, {
      capture: true,
    });
  }

  function detachIntClickHintBubble() {
    if (!intClickHintBubbleEl) return;
    intClickHintBubbleEl.removeEventListener(
      "pointerdown",
      handleIntClickHintPointerDown,
      { capture: true },
    );
    intClickHintBubbleEl = null;
    activeIntHintTarget = null;
  }

  function resetCameraAssistSmoothing() {
    smoothedCameraYawAssist = 0;
    smoothedCameraYawAssistDemand = 0;
    cameraAssistTargets.length = 0;
    intProximityTargets.length = 0;
  }

  function cleanup() {
    detachIntClickHintBubble();
    intRaycastMeshes.length = 0;
    if (unlistenMinigameClose) {
      unlistenMinigameClose();
      unlistenMinigameClose = null;
    }
    gameMachineRef = null;
    hasPortalPassTriggerSphere = false;
    wasInsidePortalPassTrigger = false;
    if (gameMachineClickAudio) {
      gameMachineClickAudio.pause();
      gameMachineClickAudio.src = "";
      gameMachineClickAudio = null;
    }
    if (_clockAlarmStartTimeoutId !== null) {
      clearTimeout(_clockAlarmStartTimeoutId);
      _clockAlarmStartTimeoutId = null;
    }
    if (_clockAlarmStopTimeoutId !== null) {
      clearTimeout(_clockAlarmStopTimeoutId);
      _clockAlarmStopTimeoutId = null;
    }
    if (_clockAlarmAudio) {
      _clockAlarmAudio.pause();
      _clockAlarmAudio = null;
    }
    gumtoongjiRaycastMeshes.length = 0;
    for (const set of clickOnceSets.values()) set.mixer.stopAllAction();
    clickOnceSets.clear();
    resetCameraAssistSmoothing();
  }

  return {
    registerIslandInteractions,
    bindCanvas,
    unbindCanvas,
    attachIntClickHintBubble,
    detachIntClickHintBubble,
    update(delta) {
      if (islandLoopMixer) islandLoopMixer.update(delta);
      for (const set of clickOnceSets.values()) set.mixer.update(delta);
      updateIntClickHintBubble();
      updatePortalPassTrigger();
    },
    updateCameraYawAssist,
    resetCameraAssistSmoothing,
    cleanup,
    hideIntClickHint() {
      activeIntHintTarget = null;
      intClickHintBubbleEl?.classList.remove("is-visible");
    },
  };
}
