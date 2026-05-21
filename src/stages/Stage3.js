/**
 * Stage3: 부셔버리자 (밝은 초원, 스트레스 해소) — 오케스트레이터
 *
 * 도메인 로직은 utils/stages/stage3·config/stages/stage3 아래 컨트롤러·설정으로 분리.
 * - letter / monitor / island / interactions / stamp / cameraIntro / portal / bubbles / overlay / input
 */
import * as THREE from "three";
import { getGLBLoader } from "../utils/common/assetLoaders.js";
import { createStageDebugControls } from "../utils/common/stageDebugControls.js";
import { createKeyboardInput } from "../utils/common/keyboardInput.js";
import { loadStage3Background } from "../utils/stages/stage3/backgroundLoader.js";
import { createSkyGradientTexture } from "../utils/stages/stage3/skyGradientTexture.js";
import { applyPortalVortexToModel } from "../utils/stages/stage3/portalVortexMaterial.js";
import { createCharacterController } from "../utils/stages/stage3/characterController.js";
import { createStage3IslandController } from "../utils/stages/stage3/island/stage3IslandController.js";
import { createDeferredStage3SetupScheduler } from "../utils/stages/stage3/scheduleDeferredStage3Setup.js";
import { createStage3LetterController } from "../utils/stages/stage3/letter/stage3LetterController.js";
import { createStage3VendingMachineController } from "../utils/stages/stage3/vendingMachine/stage3VendingMachineController.js";
import { createStage3InteractionsController } from "../utils/stages/stage3/interactions/stage3InteractionsController.js";
import { createStage3StampController } from "../utils/stages/stage3/stamp/stage3StampController.js";
import { createStage3MonitorController } from "../utils/stages/stage3/monitor/stage3MonitorController.js";
import { createStage3CameraIntroController } from "../utils/stages/stage3/cameraIntro/stage3CameraIntroController.js";
import { createStage3PortalController } from "../utils/stages/stage3/portal/stage3PortalController.js";
import { createStage3BubblesController } from "../utils/stages/stage3/bubbles/stage3BubblesController.js";
import { createStage3OverlayController } from "../utils/stages/stage3/overlay/stage3OverlayController.js";
import { createStage3InputController } from "../utils/stages/stage3/input/stage3InputController.js";
import { teardownStage3Scene } from "../utils/stages/stage3/lifecycle/stage3SceneTeardown.js";
import { STAGE3_CONFIG } from "../config/stages/stage3/stage3.js";
import { STAGE3_ENTRY_SUBTITLE_START_DELAY_MS } from "../config/stages/stage3/stage3Stamp.js";
import { STAGE3_MOVEMENT_KEY_CODES } from "../config/stages/stage3/stage3Keyboard.js";
import {
  captureStage3Lighting,
  applyStage3LightingBoost,
} from "../config/stages/stage3/stage3Lighting.js";
import {
  applyStage3CameraShake,
  extendStage3CameraShakeEnd,
} from "../utils/stages/stage3/stage3CameraShake.js";
import {
  closeMinigame,
  dispatchMinigameClose,
} from "../utils/stages/stage3/minigameLauncher.js";
import {
  openGumCardsModal,
  dispatchGumCardsModalClose,
} from "../utils/stages/stage3/gumCardsModalLauncher.js";
import { GUM_CARDS_STICK_EVENT } from "../events/gumCardsEvents.js";
import {
  playStage3IntroAudioTwice,
  startStage3BackgroundAmbientImmediately,
  stopStage3IntroAudio,
} from "../utils/common/stage3IntroAudio.js";
import { disposeNoticePaperAudio } from "../utils/stages/stage3/playNoticePaperSound.js";
import { disposePortalTransitionSound } from "../utils/stages/stage3/playPortalTransitionSound.js";
import { disposeStage3CrackSound } from "../utils/stages/stage3/playCrackSound.js";
import { updateFountain } from "../utils/stages/stage3/fountainEffect.js";
import {
  notifyStage3GpuReady,
  onceStage3Revealed,
  requestStage3Reveal,
  resetStage3RevealGate,
} from "../utils/stages/stage3/stage3RevealGate.js";

/**
 * `skipStage3Intro`가 true면 `/dev` 등에서 상공 카메라·인트로 사운드를 생략한다.
 * @param {{ skipStage3Intro?: boolean }} [options]
 * @returns {import("../types.js").StageInstance}
 */
export function Stage3(options = {}) {
  const skipStage3Intro = options.skipStage3Intro === true;

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
  /** 분수대 물 효과 상태 (셰이프 키 믹서 + UV 스크롤) */
  /** @type {import("../utils/stages/stage3/fountainEffect.js").FountainState | null} */
  let fountainState = null;
  /** 스테이지 전환 시 비동기 로드 완료 후 scene.add 방지용 */
  let isStage3Active = true;
  /** @type {{ toneMappingExposure: number, environmentIntensity: number, renderer: import("three").WebGLRenderer } | null} */
  let stage3LightingRestore = null;

  /**
   * 섬 static collider 리스트 참조. 캐릭터/껌딱지는 setup 시 이 배열 레퍼런스를 보존하므로
   * 런타임에 push/splice 하면 즉시 충돌에 반영된다.
   * @type {import("../utils/stages/stage3/islandStaticColliders.js").IslandColliderAabb[] | null}
   */
  let stage3CollidersRef = null;
  /** 꽃 스폰 제외 박스: INT_/OBJ_/DECO_ 전체 오브젝트 AABB */
  /** @type {{minX:number,maxX:number,minZ:number,maxZ:number}[]|null} */
  let flowerExclusionBoxes = null;

  const deferredSetup = createDeferredStage3SetupScheduler();

  let textDestroyed = false;
  let cameraShakeEndTime = 0;
  const keyboard = createKeyboardInput(STAGE3_MOVEMENT_KEY_CODES);
  let character = null;
  let gumFollowers = null;
  /** @type {import("three").WebGLRenderer | null} */
  let setupRenderer = null;
  /** gumFollowers 생성 전에 도착한 카드 붙이기 이벤트 버퍼 */
  /** @type {string[]} */
  const pendingGumStickCardNums = [];
  /** 껌딱지 init(GLB await) 도중 cleanup 시 scene.add 방지용 */
  let gumCancelled = false;
  /** @type {number | null} */
  let stage3EntrySubtitleTimerId = null;

  function clearStage3EntrySubtitleTimer() {
    if (stage3EntrySubtitleTimerId != null) {
      window.clearTimeout(stage3EntrySubtitleTimerId);
      stage3EntrySubtitleTimerId = null;
    }
  }

  function scheduleStage3EntrySubtitles() {
    clearStage3EntrySubtitleTimer();
    stage3EntrySubtitleTimerId = window.setTimeout(() => {
      stage3EntrySubtitleTimerId = null;
      if (!isStage3Active) return;
      stampController.runEntrySubtitlesAndIntro();
    }, STAGE3_ENTRY_SUBTITLE_START_DELAY_MS);
  }

  function handleGumCardsStickEvent(ev) {
    const cardNum = ev.detail?.cardNum;
    if (typeof cardNum !== "string") return;
    if (gumFollowers?.addStickFollower) {
      gumFollowers.addStickFollower(cardNum);
    } else {
      pendingGumStickCardNums.push(cardNum);
    }
  }
  const _letterHitOriginFallback = new THREE.Vector3(0, 0, 0);

  /** @type {ReturnType<typeof createStage3OverlayController>} */
  let overlayController;

  const portalController = createStage3PortalController({
    getIsStageActive: () => isStage3Active,
  });

  const stampController = createStage3StampController({
    getIsStageActive: () => isStage3Active,
    hasExternalOverlayOpen: () => overlayController.hasExternalOverlayOpen(),
    onCameraShake: (durationSec) => {
      cameraShakeEndTime = extendStage3CameraShakeEnd(
        cameraShakeEndTime,
        durationSec,
      );
    },
    getTextDestroyed: () => textDestroyed,
    setTextDestroyed: (value) => {
      textDestroyed = value;
    },
  });

  const cameraIntroController = createStage3CameraIntroController({
    getCamera: () => cameraRef,
    getCharacter: () => character,
    getConfig: () => config,
    getDebugControls: () => debugControls,
    getIsStageActive: () => isStage3Active,
    onIntroTopViewCommitted: () => {
      if (isStage3Active) playStage3IntroAudioTwice();
    },
  });

  /** @type {ReturnType<typeof createStage3LetterController>} */
  let letterController;

  const monitorController = createStage3MonitorController({
    getIsStageActive: () => isStage3Active,
    canLoadLetter: () => !!(sceneRef && cameraRef && stage3GroundY > 0),
    getHoldFallUntilIntroTopView: () =>
      !cameraIntroController.getState().completed,
    onLoadFromSvgUrl: (svgUrl, worryId, options) => {
      void letterController.loadFromSvgUrl(svgUrl, worryId, options);
    },
    onLoadLatestFromSupabase: (options) => {
      void letterController.loadLatestFromSupabase(options);
    },
  });

  letterController = createStage3LetterController({
    getScene: () => sceneRef,
    getCamera: () => cameraRef,
    getGroundY: () => stage3GroundY,
    getCollidersRef: () => stage3CollidersRef,
    getFlowerExclusionBoxes: () => flowerExclusionBoxes,
    getConfig: () => config,
    getIsStageActive: () => isStage3Active,
    getCameraIntroState: () => cameraIntroController.getState(),
    getAssignedWorry: () => monitorController.getAssignedWorry(),
    getHitOrigin: () => {
      const pos = character?.getPosition?.();
      if (pos) return pos;
      if (cameraRef) return cameraRef.position;
      return _letterHitOriginFallback;
    },
    onShatter: () => stampController.onWorryShatter(),
    onFirstFlowerSpawned: () =>
      stampController.tryDispatchWorryCompletionCelebration(),
    onCameraShake: (durationSec) => {
      cameraShakeEndTime = extendStage3CameraShakeEnd(
        cameraShakeEndTime,
        durationSec,
      );
    },
  });

  const vendingMachineController = createStage3VendingMachineController({
    getScene: () => sceneRef,
    getGroundY: () => stage3GroundY,
    getConfig: () => config,
    getIsStageActive: () => isStage3Active,
    getCharacterPosition: () => character?.getPosition?.() ?? null,
    getCamera: () => cameraRef,
  });

  overlayController = createStage3OverlayController({
    getConfig: () => config,
    getKeyboardKeys: () => keyboard.keys,
    hideInteractionBubbles: () => bubblesController?.hideAll?.(),
    syncStampPanelVisibilityByOverlay: () =>
      stampController.syncStampPanelVisibilityByOverlay(),
    flushQueuedStampStepOnModalClose: (
      /** @type {"notice" | "gameMachine" | "tent"} */ step,
    ) => stampController.flushQueuedStampStepOnModalClose(step),
    flushPendingEggDiscoverySubtitle: () =>
      stampController.flushPendingEggDiscoverySubtitle(),
    isStampPosterZoomOpen: () => stampController.isPosterZoomOpen(),
  });

  const inputController = createStage3InputController({
    hasBlockingOverlayOpen: () => overlayController.hasBlockingOverlayOpen(),
    isStampIntroAnimating: () => stampController.isStampIntroAnimating(),
    isInteractionLocked: () => stampController.isInteractionLocked(),
    onStampKeyToggle: () => stampController.handleStampKeyToggle(),
    onEnterHit: () => onEnterHit(),
    onResetLetterFall: () => letterController.resetFall(),
    isCharacterPunching: () => character?.isPunching?.() ?? false,
  });

  const interactionsController = createStage3InteractionsController({
    getCamera: () => cameraRef,
    getCanvas: () => canvasRef,
    getConfig: () => config,
    getCharacter: () => character,
    getVendingMachineController: () => vendingMachineController,
    getCameraIntroState: () => cameraIntroController.getState(),
    isInteractionBlocked: () =>
      stampController.isStampIntroAnimating() ||
      stampController.isInteractionLocked() ||
      overlayController.hasBlockingOverlayOpen(),
    getPortalTransitionInProgress: () => portalController.isInProgress(),
    isPortalOpenForStageTransition: () => stampController.isPortalOpenReady(),
    onTryEnterPortal: () => {
      const targetStage = config.portal_bright?.targetStage ?? 6;
      portalController.startTransition(targetStage);
    },
    onPortalBlocked: () => stampController.handlePortalBlockedFeedback(),

    tryAdvanceStampSequence: stampController.tryAdvanceStampSequence,

    tryRegisterEasterEggFromRayTarget:
      stampController.tryRegisterEasterEggFromRayTarget,

    dispatchSubtitleLine: stampController.dispatchSubtitleLine,

    showNoticeModal: overlayController.showNoticeModal,
    showGameMachineModal: overlayController.showGameMachineModal,
    openGumCardsModal,
    hideStage3InteractionBubbles: () => bubblesController.hideAll(),
    syncStampPanelVisibilityByOverlay:
      stampController.syncStampPanelVisibilityByOverlay,

    queueStampStepOnModalClose: stampController.queueStampStepOnModalClose,

    flushQueuedStampStepOnModalClose:
      stampController.flushQueuedStampStepOnModalClose,

    flushPendingEggDiscoverySubtitle:
      stampController.flushPendingEggDiscoverySubtitle,

    setPendingEggDiscoverySubtitle:
      stampController.setPendingEggDiscoverySubtitle,
    onGameMachineModalClose: overlayController.onGameMachineModalClose,
    onOpenTentModal: overlayController.onOpenTentModal,
    getDebugControls: () => debugControls,
    getScene: () => sceneRef,
  });

  const bubblesController = createStage3BubblesController({
    getCamera: () => cameraRef,
    getCanvas: () => canvasRef,
    getCharacter: () => character,
    isLetterLanded: () => letterController.isLetterLanded(),
    getLetterGroup: () =>
      /** @type {import("three").Object3D | null} */ (
        letterController.getLetterGroup()
      ),
    getTextDestroyed: () => textDestroyed,
    getGumFollowers: () => gumFollowers,
    hasBlockingOverlayOpen: () => overlayController.hasBlockingOverlayOpen(),
    isStampPanelSettledInCorner: () =>
      stampController.isStampPanelSettledInCorner(),
    attachIntClickHintBubble: (el) =>
      interactionsController.attachIntClickHintBubble(el),
    detachIntClickHintBubble: () =>
      interactionsController.detachIntClickHintBubble(),
    hideIntClickHint: () => interactionsController.hideIntClickHint(),
    attachBalloonHoverBubble: (el) =>
      interactionsController.attachBalloonHoverBubble(el),
    detachBalloonHoverBubble: () =>
      interactionsController.detachBalloonHoverBubble(),
  });

  function ensureStage3UiMounted() {
    stampController.mountStampUi();
    bubblesController.mount();
  }

  function disposeStage3Ui() {
    stampController.disposeStampUi();
    portalController.dispose();
    bubblesController.dispose();
  }

  function onEnterHit() {
    if (!sceneRef) return;
    if (textDestroyed) return;
    const target = letterController.getHitTarget();
    character?.playHammerCue?.(() => {
      if (target) letterController.applyHitEffect(target);
    });
  }

  const islandController = createStage3IslandController({
    getConfig: () => config,
    getIsStageActive: () => isStage3Active,
    isGumCancelled: () => gumCancelled,
    getScene: () => sceneRef,
    getGlbLoader: () => glbLoader,
    getRenderer: () => setupRenderer,
    getCharacter: () => character,
    setCameraRef: (cam) => {
      cameraRef = cam;
    },
    setGroundY: (y) => {
      stage3GroundY = y;
    },
    setCollidersRef: (colliders) => {
      stage3CollidersRef = colliders;
    },
    setFlowerExclusionBoxes: (boxes) => {
      flowerExclusionBoxes = boxes;
    },
    setBackgroundModel: (model) => {
      backgroundModel = model;
    },
    setFountainState: (state) => {
      fountainState = state;
    },
    setPortalVortexMaterial: (material) => {
      portalVortexMaterial = material;
    },
    setGumFollowers: (followers) => {
      gumFollowers = followers;
    },
    drainPendingGumStickCardNums: () =>
      pendingGumStickCardNums.splice(0, pendingGumStickCardNums.length),
    onUiMounted: () => {
      ensureStage3UiMounted();
      stampController.updateStampMarksFilled();
    },
    onDebugOrbitTarget: (center) => {
      debugControls?.setOrbitTarget(center);
    },
    onMonitorBackgroundReady: () => {
      monitorController.onBackgroundReady();
    },
    onCameraIntroStart: (center, bounds) => {
      onceStage3Revealed(() => {
        if (!isStage3Active) return;
        if (skipStage3Intro) {
          Promise.resolve().then(() => {
            if (!isStage3Active) return;
            cameraIntroController.skipToGameplayCamera();
            startStage3BackgroundAmbientImmediately();
            stampController.skipStampEntryPresentationForDev();
          });
          return;
        }
        cameraIntroController.start(center, bounds);
        scheduleStage3EntrySubtitles();
      });
    },
    scheduleDeferredSetup: (task) => deferredSetup.schedule(task),
    registerIslandInteractions: (model, animations) => {
      interactionsController.registerIslandInteractions(
        model,
        /** @type {import("three").AnimationClip[]} */ (animations),
      );
    },
    applyPortalVortex: (model) => applyPortalVortexToModel(model),
    preloadVendingMachine: () => {
      void vendingMachineController.preloadTemplates().catch((e) => {
        if (import.meta.env.DEV) {
          console.warn("[Stage3] 벤딩머신 preload 오류:", e ?? "");
        }
      });
    },
  });

  return {
    camera: null,

    setup(scene, renderer) {
      isStage3Active = true;
      gumCancelled = false;
      clearStage3EntrySubtitleTimer();
      textDestroyed = false;
      stampController.resetForSetup();
      letterController.resetPlayState();
      cameraShakeEndTime = 0;
      stage3LightingRestore = captureStage3Lighting(scene, renderer);
      applyStage3LightingBoost(scene, renderer);

      const canvas = renderer.domElement;
      setupRenderer = renderer;
      sceneRef = scene;
      canvasRef = canvas;

      character = createCharacterController({
        scene,
        glbLoader,
        config,
        getKeys: () => keyboard.keys,
        renderer,
        getCamera: () => this.camera ?? null,
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
      inputController.mount();
      interactionsController.bindCanvas(canvas);
      overlayController.bindSetupListeners();

      window.addEventListener(GUM_CARDS_STICK_EVENT, handleGumCardsStickEvent);

      debugControls = createStageDebugControls({
        scene,
        camera: this.camera,
        domElement: canvas,
        getPropRoots: () => [],
        getPropPath: () => "",
        options: {
          stageName: "stage3",
          getInitialCameraConfig: () => config.camera,
          forceOrbit: false,
          manageCursor: false, // 아이스크림 카트 호버 시 pointer 커서 직접 처리
        },
      });

      // 캔버스가 보여질 때까지 monitor start 지연 (start화면 hidden 상태에서 busy 방지)
      onceStage3Revealed(() => {
        monitorController.startSession();
      });
      // 이미 visible 상태(dev·kiosk 직접 진입)면 즉시 reveal 게이트를 연다.
      if (window.getComputedStyle(canvas).visibility !== "hidden") {
        requestStage3Reveal();
      }

      loadStage3Background({
        scene,
        glbLoader,
        config,
        getIsActive: () => isStage3Active,
        onReady: (payload) => {
          islandController.onBackgroundReady(payload, this.camera);
          // GPU 업로드 워밍업: compileAsync 후 render() 한 번으로 텍스처를 VRAM에 올린다.
          void renderer
            .compileAsync(scene, this.camera)
            .then(() => {
              renderer.render(scene, this.camera);
              notifyStage3GpuReady();
            })
            .catch(() => {
              notifyStage3GpuReady();
            });
        },
      });
    },

    update(delta) {
      interactionsController.update(delta);
      if (debugControls) debugControls.update(delta);
      if (portalVortexMaterial) {
        portalVortexMaterial.uniforms.uTime.value += delta;
      }
      if (fountainState) updateFountain(fountainState, delta);
      cameraIntroController.update(delta);
      letterController.update(delta, this.camera);
      vendingMachineController.update(delta);
      let cameraYawAssistRad = 0;
      if (
        cameraRef &&
        character &&
        cameraIntroController.isReadyForYawAssist()
      ) {
        const charPos = character.getPosition?.();
        if (charPos) {
          cameraYawAssistRad = interactionsController.updateCameraYawAssist(
            delta,
            cameraRef,
            charPos,
            character.getIsMoving?.() ?? false,
          );
        }
      }
      if (character) {
        const cameraIntro = cameraIntroController.getState();
        if (
          overlayController.hasBlockingOverlayOpen() ||
          stampController.isStampIntroAnimating() ||
          stampController.isInteractionLocked() ||
          cameraIntro.active ||
          !cameraIntro.completed
        ) {
          overlayController.clearMovementInputs();
        }
        character.update(delta, this.camera, {
          skipCameraFollow: cameraIntroController.shouldSkipCameraFollow(),
          cameraYawAssistRad,
        });
      }
      if (gumFollowers) {
        gumFollowers.update(delta);
      }

      if (cameraRef) {
        applyStage3CameraShake(cameraRef, cameraShakeEndTime);
      }

      if (cameraRef && canvasRef) {
        bubblesController.update(delta);
      }
    },

    cleanup(scene) {
      isStage3Active = false;
      resetStage3RevealGate();
      clearStage3EntrySubtitleTimer();
      stopStage3IntroAudio();
      gumCancelled = true;
      overlayController.resetForCleanup();
      stampController.cleanup();
      overlayController.unbindSetupListeners();
      window.removeEventListener(
        GUM_CARDS_STICK_EVENT,
        handleGumCardsStickEvent,
      );
      pendingGumStickCardNums.length = 0;
      disposeStage3Ui();
      cameraIntroController.reset();
      interactionsController.resetCameraAssistSmoothing();
      keyboard.unmount();
      inputController.unmount();

      if (character) {
        character.cleanup();
        character = null;
      }
      if (gumFollowers) {
        gumFollowers.cleanup();
        gumFollowers = null;
      }
      if (canvasRef) {
        interactionsController.unbindCanvas(canvasRef);
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
      interactionsController.cleanup();
      disposeNoticePaperAudio();
      disposePortalTransitionSound();
      disposeStage3CrackSound();

      vendingMachineController.cleanup(scene);

      monitorController.cleanup();
      deferredSetup.cancel();

      if (debugControls) {
        debugControls.dispose();
        debugControls = null;
      }

      letterController.cleanup(scene);

      teardownStage3Scene(scene, {
        objects,
        fountainState,
        backgroundModel,
        skyBackgroundTexture,
        stage3LightingRestore,
        onPortalVortexCleared: () => {
          portalVortexMaterial = null;
          backgroundModel = null;
        },
      });
      fountainState = null;
      skyBackgroundTexture = null;
      stage3LightingRestore = null;
    },
  };
}
