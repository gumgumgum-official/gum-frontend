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

/**
 * @param {{
 *   scene: import("three").Scene,
 *   glbLoader: ReturnType<import("../../common/assetLoaders.js").getGLBLoader>,
 *   config: import("../../../types.js").Stage3Config,
 *   getUserState: () => { position: import("three").Vector3|null, yaw: number|null, moving: boolean },
 *   renderer?: import("three").WebGLRenderer | null,
 *   getCamera?: () => import("three").Camera | null,
 * }} params
 */
export function createGumFollowersController({
  scene,
  glbLoader,
  config,
  getUserState,
  renderer = null,
  getCamera = null,
}) {
  void glbLoader;
  const gumCfg = config.character?.gumFollowers ?? null;
  const gumModelCfg = gumCfg?.models;
  const gumBehaviorCfg = gumCfg?.behavior;

  const modelPath =
    gumModelCfg?.modelPath ?? "/models/common/gum_walk_final.glb";
  const idleModelPath =
    gumModelCfg?.idleModelPath ?? "/models/common/gum_idle.glb";
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

  /**
   * @type {{ id: "A"|"B", side: -1|1, model: THREE.Group, idleModel: THREE.Group|null, mixer: THREE.AnimationMixer, idleMixer: THREE.AnimationMixer|null, walkAction: THREE.AnimationAction|null, idleAction: THREE.AnimationAction|null, offsetYaw: number|null, breakDriftScalar: number }[]}
   */
  const followers = [];

  let followerYPosition = 0;
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

  let isMovingPrev = false;
  let elapsedSec = 0;
  let breakOffUntil = 0;
  let prevUserYaw = null;
  let baseGroundY = 0;
  let followerGroundLift = 0;
  /** @type {import("three").Mesh[]} */
  let walkableGroundMeshes = [];
  /** @type {import("./islandStaticColliders.js").IslandColliderAabb[]} */
  let staticColliderBoxes = [];

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
    const minY = box.min.y;
    followerGroundLift = -minY + groundOffset;
    followerYPosition = backgroundMaxY - minY + groundOffset;
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
      const model = SkeletonUtils.clone(baseModel);
      const idleModel = baseIdleModel
        ? SkeletonUtils.clone(baseIdleModel)
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

      const mixer = new THREE.AnimationMixer(model);
      const walkAction = walkClip ? mixer.clipAction(walkClip) : null;
      let idleMixer = null;
      let idleAction = null;
      if (idleModel && idleClipFromIdleModel) {
        idleMixer = new THREE.AnimationMixer(idleModel);
        idleAction = idleMixer.clipAction(idleClipFromIdleModel);
      } else if (idleClipFromWalkModel) {
        idleAction = mixer.clipAction(idleClipFromWalkModel);
      }
      if (walkAction) {
        walkAction.loop = THREE.LoopRepeat;
        walkAction.timeScale = animationSpeed;
        walkAction.play();
        walkAction.paused = true;
      }
      if (idleAction) {
        idleAction.loop = THREE.LoopRepeat;
        idleAction.timeScale = animationSpeed;
        idleAction.play();
        idleAction.paused = false;
      }

      followers.push({
        id,
        side,
        model,
        idleModel,
        mixer,
        idleMixer,
        walkAction,
        idleAction,
        offsetYaw: null,
        breakDriftScalar: side * breakOffDriftAmplitude,
        resolvedGroundY: backgroundMaxY,
        groundMissFrames: 0,
      });

      scene.add(model);
      if (idleModel) scene.add(idleModel);
      model.position.y = followerYPosition;
      if (idleModel) {
        idleModel.position.y = followerYPosition;
        idleModel.visible = true;
        model.visible = false;
      }
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
  }

  function computeOffsetYaw(userYaw, side) {
    const angleRad = THREE.MathUtils.degToRad(angleDeg);
    // "후방"은 userYaw + 180deg. 그 후 좌/우로 +/- angleDeg 만큼 벌림
    return userYaw + Math.PI + side * angleRad;
  }

  function updateFollowerFacingTo(lookTarget, follower, delta) {
    _look.copy(lookTarget).sub(follower.model.position);
    _look.y = 0;
    if (_look.lengthSq() < 1e-6) return;
    const yaw = Math.atan2(_look.x, _look.z);
    const tFace = Math.min(1, facingLerpFactor * delta);
    follower.model.rotation.y = lerpAngle(
      follower.model.rotation.y,
      yaw,
      tFace,
    );
  }

  return {
    init,
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
      if (isMovingPrev !== moving) {
        followers.forEach((f) => {
          if (moving) {
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
        const breaking = breakOffEnabled && elapsedSec < breakOffUntil;

        const desiredOffsetYaw = computeOffsetYaw(userYaw, f.side);
        if (f.offsetYaw == null) f.offsetYaw = desiredOffsetYaw;
        const ty = Math.min(1, turnLerpFactor * delta);
        f.offsetYaw = lerpAngle(f.offsetYaw, desiredOffsetYaw, ty);

        _dir.set(Math.sin(f.offsetYaw), 0, Math.cos(f.offsetYaw));
        const dynDistance = breaking
          ? distance * breakOffDistanceMultiplier
          : distance;
        _target.copy(_userPos).addScaledVector(_dir, dynDistance);

        if (breaking) {
          // dir 기준으로 90deg 회전한 "옆" 방향으로 벌어짐
          const perpX = _dir.z;
          const perpZ = -_dir.x;
          _target.x += perpX * f.breakDriftScalar;
          _target.z += perpZ * f.breakDriftScalar;
        }

        // xz만 자연스럽게 따라오게 처리 (GC 방지: Vector3 생성 최소화)
        const dynFollow = breaking
          ? followLerpFactor * breakOffFollowLerpMultiplier
          : followLerpFactor;
        const txz = Math.min(1, dynFollow * delta);
        const prevX = f.model.position.x;
        const prevZ = f.model.position.z;
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
        const targetY = f.resolvedGroundY + followerGroundLift;
        f.model.position.y = THREE.MathUtils.lerp(
          f.model.position.y,
          targetY,
          easeAlpha,
        );
        if (!moving && f.idleModel) {
          f.idleModel.position.copy(f.model.position);
        }

        // 걷는 동안은 "이동 앞"을 보고, 멈추면 유저를 바라보도록 전환
        if (moving) {
          updateFollowerFacingTo(_target, f, delta);
        } else {
          updateFollowerFacingTo(userPos, f, delta);
        }
        if (!moving && f.idleModel) {
          f.idleModel.rotation.copy(f.model.rotation);
        }

        if (moving) {
          f.mixer.update(delta);
        } else if (f.idleMixer) {
          f.idleMixer.update(delta);
        } else {
          // idle 전용 믹서가 없는 구성에서는 기본 믹서를 계속 구동한다.
          f.mixer.update(delta);
        }
      });
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
      isMovingPrev = false;
      elapsedSec = 0;
      breakOffUntil = 0;
      prevUserYaw = null;
      baseGroundY = 0;
      followerGroundLift = 0;
      walkableGroundMeshes = [];
      staticColliderBoxes = [];
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
