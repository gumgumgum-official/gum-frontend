/**
 * Stage3 껌딱지(사이드 캐릭터) 컨트롤러
 * - 유저 좌/우 후방(약 45도 사선) 목표 위치를 계산해 lerp 추종
 * - 유저 이동 중이면 'walk', 정지면 'idle(서있기)' 애니메이션 재생
 * - 유저를 바라보도록 yaw만 회전 제어
 */
import * as THREE from "three";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import {
  loadGltfTemplateCached,
  resolvePublicAssetUrl,
} from "../../common/gltfTemplateCache.js";
import { slideMoveXZAgainstAABBs } from "./islandStaticColliders.js";
import { GUM_CARD_STICK_FOLLOWER_BY_NUM } from "../../../config/gumCardStickFollowers.js";

/**
 * @param {{
 *   scene: import("three").Scene,
 *   glbLoader: ReturnType<import("../../common/assetLoaders.js").getGLBLoader>,
 *   config: import("../../../types.js").Stage3Config,
 *   getUserState: () => { position: import("three").Vector3|null, yaw: number|null, moving: boolean },
 *   getHeadAnchorWorld?: (out: import("three").Vector3) => boolean,
 *   renderer?: import("three").WebGLRenderer | null,
 *   getCamera?: () => import("three").Camera | null,
 * }} params
 */
export function createGumFollowersController({
  scene,
  glbLoader,
  config,
  getUserState,
  getHeadAnchorWorld = null,
  renderer = null,
  getCamera = null,
}) {
  void glbLoader;
  const gumCfg = config.character?.gumFollowers ?? null;
  const gumModelCfg = gumCfg?.models;
  /** @type {(import("../../../types.js").Stage3GumFollowerBehaviorConfig & { animationBaseBoost?: number; collisionRadius?: number }) | undefined} */
  const gumBehaviorCfg = gumCfg?.behavior;

  const modelPath =
    gumModelCfg?.modelPath ?? "/models/common/gum/gum_walk_final.glb";
  const idleModelPath =
    gumModelCfg?.idleModelPath ?? "/models/common/gum/gum_idle.glb";
  const distance = gumBehaviorCfg?.distance ?? 2.2;
  const angleDeg = gumBehaviorCfg?.angleDeg ?? 45;
  const followLerpFactor = gumBehaviorCfg?.followLerpFactor ?? 8;
  const turnLerpFactor = gumBehaviorCfg?.turnLerpFactor ?? 10;
  const facingLerpFactor = gumBehaviorCfg?.facingLerpFactor ?? 6;
  const _lookAtHeightOffset = gumBehaviorCfg?.lookAtHeightOffset ?? 0.9;
  const modelScale = gumModelCfg?.scale ?? 1;

  // 캐릭터가 작아지면(스케일 다운) 보폭 대비 발놀림이 부족해 보이므로,
  // 유저보다 사이클이 더 자주 돌게 기본 보정 계수를 추가한다.
  const animationBaseBoost = gumBehaviorCfg?.animationBaseBoost ?? 1.35;
  const animationSpeed =
    gumBehaviorCfg?.animationSpeed ??
    (modelScale !== 0
      ? (animationBaseBoost * 1) / modelScale
      : animationBaseBoost);

  const groundOffsetOverride = gumBehaviorCfg?.groundOffset ?? null;
  const breakOffCfg = gumBehaviorCfg?.breakOff ?? null;
  const breakOffEnabled = breakOffCfg?.enabled ?? false;
  const breakOffYawThresholdDeg = breakOffCfg?.yawThresholdDeg ?? 120;
  const breakOffDurationSec = breakOffCfg?.durationSec ?? 0.55;
  const breakOffDistanceMultiplier = breakOffCfg?.distanceMultiplier ?? 1.35;
  const breakOffFollowLerpMultiplier =
    breakOffCfg?.followLerpMultiplier ?? 0.35;
  const breakOffDriftAmplitude = breakOffCfg?.driftAmplitude ?? 0.55;
  const collisionRadius = gumBehaviorCfg?.collisionRadius ?? 0.48;

  const groundOffset =
    groundOffsetOverride ?? config.character?.groundOffset ?? 0;

  /** Stage2 `createStage2GumSpeechBubbles` 기본값과 동일 — AABB 중심에서 위로 높이×비율 */
  const bubbleOffsetY = gumBehaviorCfg?.bubbleOffsetY ?? 0.85;

  /** @type {string[]} */
  const stickQueue = [];
  const attachedStickCards = new Set();
  const loadingStickCards = new Set();
  /** 스틱 껌 비동기 로드가 겹칠 때 이전 로드 결과를 버리기 위한 토큰 */
  let stickLoadToken = 0;

  function disposeStickFollowerEntry(f) {
    scene.remove(f.model);
    if (f.idleModel) scene.remove(f.idleModel);
    f.mixer.stopAllAction();
    if (f.idleMixer) f.idleMixer.stopAllAction();
  }

  /** id `S` + 숫자 카드 전용 — 기존 스틱 1마리 제거(교체 붙이기) */
  function removeAllStickCardFollowers() {
    for (let i = followers.length - 1; i >= 0; i--) {
      const f = followers[i];
      if (!/^S\d+$/.test(String(f.id ?? ""))) continue;
      disposeStickFollowerEntry(f);
      followers.splice(i, 1);
    }
    attachedStickCards.clear();
    for (const k of [...loadingStickCards]) {
      if (GUM_CARD_STICK_FOLLOWER_BY_NUM[k]) loadingStickCards.delete(k);
    }
  }

  /**
   * @type {{ id: string, side: -1|0|1, model: THREE.Group, idleModel: THREE.Group|null, mixer: THREE.AnimationMixer, idleMixer: THREE.AnimationMixer|null, walkAction: THREE.AnimationAction|null, idleAction: THREE.AnimationAction|null, offsetYaw: number|null, breakDriftScalar: number, resolvedGroundY: number, groundMissFrames: number, modelGroundLift: number, pendingInitialAlign: boolean, attachMode?: 'headFloat', headFloat?: { headLocalOffset: THREE.Vector3, floatAmplitudeM: number, floatFrequencyHz: number, cameraFaceYawOffsetDeg: number, tiltForwardDeg: number, headingYawEase: number, headFallbackYOffsetM: number, floatPhase: number }, walkInIntroActive?: boolean, walkInIntroAwaitModalClose?: boolean, walkInIntroApproachLerp?: number, walkInIntroMaxSpeedMps?: number, walkInIntroArriveRadiusM?: number, slotDistance?: number, slotFollowLerpFactor?: number, slotFacingLerpFactor?: number, slotAngleDeg?: number|null, _devStickIntroStartedAt?: number }[]}
   */
  const followers = [];

  /** setFromObject AABB 실패 시 루트 Y + 이 값(로드 시 box.max.y 기준) */
  let followerBubbleFallbackHeadY = 1.1;
  let isReady = false;

  // 매 프레임 재사용 (GC 방지)
  const _target = new THREE.Vector3();
  const _userPos = new THREE.Vector3();
  const _dir = new THREE.Vector3();
  const _look = new THREE.Vector3();
  const _bubbleBox = new THREE.Box3();
  const _bubbleSize = new THREE.Vector3();
  const _groundRaycaster = new THREE.Raycaster();
  const _groundRayOrigin = new THREE.Vector3();
  const _groundDown = new THREE.Vector3(0, -1, 0);
  const _groundHits = [];
  const GROUND_MISS_TOLERANCE_FRAMES = 5;
  const GROUND_HEIGHT_EASE_SPEED = 16;

  const _stickHeadAnchor = new THREE.Vector3();
  const _stickHeadOffsetLocal = new THREE.Vector3();
  const _stickHeadFloatBob = new THREE.Vector3();
  const _stickRotYawMat = new THREE.Matrix4();

  let isMovingPrev = false;
  let elapsedSec = 0;
  let breakOffUntil = 0;
  let prevUserYaw = null;
  /** true면 다음 update에서 유저 기준 목표 위치/각도로 한 번에 맞춤(월드 0,0에서 lerp로 끌려 오는 현상 방지) */
  let pendingInitialWorldAlign = true;
  let baseGroundY = 0;
  /** @type {import("three").Mesh[]} */
  let walkableGroundMeshes = [];
  /** @type {import("./islandStaticColliders.js").IslandColliderAabb[]} */
  let staticColliderBoxes = [];

  /**
   * @param {{
   *   id: string,
   *   side: -1 | 0 | 1,
   *   baseModel: THREE.Object3D,
   *   baseIdleModel: THREE.Object3D | null,
   *   walkClip: THREE.AnimationClip | null,
   *   idleClipFromIdleModel: THREE.AnimationClip | null,
   *   idleClipFromWalkModel: THREE.AnimationClip | null,
   *   animSpeed: number,
   *   breakDriftScalar: number,
   *   spawnBackgroundY: number,
   *   pendingInitialAlign?: boolean,
   *   slotDistance?: number,
   *   slotFollowLerpFactor?: number,
   *   slotFacingLerpFactor?: number,
   *   slotAngleDeg?: number | null,
   *   initialXZ?: { x: number, z: number } | null,
   *   walkInIntroActive?: boolean,
   *   walkInIntroAwaitModalClose?: boolean,
   *   walkInIntroApproachLerp?: number,
   *   walkInIntroMaxSpeedMps?: number,
   *   walkInIntroArriveRadiusM?: number,
   * }} p
   */
  function appendOneFollower(p) {
    const model = SkeletonUtils.clone(p.baseModel);
    const idleModel = p.baseIdleModel
      ? SkeletonUtils.clone(p.baseIdleModel)
      : null;
    model.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    if (idleModel) {
      idleModel.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
    }

    const liftBox = new THREE.Box3().setFromObject(model);
    const minY = liftBox.min.y;
    const modelGroundLift = -minY + groundOffset;
    const spawnY = p.spawnBackgroundY - minY + groundOffset;

    const mixer = new THREE.AnimationMixer(model);
    const walkAction = p.walkClip ? mixer.clipAction(p.walkClip) : null;
    let idleMixer = null;
    let idleAction = null;
    if (idleModel && p.idleClipFromIdleModel) {
      idleMixer = new THREE.AnimationMixer(idleModel);
      idleAction = idleMixer.clipAction(p.idleClipFromIdleModel);
    } else if (p.idleClipFromWalkModel) {
      idleAction = mixer.clipAction(p.idleClipFromWalkModel);
    }
    if (walkAction) {
      walkAction.loop = THREE.LoopRepeat;
      walkAction.timeScale = p.animSpeed;
      walkAction.play();
      walkAction.paused = true;
    }
    if (idleAction) {
      idleAction.loop = THREE.LoopRepeat;
      idleAction.timeScale = p.animSpeed;
      idleAction.play();
      idleAction.paused = false;
    }

    const entry = {
      id: p.id,
      side: p.side,
      model,
      idleModel,
      mixer,
      idleMixer,
      walkAction,
      idleAction,
      offsetYaw: null,
      breakDriftScalar: p.breakDriftScalar,
      resolvedGroundY: p.spawnBackgroundY,
      groundMissFrames: 0,
      modelGroundLift,
      pendingInitialAlign: Boolean(p.pendingInitialAlign),
    };
    if (p.walkInIntroActive) entry.walkInIntroActive = true;
    if (p.walkInIntroAwaitModalClose) entry.walkInIntroAwaitModalClose = true;
    if (p.walkInIntroApproachLerp != null)
      entry.walkInIntroApproachLerp = p.walkInIntroApproachLerp;
    if (p.walkInIntroMaxSpeedMps != null)
      entry.walkInIntroMaxSpeedMps = p.walkInIntroMaxSpeedMps;
    if (p.walkInIntroArriveRadiusM != null)
      entry.walkInIntroArriveRadiusM = p.walkInIntroArriveRadiusM;
    if (p.slotDistance != null) entry.slotDistance = p.slotDistance;
    if (p.slotFollowLerpFactor != null)
      entry.slotFollowLerpFactor = p.slotFollowLerpFactor;
    if (p.slotFacingLerpFactor != null)
      entry.slotFacingLerpFactor = p.slotFacingLerpFactor;
    if (p.slotAngleDeg != null) entry.slotAngleDeg = p.slotAngleDeg;

    followers.push(entry);

    scene.add(model);
    if (idleModel) scene.add(idleModel);
    if (p.initialXZ) {
      model.position.x = p.initialXZ.x;
      model.position.z = p.initialXZ.z;
    }
    model.position.y = spawnY;
    if (idleModel) {
      idleModel.position.x = model.position.x;
      idleModel.position.z = model.position.z;
      idleModel.position.y = spawnY;
      idleModel.visible = true;
      model.visible = false;
    }
  }

  /**
   * 카드 스틱: idle GLB만 — 머리 위 비행
   * @param {{
   *   id: string,
   *   baseModel: THREE.Object3D,
   *   idleClip: THREE.AnimationClip | null,
   *   animSpeed: number,
   *   headFloat: {
   *     headLocalOffset: THREE.Vector3,
   *     floatAmplitudeM: number,
   *     floatFrequencyHz: number,
   *     cameraFaceYawOffsetDeg: number,
   *     tiltForwardDeg: number,
   *     headingYawEase: number,
   *     headFallbackYOffsetM: number,
   *     floatPhase: number,
   *   },
   * }} p
   */
  function appendHeadFloatStickFollower(p) {
    const model = SkeletonUtils.clone(p.baseModel);
    model.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    const mixer = new THREE.AnimationMixer(model);
    let idleAction = null;
    if (p.idleClip) {
      idleAction = mixer.clipAction(p.idleClip);
      idleAction.loop = THREE.LoopRepeat;
      idleAction.timeScale = p.animSpeed;
      idleAction.play();
    }

    followers.push({
      id: p.id,
      side: 0,
      attachMode: "headFloat",
      model,
      idleModel: null,
      mixer,
      idleMixer: null,
      walkAction: null,
      idleAction,
      offsetYaw: null,
      breakDriftScalar: 0,
      resolvedGroundY: baseGroundY,
      groundMissFrames: 0,
      modelGroundLift: 0,
      pendingInitialAlign: false,
      headFloat: p.headFloat,
    });
    scene.add(model);
  }

  async function loadAndAddStickFollower(cardNum) {
    const spec = GUM_CARD_STICK_FOLLOWER_BY_NUM[cardNum];
    if (!spec) return;
    if (attachedStickCards.has(cardNum) || loadingStickCards.has(cardNum)) {
      return;
    }
    stickLoadToken += 1;
    const token = stickLoadToken;
    removeAllStickCardFollowers();
    loadingStickCards.add(cardNum);
    const loadStartedAt = import.meta.env.DEV
      ? (globalThis.performance?.now?.() ?? 0)
      : 0;
    try {
      const beh = spec.behavior ?? {};
      const attachMode =
        beh.attachMode === "headFloat" ? "headFloat" : "groundFollow";

      if (attachMode === "headFloat") {
        const relIdle = spec.idleModelPath ?? spec.modelPath;
        if (!relIdle) {
          if (import.meta.env.DEV) {
            console.warn(
              `[GumFollowers] headFloat spec needs idleModelPath (card ${cardNum})`,
            );
          }
          return;
        }
        const idlePath = resolvePublicAssetUrl(relIdle);
        const idleGltf = await loadGltfTemplateCached(idlePath);
        if (!isReady) return;
        if (token !== stickLoadToken) return;

        const baseIdle = idleGltf.scene;
        const scale = spec.scale ?? modelScale;
        if (scale !== 1) baseIdle.scale.setScalar(scale);

        const idleClips = idleGltf.animations ?? [];
        const findClipByName = (arr, regex) =>
          arr.find((clip) => regex.test(String(clip?.name ?? ""))) ?? null;
        const idleClip =
          findClipByName(idleClips, /idle|stand|wait|pose|breath|rest/i) ??
          idleClips[0] ??
          null;
        const animSpeed =
          beh.animationSpeed != null
            ? beh.animationSpeed
            : scale !== 0
              ? (animationBaseBoost * 1) / scale
              : animationBaseBoost;

        const hlo = beh.headLocalOffset;
        const ox = Array.isArray(hlo) ? hlo[0] : 0;
        const oy = Array.isArray(hlo) ? hlo[1] : 0.4;
        const oz = Array.isArray(hlo) ? hlo[2] : 0;
        const headFloat = {
          headLocalOffset: new THREE.Vector3(ox, oy, oz),
          floatAmplitudeM: beh.floatAmplitudeM ?? 0.06,
          floatFrequencyHz: beh.floatFrequencyHz ?? 0.5,
          cameraFaceYawOffsetDeg: beh.cameraFaceYawOffsetDeg ?? 0,
          tiltForwardDeg: beh.tiltForwardDeg ?? 0,
          headingYawEase: beh.headingYawEase ?? 2.75,
          headFallbackYOffsetM: beh.headFallbackYOffsetM ?? 1.6,
          floatPhase: Math.random() * Math.PI * 2,
        };

        if (token !== stickLoadToken) return;

        appendHeadFloatStickFollower({
          id: `S${cardNum}`,
          baseModel: baseIdle,
          idleClip,
          animSpeed,
          headFloat,
        });

        if (import.meta.env.DEV) {
          console.debug("[GumFollowers] stick head-float appended", {
            cardNum,
            msAfterLoadStart: Math.round(
              (globalThis.performance?.now?.() ?? 0) - loadStartedAt,
            ),
          });
        }
        attachedStickCards.add(cardNum);
        return;
      }

      if (!spec.modelPath) {
        if (import.meta.env.DEV) {
          console.warn(
            `[GumFollowers] groundFollow needs modelPath (card ${cardNum})`,
          );
        }
        return;
      }

      const scale = spec.scale ?? modelScale;
      const walkPath = resolvePublicAssetUrl(spec.modelPath);
      const idleRel = spec.idleModelPath ?? idleModelPath;
      const idlePath = resolvePublicAssetUrl(idleRel);
      const [gltf, idleGltf] = await Promise.all([
        loadGltfTemplateCached(walkPath),
        loadGltfTemplateCached(idlePath).catch(() => null),
      ]);
      if (!isReady) return;
      if (token !== stickLoadToken) return;

      const baseWalk = gltf.scene;
      const baseIdle = idleGltf?.scene ?? null;
      if (scale !== 1) {
        baseWalk.scale.setScalar(scale);
        if (baseIdle) baseIdle.scale.setScalar(scale);
      }

      const clips = gltf.animations ?? [];
      const idleClips = idleGltf?.animations ?? [];
      const findClipByName = (arr, regex) =>
        arr.find((clip) => regex.test(String(clip?.name ?? ""))) ?? null;
      const walkClip =
        findClipByName(clips, /walk|run|move/i) ?? clips[0] ?? null;
      const idleClipFromIdleModel =
        findClipByName(idleClips, /idle|stand|wait|pose|breath|rest/i) ??
        idleClips[0] ??
        null;
      const idleClipFromWalkModel =
        findClipByName(clips, /idle|stand|wait|pose/i) ?? null;

      const side =
        typeof beh.side === "number" && beh.side >= -1 && beh.side <= 1
          ? beh.side
          : 1;
      const breakDrift = side === 0 ? 0 : side * breakOffDriftAmplitude;
      const animSpeed =
        beh.animationSpeed != null
          ? beh.animationSpeed
          : scale !== 0
            ? (animationBaseBoost * 1) / scale
            : animationBaseBoost;

      const introSpawnExtraM = beh.introSpawnExtraM ?? 22;
      const introApproachLerp = beh.introApproachLerpFactor ?? 1.35;
      const introMaxSpeedMps = beh.introApproachMaxSpeedMps ?? 1.65;
      const introArriveRadiusM = beh.introArriveRadiusM ?? 0.88;
      const slotDistForSpawn = beh.distance ?? distance;

      const us = getUserState();
      let initialXZ = null;
      let useWalkInIntro = false;
      if (
        us.position &&
        us.yaw != null &&
        Number.isFinite(us.position.x) &&
        Number.isFinite(us.position.z)
      ) {
        const spawnYaw = computeOffsetYaw(
          us.yaw,
          side,
          beh.angleDeg != null ? beh.angleDeg : undefined,
        );
        const s = Math.sin(spawnYaw);
        const c = Math.cos(spawnYaw);
        const distAlong = slotDistForSpawn + introSpawnExtraM;
        initialXZ = {
          x: us.position.x + s * distAlong,
          z: us.position.z + c * distAlong,
        };
        useWalkInIntro = true;
      }

      const appendOpts = {
        id: `S${cardNum}`,
        side,
        baseModel: baseWalk,
        baseIdleModel: baseIdle,
        walkClip,
        idleClipFromIdleModel,
        idleClipFromWalkModel,
        animSpeed,
        breakDriftScalar: breakDrift,
        spawnBackgroundY: baseGroundY,
        pendingInitialAlign: !useWalkInIntro,
        walkInIntroActive: useWalkInIntro,
        walkInIntroApproachLerp: introApproachLerp,
        walkInIntroMaxSpeedMps: introMaxSpeedMps,
        walkInIntroArriveRadiusM: introArriveRadiusM,
        initialXZ,
      };
      if (beh.distance != null) appendOpts.slotDistance = beh.distance;
      if (beh.followLerpFactor != null)
        appendOpts.slotFollowLerpFactor = beh.followLerpFactor;
      if (beh.facingLerpFactor != null)
        appendOpts.slotFacingLerpFactor = beh.facingLerpFactor;
      if (beh.angleDeg != null) appendOpts.slotAngleDeg = beh.angleDeg;

      if (token !== stickLoadToken) return;

      appendOneFollower(appendOpts);
      if (import.meta.env.DEV) {
        const fe = followers[followers.length - 1];
        if (fe)
          fe._devStickIntroStartedAt = globalThis.performance?.now?.() ?? 0;
        console.debug("[GumFollowers] stick appended", {
          cardNum,
          useWalkInIntro,
          msAfterLoadStart: Math.round(
            (globalThis.performance?.now?.() ?? 0) - loadStartedAt,
          ),
          introSpawnExtraM,
          slotDistForSpawn,
        });
        if (!useWalkInIntro) {
          console.debug(
            "[GumFollowers] stick walk-in skipped (no user pos/yaw at load end) → slot snap",
          );
        }
      }
      attachedStickCards.add(cardNum);
    } catch (e) {
      if (import.meta.env.DEV) {
        console.warn("[GumFollowers] stick follower load failed:", e);
      }
    } finally {
      loadingStickCards.delete(cardNum);
    }
  }

  function addStickFollower(cardNum) {
    if (!GUM_CARD_STICK_FOLLOWER_BY_NUM[cardNum]) {
      if (import.meta.env.DEV) {
        console.warn(
          `[GumFollowers] no stick follower spec for card ${cardNum}`,
        );
      }
      return;
    }
    if (attachedStickCards.has(cardNum) || loadingStickCards.has(cardNum)) {
      return;
    }
    if (!isReady) {
      stickQueue.push(cardNum);
      return;
    }
    void loadAndAddStickFollower(cardNum);
  }

  function lerpAngle(from, to, t) {
    // 각도 차이를 [-PI, PI]로 정규화한 뒤 t만큼 이동 (% 는 음수 나머지를 줄 수 있어 euclideanModulo 사용)
    const diff =
      THREE.MathUtils.euclideanModulo(to - from + Math.PI, Math.PI * 2) -
      Math.PI;
    return from + diff * t;
  }

  function angleDiff(from, to) {
    // from→to 각도 차이를 [-PI, PI] 범위로 정규화
    return (
      THREE.MathUtils.euclideanModulo(to - from + Math.PI, Math.PI * 2) -
      Math.PI
    );
  }

  /**
   * @param {{
   *   backgroundMaxY?: number,
   *   isCancelled?: () => boolean,
   *   staticColliderBoxes?: import("./islandStaticColliders.js").IslandColliderAabb[],
   *   walkableMeshes?: import("three").Mesh[],
   * }} [opts]
   */
  async function init({
    backgroundMaxY,
    isCancelled,
    staticColliderBoxes: colliderBoxes = [],
    walkableMeshes = [],
  } = {}) {
    if (isReady) return;
    if (backgroundMaxY == null) {
      throw new Error("[GumFollowers] init requires backgroundMaxY");
    }
    staticColliderBoxes = Array.isArray(colliderBoxes) ? colliderBoxes : [];
    walkableGroundMeshes = Array.isArray(walkableMeshes) ? walkableMeshes : [];
    baseGroundY = backgroundMaxY;

    const fullPath = resolvePublicAssetUrl(modelPath);
    const idleFullPath = resolvePublicAssetUrl(idleModelPath);
    const [gltf, idleGltf] = await Promise.all([
      loadGltfTemplateCached(fullPath),
      loadGltfTemplateCached(idleFullPath).catch(() => null),
    ]);
    if (isCancelled?.()) return;
    const baseModel = gltf.scene;
    const baseIdleModel = idleGltf?.scene ?? null;

    // 원하는 크기로 먼저 스케일을 적용해야, minY 기반 y 보정도 맞게 계산됩니다.
    if (modelScale !== 1) {
      baseModel.scale.setScalar(modelScale);
      if (baseIdleModel) baseIdleModel.scale.setScalar(modelScale);
    }

    // y position 보정: 모델 바운딩(minY) 기준
    const box = new THREE.Box3().setFromObject(baseModel);
    followerBubbleFallbackHeadY = Math.max(0.25, box.max.y + 0.08);

    /** @type {readonly { id: "A" | "B"; side: -1 | 1 }[]} */
    const clones = [
      // A: 좌측 후방(뒤쪽 기준 -45도)
      { id: "A", side: -1 },
      // B: 우측 후방(뒤쪽 기준 +45도)
      { id: "B", side: 1 },
    ];

    const clips = gltf.animations ?? [];
    const idleClips = idleGltf?.animations ?? [];
    const findClipByName = (regex) =>
      clips.find((clip) => regex.test(String(clip?.name ?? ""))) ?? null;
    const findIdleClipByName = (regex) =>
      idleClips.find((clip) => regex.test(String(clip?.name ?? ""))) ?? null;
    const walkClip = findClipByName(/walk|run|move/i) ?? clips[0] ?? null;
    const idleClipFromIdleModel =
      findIdleClipByName(/idle|stand|wait|pose|breath|rest/i) ??
      idleClips[0] ??
      null;
    const idleClipFromWalkModel =
      findClipByName(/idle|stand|wait|pose/i) ?? null;

    clones.forEach(({ id, side }) => {
      appendOneFollower({
        id,
        side,
        baseModel,
        baseIdleModel,
        walkClip,
        idleClipFromIdleModel,
        idleClipFromWalkModel,
        animSpeed: animationSpeed,
        breakDriftScalar: side * breakOffDriftAmplitude,
        spawnBackgroundY: backgroundMaxY,
        pendingInitialAlign: false,
      });
    });
    const prewarmCamera = getCamera?.();
    if (renderer && prewarmCamera) {
      if (typeof renderer.compileAsync === "function") {
        void renderer.compileAsync(scene, prewarmCamera).catch(() => {});
      } else {
        renderer.compile(scene, prewarmCamera);
      }
    }

    isReady = true;
    pendingInitialWorldAlign = true;

    const queuedStick = stickQueue.splice(0, stickQueue.length);
    for (const cn of queuedStick) {
      if (typeof cn === "string" && !attachedStickCards.has(cn))
        void loadAndAddStickFollower(cn);
    }
  }

  function computeOffsetYaw(userYaw, side, slotAngleDegOverride) {
    if (side === 0) {
      return userYaw + Math.PI;
    }
    const ang =
      slotAngleDegOverride != null && Number.isFinite(slotAngleDegOverride)
        ? slotAngleDegOverride
        : angleDeg;
    const angleRad = THREE.MathUtils.degToRad(ang);
    return userYaw + Math.PI + side * angleRad;
  }

  function updateFollowerFacingTo(lookTarget, follower, delta, facingFactor) {
    const fFac = facingFactor ?? facingLerpFactor;
    _look.copy(lookTarget).sub(follower.model.position);
    _look.y = 0;
    if (_look.lengthSq() < 1e-6) return;
    const yaw = Math.atan2(_look.x, _look.z);
    const tFace = Math.min(1, fFac * delta);
    follower.model.rotation.y = lerpAngle(
      follower.model.rotation.y,
      yaw,
      tFace,
    );
  }

  function setFollowerFacingInstant(lookTarget, follower) {
    _look.copy(lookTarget).sub(follower.model.position);
    _look.y = 0;
    if (_look.lengthSq() < 1e-6) return;
    follower.model.rotation.y = Math.atan2(_look.x, _look.z);
  }

  function updateHeadFloatFollower(f, delta, userPos, userYaw) {
    const hf = f.headFloat;
    if (!hf) return;
    const haveHead =
      typeof getHeadAnchorWorld === "function" &&
      getHeadAnchorWorld(_stickHeadAnchor);
    if (!haveHead) {
      _stickHeadAnchor.copy(userPos);
      _stickHeadAnchor.y += hf.headFallbackYOffsetM;
    }
    _stickHeadOffsetLocal.copy(hf.headLocalOffset);
    _stickRotYawMat.identity().makeRotationY(userYaw);
    _stickHeadOffsetLocal.applyMatrix4(_stickRotYawMat);
    _stickHeadAnchor.add(_stickHeadOffsetLocal);

    const w = hf.floatFrequencyHz * Math.PI * 2;
    const t = elapsedSec * w + hf.floatPhase;
    const amp = hf.floatAmplitudeM;
    _stickHeadFloatBob.set(
      Math.cos(t * 0.9) * amp * 0.85,
      Math.sin(t * 1.1) * amp,
      Math.sin(t * 0.75) * amp * 0.65,
    );
    f.model.position.copy(_stickHeadAnchor).add(_stickHeadFloatBob);

    f.mixer.update(delta);

    // 유저와 같은 방향 (+ 모델 정렬용 yaw); 지수 이징으로 천천히 맞춤
    const targetYaw =
      userYaw + THREE.MathUtils.degToRad(hf.cameraFaceYawOffsetDeg ?? 0);
    const yawEase = hf.headingYawEase ?? 2.75;
    const turnYaw = 1 - Math.exp(-yawEase * delta);
    f.model.rotation.y = lerpAngle(f.model.rotation.y, targetYaw, turnYaw);

    const tiltRad = THREE.MathUtils.degToRad(hf.tiltForwardDeg ?? 0);
    const turnTilt = Math.min(1, 10 * delta);
    f.model.rotation.x = THREE.MathUtils.lerp(
      f.model.rotation.x,
      tiltRad,
      turnTilt,
    );
    f.model.rotation.z = THREE.MathUtils.lerp(f.model.rotation.z, 0, turnTilt);
  }

  return {
    init,
    addStickFollower,
    update(delta) {
      if (!isReady) return;

      elapsedSec += delta;
      const easeAlpha = 1 - Math.exp(-GROUND_HEIGHT_EASE_SPEED * delta);

      const userState = getUserState();
      const userPos = userState.position;
      const userYaw = userState.yaw;
      const moving = userState.moving;

      if (!userPos || userYaw == null) return;

      if (breakOffEnabled) {
        if (prevUserYaw != null) {
          const dyaw = Math.abs(angleDiff(prevUserYaw, userYaw));
          const thr = THREE.MathUtils.degToRad(breakOffYawThresholdDeg);
          if (dyaw > thr) {
            breakOffUntil = elapsedSec + breakOffDurationSec;
          }
        }
        prevUserYaw = userYaw;
      }

      const sampleGroundY = (x, z) => {
        if (!walkableGroundMeshes.length) return null;
        _groundRayOrigin.set(x, baseGroundY + 30, z);
        _groundRaycaster.set(_groundRayOrigin, _groundDown);
        _groundHits.length = 0;
        _groundRaycaster.intersectObjects(
          walkableGroundMeshes,
          false,
          _groundHits,
        );
        return _groundHits.length > 0 ? _groundHits[0].point.y : null;
      };

      // 이동 상태가 바뀔 때만 walk/idle 토글을 수행한다.
      // 첫 유저 좌표 스냅 프레임은 이전 tick과 무관하므로 한 번 강제 동기화
      if (
        isMovingPrev !== moving ||
        pendingInitialWorldAlign ||
        followers.some(
          (x) =>
            x.attachMode !== "headFloat" &&
            (x.pendingInitialAlign || x.walkInIntroActive),
        )
      ) {
        followers.forEach((f) => {
          if (f.attachMode === "headFloat") return;
          const showWalk =
            moving ||
            (Boolean(f.walkInIntroActive) && !f.walkInIntroAwaitModalClose);
          if (showWalk) {
            f.model.visible = true;
            if (f.idleModel) f.idleModel.visible = false;
            if (f.walkAction) f.walkAction.paused = false;
            if (f.idleAction) f.idleAction.paused = true;
          } else {
            f.model.visible = !f.idleModel;
            if (f.idleModel) {
              f.idleModel.visible = true;
            }
            if (f.walkAction) f.walkAction.paused = true;
            if (f.idleAction) f.idleAction.paused = false;
          }
        });
        isMovingPrev = moving;
      }

      _userPos.copy(userPos);

      followers.forEach((f) => {
        if (f.attachMode === "headFloat") {
          updateHeadFloatFollower(f, delta, _userPos, userYaw);
          return;
        }

        const instantAlignThis =
          pendingInitialWorldAlign ||
          (f.pendingInitialAlign && !f.walkInIntroActive);
        const breaking = breakOffEnabled && elapsedSec < breakOffUntil;

        const desiredOffsetYaw = computeOffsetYaw(
          userYaw,
          f.side,
          f.slotAngleDeg,
        );
        if (f.offsetYaw == null || instantAlignThis) {
          f.offsetYaw = desiredOffsetYaw;
        } else {
          const ty = Math.min(1, turnLerpFactor * delta);
          f.offsetYaw = lerpAngle(f.offsetYaw, desiredOffsetYaw, ty);
        }

        _dir.set(Math.sin(f.offsetYaw), 0, Math.cos(f.offsetYaw));
        const baseD = f.slotDistance ?? distance;
        const dynDistance = breaking
          ? baseD * breakOffDistanceMultiplier
          : baseD;
        _target.copy(_userPos).addScaledVector(_dir, dynDistance);

        if (breaking) {
          // dir 기준으로 90deg 회전한 "옆" 방향으로 벌어짐
          const perpX = _dir.z;
          const perpZ = -_dir.x;
          _target.x += perpX * f.breakDriftScalar;
          _target.z += perpZ * f.breakDriftScalar;
        }

        const faceFac = f.slotFacingLerpFactor ?? facingLerpFactor;

        if (f.walkInIntroActive) {
          if (f.walkInIntroAwaitModalClose) {
            const sampledHold = sampleGroundY(
              f.model.position.x,
              f.model.position.z,
            );
            if (sampledHold != null) {
              f.groundMissFrames = 0;
              f.resolvedGroundY = sampledHold;
            } else {
              f.groundMissFrames += 1;
              if (f.groundMissFrames >= GROUND_MISS_TOLERANCE_FRAMES) {
                f.resolvedGroundY = baseGroundY;
              }
            }
            const liftHold = f.modelGroundLift;
            const targetYHold = f.resolvedGroundY + liftHold;
            f.model.position.y = THREE.MathUtils.lerp(
              f.model.position.y,
              targetYHold,
              easeAlpha,
            );
            if (f.idleModel) f.idleModel.position.copy(f.model.position);
            updateFollowerFacingTo(_target, f, delta, faceFac);
            f.pendingInitialAlign = false;
            if (f.idleMixer) f.idleMixer.update(delta);
            else f.mixer.update(delta);
            return;
          }
          const introLerp = f.walkInIntroApproachLerp ?? 1.35;
          const maxSpd = f.walkInIntroMaxSpeedMps ?? 1.65;
          const arriveR = f.walkInIntroArriveRadiusM ?? 0.88;
          const txzIntro = Math.min(1, introLerp * delta);
          const prevIX = f.model.position.x;
          const prevIZ = f.model.position.z;
          let nx = THREE.MathUtils.lerp(
            f.model.position.x,
            _target.x,
            txzIntro,
          );
          let nz = THREE.MathUtils.lerp(
            f.model.position.z,
            _target.z,
            txzIntro,
          );
          const ddx = nx - f.model.position.x;
          const ddz = nz - f.model.position.z;
          const step = Math.hypot(ddx, ddz);
          const maxStep = maxSpd * delta;
          if (step > maxStep && step > 1e-9) {
            const sc = maxStep / step;
            nx = f.model.position.x + ddx * sc;
            nz = f.model.position.z + ddz * sc;
          }
          f.model.position.x = nx;
          f.model.position.z = nz;
          const movedIntro =
            Math.abs(f.model.position.x - prevIX) > 1e-6 ||
            Math.abs(f.model.position.z - prevIZ) > 1e-6;
          if (movedIntro && staticColliderBoxes.length > 0) {
            const slid = slideMoveXZAgainstAABBs(
              prevIX,
              prevIZ,
              f.model.position.x,
              f.model.position.z,
              collisionRadius,
              staticColliderBoxes,
            );
            f.model.position.x = slid.x;
            f.model.position.z = slid.z;
          }
          const sampledIntro = sampleGroundY(
            f.model.position.x,
            f.model.position.z,
          );
          if (sampledIntro != null) {
            f.groundMissFrames = 0;
            f.resolvedGroundY = sampledIntro;
          } else {
            f.groundMissFrames += 1;
            if (f.groundMissFrames >= GROUND_MISS_TOLERANCE_FRAMES) {
              f.resolvedGroundY = baseGroundY;
            }
          }
          const liftI = f.modelGroundLift;
          const targetYI = f.resolvedGroundY + liftI;
          f.model.position.y = THREE.MathUtils.lerp(
            f.model.position.y,
            targetYI,
            easeAlpha,
          );
          if (f.idleModel) f.idleModel.position.copy(f.model.position);
          updateFollowerFacingTo(_target, f, delta, faceFac);
          f.pendingInitialAlign = false;
          const remI = Math.hypot(
            _target.x - f.model.position.x,
            _target.z - f.model.position.z,
          );
          const introEnded = remI <= arriveR;
          if (introEnded) {
            f.walkInIntroActive = false;
            f.offsetYaw = null;
            if (import.meta.env.DEV && f._devStickIntroStartedAt != null) {
              console.debug("[GumFollowers] stick walk-in finished", {
                followerId: f.id,
                msSinceSpawnedInScene: Math.round(
                  (globalThis.performance?.now?.() ?? 0) -
                    f._devStickIntroStartedAt,
                ),
              });
              delete f._devStickIntroStartedAt;
            }
          }
          f.mixer.update(delta);
          if (introEnded) {
            if (moving) {
              f.model.visible = true;
              if (f.idleModel) f.idleModel.visible = false;
              if (f.walkAction) f.walkAction.paused = false;
              if (f.idleAction) f.idleAction.paused = true;
            } else {
              f.model.visible = !f.idleModel;
              if (f.idleModel) f.idleModel.visible = true;
              if (f.walkAction) f.walkAction.paused = true;
              if (f.idleAction) f.idleAction.paused = false;
            }
          }
          return;
        }

        // xz만 자연스럽게 따라오게 처리 (GC 방지: Vector3 생성 최소화)
        const baseFollow = f.slotFollowLerpFactor ?? followLerpFactor;
        const dynFollow = breaking
          ? baseFollow * breakOffFollowLerpMultiplier
          : baseFollow;
        const txz = Math.min(1, dynFollow * delta);
        const prevX = f.model.position.x;
        const prevZ = f.model.position.z;
        if (instantAlignThis) {
          f.model.position.x = _target.x;
          f.model.position.z = _target.z;
        } else {
          f.model.position.x = THREE.MathUtils.lerp(
            f.model.position.x,
            _target.x,
            txz,
          );
          f.model.position.z = THREE.MathUtils.lerp(
            f.model.position.z,
            _target.z,
            txz,
          );
        }
        const movedXZ =
          Math.abs(f.model.position.x - prevX) > 1e-6 ||
          Math.abs(f.model.position.z - prevZ) > 1e-6;
        if (movedXZ && staticColliderBoxes.length > 0) {
          const slid = slideMoveXZAgainstAABBs(
            prevX,
            prevZ,
            f.model.position.x,
            f.model.position.z,
            collisionRadius,
            staticColliderBoxes,
          );
          f.model.position.x = slid.x;
          f.model.position.z = slid.z;
        }
        const sampledGroundY = sampleGroundY(
          f.model.position.x,
          f.model.position.z,
        );
        if (sampledGroundY != null) {
          f.groundMissFrames = 0;
          f.resolvedGroundY = sampledGroundY;
        } else {
          f.groundMissFrames += 1;
          if (f.groundMissFrames >= GROUND_MISS_TOLERANCE_FRAMES) {
            f.resolvedGroundY = baseGroundY;
          }
        }
        const lift = f.modelGroundLift;
        const targetY = f.resolvedGroundY + lift;
        if (instantAlignThis) {
          f.model.position.y = targetY;
        } else {
          f.model.position.y = THREE.MathUtils.lerp(
            f.model.position.y,
            targetY,
            easeAlpha,
          );
        }
        if (!moving && !f.walkInIntroActive && f.idleModel) {
          f.idleModel.position.copy(f.model.position);
        }

        // 걷는 동안은 "이동 앞"을 보고, 멈추면 유저를 바라보도록 전환
        if (instantAlignThis) {
          if (moving) {
            setFollowerFacingInstant(_target, f);
          } else {
            setFollowerFacingInstant(userPos, f);
          }
        } else if (moving) {
          updateFollowerFacingTo(_target, f, delta, faceFac);
        } else {
          updateFollowerFacingTo(userPos, f, delta, faceFac);
        }
        if (!moving && !f.walkInIntroActive && f.idleModel) {
          f.idleModel.rotation.copy(f.model.rotation);
        }

        const isWalkAnim =
          moving ||
          (Boolean(f.walkInIntroActive) && !f.walkInIntroAwaitModalClose);
        if (isWalkAnim) {
          f.mixer.update(delta);
        } else if (f.idleMixer) {
          f.idleMixer.update(delta);
        } else {
          // idle 전용 믹서가 없는 구성에서는 기본 믹서를 계속 구동한다.
          f.mixer.update(delta);
        }

        if (f.pendingInitialAlign) f.pendingInitialAlign = false;
      });

      if (pendingInitialWorldAlign) {
        pendingInitialWorldAlign = false;
      }
    },
    cleanup() {
      followers.forEach((f) => {
        scene.remove(f.model);
        if (f.idleModel) scene.remove(f.idleModel);
        f.mixer.stopAllAction();
        if (f.idleMixer) f.idleMixer.stopAllAction();
      });
      followers.length = 0;
      followerBubbleFallbackHeadY = 1.1;
      isReady = false;
      pendingInitialWorldAlign = true;
      isMovingPrev = false;
      elapsedSec = 0;
      breakOffUntil = 0;
      prevUserYaw = null;
      baseGroundY = 0;
      walkableGroundMeshes = [];
      staticColliderBoxes = [];
      stickQueue.length = 0;
      attachedStickCards.clear();
      loadingStickCards.clear();
      stickLoadToken = 0;
    },

    /**
     * 첫 번째 껌딱지(A) 말풍선 앵커 — Stage2 `projectModelToScreen` 과 동일
     * (`Box3.setFromObject` 월드 AABB → center + size.y × bubbleOffsetY)
     * @param {THREE.Vector3} target
     * @returns {boolean}
     */
    getPrimaryFollowerBubbleAnchorWorld(target) {
      if (!isReady || followers.length < 1) return false;
      const f = followers[0];
      f.model.updateMatrixWorld(true);
      _bubbleBox.setFromObject(f.model);
      let useBox = false;
      if (!_bubbleBox.isEmpty()) {
        _bubbleBox.getCenter(target);
        _bubbleBox.getSize(_bubbleSize);
        const h = _bubbleSize.y;
        if (Number.isFinite(h) && h > 1e-6) {
          target.y += h * bubbleOffsetY;
          useBox =
            Number.isFinite(target.x) &&
            Number.isFinite(target.y) &&
            Number.isFinite(target.z);
        }
      }
      if (!useBox) {
        f.model.getWorldPosition(target);
        target.y += followerBubbleFallbackHeadY;
      }
      return (
        Number.isFinite(target.x) &&
        Number.isFinite(target.y) &&
        Number.isFinite(target.z)
      );
    },
  };
}
