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
  BALLOON_CLIP_NAMES,
  BALLOON_CLIP_HINT_MAP,
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

/**
 * @typedef {"notice" | "gameMachine" | "tent" | "vendingMachine" | "portal" | "well" | "clock" | "gumtoongji"} Stage3InteractionTarget
 */

/**
 * @param {{
 *   getCamera: () => import("three").PerspectiveCamera | null,
 *   getCanvas: () => HTMLCanvasElement | null,
 *   getConfig: () => import("../../../../types.js").Stage3Config,
 *   getCharacter: () => { getPosition?: () => import("three").Vector3; getIsMoving?: () => boolean; setBalloonHeld?: (held: boolean) => void; getBalloonHandAnchorWorld?: (out: import("three").Vector3) => boolean } | null,
 *   getVendingMachineController: () => ReturnType<typeof import("../vendingMachine/stage3VendingMachineController.js").createStage3VendingMachineController>,
 *   getCameraIntroState: () => { completed: boolean; active: boolean },
 *   isInteractionBlocked: () => boolean,
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
 *   getScene: () => import("three").Scene | null,
 *   getDebugControls: () => { getOrbitControls?: () => unknown } | null,
 * }} params
 */
export function createStage3InteractionsController({
  getCamera,
  getCanvas,
  getConfig,
  getCharacter,
  getScene,
  getVendingMachineController,
  getCameraIntroState,
  isInteractionBlocked,
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
  /** @type {HTMLAudioElement | null} */
  let balloonPickupAudio = null;
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
  const _balloonHoverWorld = new THREE.Vector3();
  const _portalTriggerCenter = new THREE.Vector3();
  const _camProjView = new THREE.Matrix4();
  const _camFrustum = new THREE.Frustum();

  /** @type {HTMLDivElement | null} */
  let intClickHintBubbleEl = null;
  /** @type {HTMLDivElement | null} */
  let balloonHoverBubbleEl = null;

  /** @type {{ meshes: import("three").Mesh[]; hintText: string; anchorWorld: import("three").Vector3; node: import("three").Object3D; clip: import("three").AnimationClip | null }[]} */
  const balloonHoverTargets = [];

  /**
   * @type {{
   *   holder: import("three").Group,
   *   clone: import("three").Object3D,
   *   mixer: import("three").AnimationMixer | null,
   *   offsetVec: import("three").Vector3,
   *   node: import("three").Object3D,
   *   stringLine: import("three").Line,
   *   stringPositions: Float32Array,
   * } | null}
   */
  let heldBalloon = null;
  const _heldStringBottom = new THREE.Vector3();
  const _heldBalloonTop = new THREE.Vector3();
  const _heldBalloonActual = new THREE.Vector3();
  /** 손(Hand_R)에서 풍선까지 실 길이(월드 유닛) — 값이 클수록 풍선이 높이 뜸 */
  const HELD_BALLOON_STRING_LENGTH = 0.55;
  /** 풍선 첫 획득 안내 자막을 1회만 노출하기 위한 플래그 */
  let balloonPickupAnnounced = false;

  let _pointerMoveRafId = 0;
  /** @type {PointerEvent | null} */
  let _lastPointerEvent = null;

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

  function updateBalloonHover(clientX, clientY) {
    const camera = getCamera();
    const canvas = getCanvas();
    if (
      !balloonHoverBubbleEl ||
      !camera ||
      !canvas ||
      balloonHoverTargets.length === 0
    ) {
      balloonHoverBubbleEl?.classList.remove("is-visible");
      return;
    }
    const rect = canvas.getBoundingClientRect();
    _pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    _pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    _raycaster.setFromCamera(_pointer, camera);
    for (const target of balloonHoverTargets) {
      if (!target.node.visible) continue;
      const hits = _raycaster.intersectObjects(target.meshes, false);
      if (hits.length > 0) {
        camera.updateMatrixWorld(true);
        _balloonHoverWorld.copy(target.anchorWorld);
        _balloonHoverWorld.project(camera);
        const x = (_balloonHoverWorld.x * 0.5 + 0.5) * rect.width + rect.left;
        const y = (-_balloonHoverWorld.y * 0.5 + 0.5) * rect.height + rect.top;
        balloonHoverBubbleEl.textContent = target.hintText;
        balloonHoverBubbleEl.style.left = `${x}px`;
        balloonHoverBubbleEl.style.top = `${y}px`;
        balloonHoverBubbleEl.classList.add("is-visible");
        return;
      }
    }
    balloonHoverBubbleEl.classList.remove("is-visible");
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
        balloonHoverBubbleEl?.classList.remove("is-visible");
        return;
      }
      const target = getPointerHitTarget(e.clientX, e.clientY);
      canvas.style.cursor = target ? "pointer" : "default";
      updateBalloonHover(e.clientX, e.clientY);
    });
  }

  function handlePointerLeave() {
    const canvas = getCanvas();
    if (canvas) canvas.style.cursor = "default";
    balloonHoverBubbleEl?.classList.remove("is-visible");
  }

  function handlePointerDown(event) {
    const camera = getCamera();
    const canvas = getCanvas();
    if (!camera || !canvas) return;
    if (isInteractionBlocked()) return;

    const balloonTarget = getClickedBalloonTarget(event.clientX, event.clientY);
    if (balloonTarget) {
      event.preventDefault();
      event.stopPropagation();
      holdBalloon(balloonTarget, event.clientX, event.clientY);
      return;
    }

    const target = getPointerHitTarget(event.clientX, event.clientY);
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    runInteractionForTarget(target);
  }

  function handleIntClickHintPointerDown(event) {
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
  function releaseHeldBalloon() {
    if (!heldBalloon) return;
    getCharacter()?.setBalloonHeld?.(false);
    const scene = getScene();
    heldBalloon.node.visible = true;
    if (heldBalloon.mixer) heldBalloon.mixer.stopAllAction();
    if (scene) {
      scene.remove(heldBalloon.holder);
      scene.remove(heldBalloon.stringLine);
    }
    heldBalloon.stringLine.geometry.dispose();
    heldBalloon.stringLine.material.dispose();
    heldBalloon = null;
  }

  function playBalloonPickupSound() {
    const src = resolvePublicAssetUrl("/static/sounds/balloon/balloon.mp3");
    if (!balloonPickupAudio) {
      balloonPickupAudio = new window.Audio();
      balloonPickupAudio.preload = "auto";
      balloonPickupAudio.volume = 1;
    }
    balloonPickupAudio.pause();
    balloonPickupAudio.currentTime = 0;
    balloonPickupAudio.src = src;
    const p = balloonPickupAudio.play();
    if (p && typeof p.catch === "function") {
      p.catch((err) => {
        if (import.meta.env.DEV) {
          console.warn("[Stage3] balloon pickup sound failed:", err);
        }
      });
    }
  }

  /**
   * @param {number} cx  screen X
   * @param {number} cy  screen Y
   */
  function spawnBalloonPickupEffect(cx, cy) {
    const count = 65;
    for (let i = 0; i < count; i++) {
      const el = document.createElement("div");
      el.className = "balloon-pickup-particle";
      const angle = Math.random() * 2 * Math.PI;
      const dist = 80 + Math.random() * 200;
      const size = 8 + Math.random() * 14;
      const duration = 0.7 + Math.random() * 0.6;
      el.style.cssText = `left:${cx}px;top:${cy}px;background:#ffffff;width:${size}px;height:${size}px;--dx:${Math.cos(angle) * dist}px;--dy:${Math.sin(angle) * dist}px;animation-duration:${duration}s;box-shadow:0 0 16px #ffffff;`;
      document.body.appendChild(el);
      let tid;
      const remove = () => {
        clearTimeout(tid);
        el.remove();
      };
      el.addEventListener("animationend", remove);
      tid = setTimeout(remove, 2000);
    }
  }

  /** @param {{ node: import("three").Object3D, clip?: import("three").AnimationClip | null }} target */
  function holdBalloon(target, clickX, clickY) {
    releaseHeldBalloon();
    const scene = getScene();
    if (!scene) return;
    // clone BEFORE hiding — clone(true) copies visible:true from the live node
    target.node.updateMatrixWorld(true);
    const clone = target.node.clone(true);
    clone.visible = true;
    clone.traverse((child) => {
      child.frustumCulled = false;
    });
    target.node.visible = false;

    // sway 클립은 앵커 노드의 translation을 island-local 좌표로 구동한다.
    // holder가 원본 부모(섬)의 월드 변환을 대신하므로, 클론은 섬에서와 똑같이
    // 흔들리고 holder.position만 매 프레임 갱신해 풍선을 손 위로 따라오게 한다.
    const holder = new THREE.Group();
    if (target.node.parent) {
      target.node.parent.matrixWorld.decompose(
        holder.position,
        holder.quaternion,
        holder.scale,
      );
    }
    holder.add(clone);
    scene.add(holder);

    // 풍선 기본 sway 애니메이션 — island과 동일 클립을 클론 전용 믹서로 재생
    let mixer = null;
    if (target.clip) {
      mixer = new THREE.AnimationMixer(clone);
      const action = mixer.clipAction(target.clip);
      action.setLoop(THREE.LoopPingPong, Infinity);
      action.clampWhenFinished = false;
      action.timeScale = 2; // islandLoopMixer와 동일 속도
      action.play();
      // clip 0프레임을 즉시 적용 — offsetVec를 sway 기준점에 맞춰 풍선이
      // 잡는 순간 손 위 목표점에 정확히 놓이게 한다(랜덤 프레임 오프셋 제거)
      mixer.update(0);
    }

    // rest 기준 anchor-local 위치 → 월드 오프셋. 매 프레임
    // holder.position = 목표점 − offsetVec 로 풀어 풍선을 손 위에 고정한다.
    const offsetVec = clone.position
      .clone()
      .multiply(holder.scale)
      .applyQuaternion(holder.quaternion);

    playBalloonPickupSound();
    // 파티클은 유저 캐릭터 스크린 위치에서 터짐
    const camera = getCamera();
    const canvas = getCanvas();
    const charPos = getCharacter()?.getPosition?.();
    if (camera && canvas && charPos) {
      _heldStringBottom.copy(charPos).setY(charPos.y + 1.2);
      camera.updateMatrixWorld(true);
      _heldStringBottom.project(camera);
      const rect = canvas.getBoundingClientRect();
      const sx = (_heldStringBottom.x * 0.5 + 0.5) * rect.width + rect.left;
      const sy = (-_heldStringBottom.y * 0.5 + 0.5) * rect.height + rect.top;
      spawnBalloonPickupEffect(sx, sy);
    } else {
      spawnBalloonPickupEffect(clickX, clickY);
    }

    // 하양색 파티클 효과와 함께 첫 풍선 획득 시 1회만 안내 자막
    if (!balloonPickupAnnounced) {
      balloonPickupAnnounced = true;
      dispatchSubtitleLine("멋진 풍선이네요!");
    }

    const stringPositions = new Float32Array(6);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(stringPositions, 3));
    const stringLine = new THREE.Line(
      geo,
      new THREE.LineBasicMaterial({ color: 0xffffff }),
    );
    scene.add(stringLine);

    heldBalloon = {
      holder,
      clone,
      mixer,
      offsetVec,
      node: target.node,
      stringLine,
      stringPositions,
    };
    // 캐릭터를 풍선 든 모델로 교체 — 실은 오른손(Hand_R)에서 풍선까지 이어진다
    getCharacter()?.setBalloonHeld?.(true);
  }

  /** @returns {{ node: import("three").Object3D } | null} */
  function getClickedBalloonTarget(clientX, clientY) {
    const camera = getCamera();
    const canvas = getCanvas();
    if (!camera || !canvas || balloonHoverTargets.length === 0) return null;
    const rect = canvas.getBoundingClientRect();
    _pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    _pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    _raycaster.setFromCamera(_pointer, camera);
    for (const target of balloonHoverTargets) {
      if (!target.node.visible) continue;
      const hits = _raycaster.intersectObjects(target.meshes, false);
      if (hits.length > 0) return target;
    }
    return null;
  }

  function registerIslandInteractions(islandModel, animations = []) {
    releaseHeldBalloon();
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
        const isBalloon = BALLOON_CLIP_NAMES.has(name);
        action.setLoop(
          isBalloon ? THREE.LoopPingPong : THREE.LoopRepeat,
          Infinity,
        );
        action.clampWhenFinished = false;
        if (isBalloon) action.timeScale = 2;
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
        anchorWorld,
        hintText: intTarget === "portal" ? "통과!" : "Click!",
        hintVariant: isWell ? "well-side" : "default",
        target: intTarget,
      });
    });

    intRaycastMeshes.push(...meshSet);

    // 풍선 호버 힌트: 클립 트랙에서 노드명 추출 → 메시 레이캐스트 재활성 후 balloonHoverTargets에 저장
    // (applyStage3BackgroundMeshFlags가 먼저 실행되어 비활성화한 raycast를 여기서 복원)
    balloonHoverTargets.length = 0;
    for (const [clipName, hintText] of Object.entries(BALLOON_CLIP_HINT_MAP)) {
      const clip = THREE.AnimationClip.findByName(animations, clipName);
      if (!clip || !clip.tracks.length) continue;
      const firstTrackName = clip.tracks[0].name;
      const dotIdx = firstTrackName.indexOf(".");
      const nodeName = dotIdx > 0 ? firstTrackName.slice(0, dotIdx) : null;
      if (!nodeName) continue;
      const balloonObj = islandModel.getObjectByName(nodeName);
      if (!balloonObj) {
        if (import.meta.env.DEV)
          console.warn(
            `[Balloon hover] 노드 없음: ${nodeName} (clip: ${clipName})`,
          );
        continue;
      }
      balloonObj.updateMatrixWorld(true);
      _camAssistBox.setFromObject(balloonObj);
      if (_camAssistBox.isEmpty()) continue;
      const anchorWorld = new THREE.Vector3(
        (_camAssistBox.min.x + _camAssistBox.max.x) * 0.5,
        _camAssistBox.max.y + STAGE3_INT_CLICK_HINT_OFFSET_Y,
        (_camAssistBox.min.z + _camAssistBox.max.z) * 0.5,
      );
      const meshes = [];
      balloonObj.traverse((child) => {
        if (child.isMesh) {
          child.raycast = THREE.Mesh.prototype.raycast;
          meshes.push(child);
        }
      });
      if (meshes.length > 0) {
        balloonHoverTargets.push({
          meshes,
          hintText,
          anchorWorld,
          node: balloonObj,
          clip, // 잡았을 때도 island sway 애니메이션을 이어 재생
        });
      }
    }

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
    const radiusSq =
      STAGE3_INT_CLICK_HINT_RADIUS * STAGE3_INT_CLICK_HINT_RADIUS;
    let nearest = null;
    let nearestDistSq = Infinity;
    for (let i = 0; i < intProximityTargets.length; i++) {
      const target = intProximityTargets[i];
      const sphere = target.sphere;
      const dx = sphere.center.x - charPos.x;
      const dz = sphere.center.z - charPos.z;
      const distSq = dx * dx + dz * dz;
      if (distSq > radiusSq || distSq >= nearestDistSq) continue;
      nearest = target;
      nearestDistSq = distSq;
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

  function attachBalloonHoverBubble(el) {
    detachBalloonHoverBubble();
    balloonHoverBubbleEl = el;
  }

  function detachBalloonHoverBubble() {
    if (!balloonHoverBubbleEl) return;
    balloonHoverBubbleEl.classList.remove("is-visible");
    balloonHoverBubbleEl = null;
  }

  function resetCameraAssistSmoothing() {
    smoothedCameraYawAssist = 0;
    smoothedCameraYawAssistDemand = 0;
    cameraAssistTargets.length = 0;
    intProximityTargets.length = 0;
  }

  function cleanup() {
    releaseHeldBalloon();
    detachIntClickHintBubble();
    detachBalloonHoverBubble();
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
    if (balloonPickupAudio) {
      balloonPickupAudio.pause();
      balloonPickupAudio.src = "";
      balloonPickupAudio = null;
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
    attachBalloonHoverBubble,
    detachBalloonHoverBubble,
    update(delta) {
      if (islandLoopMixer) islandLoopMixer.update(delta);
      for (const set of clickOnceSets.values()) set.mixer.update(delta);
      updateIntClickHintBubble();
      updatePortalPassTrigger();

      if (heldBalloon) {
        const character = getCharacter();
        // sway 애니메이션 진행 — clone(앵커)의 local translation을 흔든다
        if (heldBalloon.mixer) heldBalloon.mixer.update(delta);
        let hasAnchor = false;
        if (character?.getBalloonHandAnchorWorld?.(_heldStringBottom)) {
          // 실 아래끝 = 오른손(Hand_R), 풍선은 손 위로 떠오른다
          _heldBalloonTop
            .copy(_heldStringBottom)
            .setY(_heldStringBottom.y + HELD_BALLOON_STRING_LENGTH);
          hasAnchor = true;
        } else {
          // 풍선 모델 로딩 전 폴백 — 캐릭터 가슴~머리 위 기준
          const charPos = character?.getPosition?.();
          if (charPos) {
            _heldStringBottom.copy(charPos).setY(charPos.y + 1.0);
            _heldBalloonTop.copy(charPos).setY(charPos.y + 2.5);
            hasAnchor = true;
          }
        }
        if (hasAnchor) {
          // holder를 손 위 목표점으로 — clone의 sway 오프셋은 그대로 유지된다
          heldBalloon.holder.position
            .copy(_heldBalloonTop)
            .sub(heldBalloon.offsetVec);
          heldBalloon.holder.updateMatrixWorld(true);
          // 실 윗끝 = 흔들리는 앵커의 실제 월드 위치
          heldBalloon.clone.getWorldPosition(_heldBalloonActual);
          const sp = heldBalloon.stringPositions;
          sp[0] = _heldStringBottom.x;
          sp[1] = _heldStringBottom.y;
          sp[2] = _heldStringBottom.z;
          sp[3] = _heldBalloonActual.x;
          sp[4] = _heldBalloonActual.y;
          sp[5] = _heldBalloonActual.z;
          heldBalloon.stringLine.geometry.attributes.position.needsUpdate = true;
        }
      }
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
