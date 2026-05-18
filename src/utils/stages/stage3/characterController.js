import * as THREE from "three";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import { inspectGLTF } from "../../common/modelInspector.js";
import {
  loadGltfTemplateCached,
  resolvePublicAssetUrl,
} from "../../common/gltfTemplateCache.js";
import { slideMoveXZAgainstAABBs } from "./islandStaticColliders.js";
import { sampleStage3WalkableGroundY } from "./island/stage3IslandWalkable.js";

const WALK_SOUND_REL = "/static/sounds/character_walk.mp3";

function applyShadows(model) {
  model.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
}

function findClip(clips, regex) {
  return clips.find((c) => regex.test(String(c?.name ?? ""))) ?? null;
}

/**
 * @param {{
 *   scene: import("three").Scene,
 *   glbLoader: ReturnType<import("../../common/assetLoaders.js").getGLBLoader>,
 *   config: import("../../../types.js").Stage3Config,
 *   getKeys: () => Record<string, boolean>,
 *   renderer?: import("three").WebGLRenderer | null,
 *   getCamera?: () => import("three").Camera | null,
 * }} params
 * @returns {{
 *   setup: (
 *     backgroundMaxY: number,
 *     backgroundBounds: import("three").Box3,
 *     staticColliderBoxes?: import("./islandStaticColliders.js").IslandColliderAabb[],
 *     setupOptions?: {
 *       worldSpawnXZ?: { x: number, z: number },
 *       walkableMeshes?: import("three").Mesh[],
 *       walkableBounds?: import("three").Box3 | null,
 *       allowedBoundsXZ?: import("three").Box3 | null,
 *       islandModel?: import("three").Object3D | null,
 *     },
 *   ) => void,
 *   update: (
 *     delta: number,
 *     camera: import("three").Camera,
 *     options?: { skipCameraFollow?: boolean; cameraYawAssistRad?: number },
 *   ) => void,
 *   cleanup: () => void,
 *   getPosition: () => import("three").Vector3 | null,
 *   getYaw: () => number | null,
 *   getIsMoving: () => boolean,
 *   getHeadAnchorWorld: (out: import("three").Vector3) => boolean,
 *   playHammerCue: (
 *     onImpact?: () => void,
 *     options?: { reverse?: boolean },
 *   ) => void,
 *   isPunching: () => boolean,
 * }}
 */
export function createCharacterController({
  scene,
  glbLoader,
  config,
  getKeys,
  renderer = null,
  getCamera = null,
}) {
  void glbLoader;

  let characterModel = null;
  let idleCharacterModel = null;
  let characterYPosition = 0;
  let characterMixer = null;
  let idleCharacterMixer = null;
  let characterWalkAction = null;
  let idleCharacterAction = null;
  let isWalking = false;
  let isMoving = false;
  let backgroundBounds = null;
  let baseGroundY = 0;
  let characterGroundLift = 0;
  let resolvedGroundY = 0;
  let groundMissFrames = 0;
  /** @type {import("three").Mesh[]} */
  let walkableGroundMeshes = [];
  /** @type {import("./islandStaticColliders.js").IslandColliderAabb[]} */
  let staticColliderBoxes = [];
  let collisionRadius = 0.55;
  let walkAudio = null;
  let punchCharacterModel = null;
  let punchMixer = null;
  let punchAction = null;
  let isPunchPlaying = false;
  let impactTimeoutId = null;
  /** 스폰 시점의 캐릭터 yaw — 펀치 시 항상 이 방향을 바라보게 고정 */
  let spawnFacingYaw = 0;

  // 경계 clamp 값 — setup()에서 1회 계산, update() 매 프레임 재사용
  let _minCx = 0,
    _maxCx = 0,
    _minCz = 0,
    _maxCz = 0;
  /** @type {import("three").Box3 | null} */
  let allowedBoundsXZ = null;
  /** walkable bbox 기준 최저 안전 지면 Y (물·절벽 레이 히트 거부용) */
  let minSafeGroundY = null;
  /** walkable 레이캐스트 시작 높이 */
  let groundRayOriginY = 30;
  /** @type {import("three").Object3D | null} */
  let islandModelForRaycast = null;

  const _moveVector = new THREE.Vector3();
  const _direction = new THREE.Vector3();
  const _cameraOffset = new THREE.Vector3();
  const _targetPosition = new THREE.Vector3();
  const _lookAtPosition = new THREE.Vector3();
  const _worldUp = new THREE.Vector3(0, 1, 0);
  const _headAnchorBox = new THREE.Box3();
  const GROUND_MISS_TOLERANCE_FRAMES = 5;
  const GROUND_HEIGHT_EASE_SPEED = 16;
  const MAX_SAFE_STEP_DOWN = 0.22;
  const MIN_SAFE_GROUND_OFFSET = 0.12;

  function getWalkSoundVolume() {
    const v = config.character?.walkSoundVolume;
    return THREE.MathUtils.clamp(typeof v === "number" ? v : 0.04, 0, 1);
  }

  function syncWalkSound(moving) {
    if (!moving) {
      if (walkAudio && !walkAudio.paused) {
        walkAudio.pause();
        walkAudio.currentTime = 0;
      }
      return;
    }
    if (!walkAudio) {
      walkAudio = new window.Audio();
      walkAudio.preload = "auto";
      walkAudio.loop = true;
      walkAudio.src = resolvePublicAssetUrl(WALK_SOUND_REL);
    }
    const walkVolume = getWalkSoundVolume();
    walkAudio.volume = walkVolume;
    if (walkAudio.paused) walkAudio.play().catch(() => {});
  }

  function updateCameraFollow(camera, position, options) {
    const {
      cameraOffset: co,
      cameraLerpFactor,
      lookAtHeightOffset,
    } = config.character;
    _cameraOffset.set(co.x, co.y, co.z);
    const yaw = Number(options.cameraYawAssistRad ?? 0);
    if (yaw !== 0) _cameraOffset.applyAxisAngle(_worldUp, yaw);
    camera.position.lerp(
      _targetPosition.copy(position).add(_cameraOffset),
      cameraLerpFactor,
    );
    _lookAtPosition.copy(position);
    _lookAtPosition.y += lookAtHeightOffset;
    camera.lookAt(_lookAtPosition);
  }

  function setCharacterVisibility(walking) {
    if (!characterModel) return;
    if (idleCharacterModel) {
      characterModel.visible = walking;
      idleCharacterModel.visible = !walking;
    } else {
      characterModel.visible = true;
    }
  }

  return {
    setup(backgroundMaxY, bounds, colliderBoxes = [], setupOptions = {}) {
      const {
        worldSpawnXZ,
        walkableMeshes,
        walkableBounds,
        allowedBoundsXZ: allowedBounds,
        islandModel,
      } = setupOptions;
      backgroundBounds = bounds;
      staticColliderBoxes = colliderBoxes;
      islandModelForRaycast = islandModel ?? null;
      walkableGroundMeshes = Array.isArray(walkableMeshes)
        ? walkableMeshes
        : [];
      allowedBoundsXZ =
        allowedBounds instanceof THREE.Box3 && !allowedBounds.isEmpty()
          ? allowedBounds.clone()
          : null;
      baseGroundY = backgroundMaxY;
      resolvedGroundY = backgroundMaxY;
      groundMissFrames = 0;
      if (walkableBounds instanceof THREE.Box3 && !walkableBounds.isEmpty()) {
        groundRayOriginY = walkableBounds.max.y + 30;
      } else {
        groundRayOriginY = backgroundMaxY + 30;
      }
      minSafeGroundY = baseGroundY - MIN_SAFE_GROUND_OFFSET;

      const raycastGroundAt = (x, z) => {
        if (!walkableGroundMeshes.length) return null;
        islandModelForRaycast?.updateMatrixWorld(true);
        return sampleStage3WalkableGroundY(
          x,
          z,
          walkableGroundMeshes,
          groundRayOriginY,
        );
      };

      const applyGroundCalibration = (x, z) => {
        const sampled = raycastGroundAt(x, z);
        if (sampled == null) return false;
        baseGroundY = sampled;
        resolvedGroundY = sampled;
        minSafeGroundY = sampled - MIN_SAFE_GROUND_OFFSET * 4;
        return true;
      };

      const { boundsPadding } = config.character;
      _minCx = Math.min(
        bounds.min.x + boundsPadding,
        bounds.max.x - boundsPadding,
      );
      _maxCx = Math.max(
        bounds.min.x + boundsPadding,
        bounds.max.x - boundsPadding,
      );
      _minCz = Math.min(
        bounds.min.z + boundsPadding,
        bounds.max.z - boundsPadding,
      );
      _maxCz = Math.max(
        bounds.min.z + boundsPadding,
        bounds.max.z - boundsPadding,
      );

      const characterUrl = resolvePublicAssetUrl(
        config.characterModelPath ?? "/models/common/user_walk_v2.glb",
      );
      const idleUrl = resolvePublicAssetUrl(
        config.characterIdleModelPath ?? "/models/common/user_idle.glb",
      );
      const punchUrl = resolvePublicAssetUrl(
        config.characterPunchModelPath ?? "/models/stage3/user_punch.glb",
      );

      Promise.all([
        loadGltfTemplateCached(characterUrl),
        loadGltfTemplateCached(idleUrl).catch(() => null),
        loadGltfTemplateCached(punchUrl).catch(() => null),
      ]).then(
        ([gltf, idleGltf, punchGltf]) => {
          const scale = config.character?.scale ?? 1;
          const radiusCfg = config.character?.collisionRadius;
          collisionRadius =
            radiusCfg != null ? radiusCfg : Math.max(0.2, scale * 0.22);

          characterModel = SkeletonUtils.clone(gltf.scene);
          characterModel.scale.setScalar(scale);
          applyShadows(characterModel);

          idleCharacterModel = idleGltf
            ? SkeletonUtils.clone(idleGltf.scene)
            : null;
          if (idleCharacterModel) {
            idleCharacterModel.scale.setScalar(scale);
            applyShadows(idleCharacterModel);
          }

          const characterMinY = new THREE.Box3().setFromObject(characterModel)
            .min.y;
          characterGroundLift =
            -characterMinY + (config.character?.groundOffset ?? 0);
          characterYPosition = baseGroundY + characterGroundLift;

          let spawnX = 0,
            spawnZ = 0;
          if (worldSpawnXZ && Number.isFinite(worldSpawnXZ.x)) {
            spawnX = worldSpawnXZ.x;
            spawnZ = worldSpawnXZ.z;
          } else if (!bounds.isEmpty()) {
            spawnX = (bounds.min.x + bounds.max.x) * 0.5;
            spawnZ = (bounds.min.z + bounds.max.z) * 0.5;
          }
          const off = config.character?.spawnOffset;
          if (off) {
            spawnX += off.x ?? 0;
            spawnZ += off.z ?? 0;
          }
          const charCfg = /** @type {any} */ (config.character);
          const spawnRotationRadRaw = Number(charCfg?.spawnRotationRad);
          const spawnRotationDegRaw = Number(charCfg?.spawnRotationDeg);
          const spawnYaw = Number.isFinite(spawnRotationRadRaw)
            ? spawnRotationRadRaw
            : Number.isFinite(spawnRotationDegRaw)
              ? THREE.MathUtils.degToRad(spawnRotationDegRaw)
              : null;

          if (applyGroundCalibration(spawnX, spawnZ)) {
            characterYPosition = baseGroundY + characterGroundLift;
          }

          characterModel.position.set(spawnX, characterYPosition, spawnZ);
          if (spawnYaw != null) {
            characterModel.rotation.y = spawnYaw;
          }
          spawnFacingYaw = characterModel.rotation.y;
          if (idleCharacterModel) {
            idleCharacterModel.position.set(spawnX, characterYPosition, spawnZ);
            if (spawnYaw != null) {
              idleCharacterModel.rotation.y = spawnYaw;
            }
            idleCharacterModel.visible = false;
          }

          if (gltf.animations?.length > 0) {
            characterMixer = new THREE.AnimationMixer(characterModel);
            const walkClip =
              findClip(gltf.animations, /walk|run|move/i) ?? gltf.animations[0];
            characterWalkAction = characterMixer.clipAction(walkClip);
            characterWalkAction.loop = THREE.LoopRepeat;
            characterWalkAction.play();
            characterWalkAction.paused = true;
            characterWalkAction.enabled = true;
            characterWalkAction.setEffectiveWeight(1);

            const idleClips = idleGltf?.animations ?? [];
            if (idleCharacterModel && idleClips.length > 0) {
              const idleClip =
                findClip(idleClips, /idle|stand|wait|pose|breath|rest/i) ??
                idleClips[0];
              idleCharacterMixer = new THREE.AnimationMixer(idleCharacterModel);
              idleCharacterAction = idleCharacterMixer.clipAction(idleClip);
            } else {
              const idleClip =
                findClip(
                  gltf.animations,
                  /idle|stand|wait|pose|breath|rest/i,
                ) ??
                gltf.animations.find((c) => c !== walkClip) ??
                null;
              idleCharacterAction = idleClip
                ? characterMixer.clipAction(idleClip)
                : null;
            }

            if (idleCharacterAction) {
              idleCharacterAction.loop = THREE.LoopRepeat;
              idleCharacterAction.play();
              idleCharacterAction.paused = false;
              idleCharacterAction.enabled = true;
              idleCharacterAction.setEffectiveWeight(1);
            }
          }

          if (idleCharacterModel) {
            characterModel.visible = false;
            idleCharacterModel.visible = true;
          }

          scene.add(characterModel);
          if (idleCharacterModel) scene.add(idleCharacterModel);

          if (punchGltf) {
            punchCharacterModel = SkeletonUtils.clone(punchGltf.scene);
            punchCharacterModel.scale.setScalar(scale);
            punchCharacterModel.position.set(
              spawnX,
              characterYPosition,
              spawnZ,
            );
            if (spawnYaw != null) {
              punchCharacterModel.rotation.y = spawnYaw;
            }
            punchCharacterModel.visible = false;
            applyShadows(punchCharacterModel);

            if (punchGltf.animations?.length > 0) {
              punchMixer = new THREE.AnimationMixer(punchCharacterModel);
              punchAction = punchMixer.clipAction(punchGltf.animations[0]);
              punchAction.loop = THREE.LoopOnce;
              punchAction.clampWhenFinished = true;
              punchMixer.addEventListener("finished", () => {
                isPunchPlaying = false;
                if (punchCharacterModel) punchCharacterModel.visible = false;
                setCharacterVisibility(isWalking);
              });
            }
            scene.add(punchCharacterModel);
          }

          const prewarmCamera = getCamera?.();
          if (renderer && prewarmCamera) {
            if (typeof renderer.compileAsync === "function") {
              void renderer.compileAsync(scene, prewarmCamera).catch(() => {});
            } else {
              renderer.compile(scene, prewarmCamera);
            }
          }

          inspectGLTF(gltf, "캐릭터 모델");
        },
        (err) =>
          console.error(
            "❌ Stage3 캐릭터 로드 에러:",
            err instanceof Error ? err : new Error(String(err)),
          ),
      );
    },

    update(delta, camera, options = {}) {
      if (!characterModel || !backgroundBounds) return;

      const sampleGroundY = (x, z) => {
        if (!walkableGroundMeshes.length) return baseGroundY;
        islandModelForRaycast?.updateMatrixWorld(true);
        return sampleStage3WalkableGroundY(
          x,
          z,
          walkableGroundMeshes,
          groundRayOriginY,
        );
      };

      const getMinSafeGroundY = () =>
        minSafeGroundY ?? baseGroundY - MIN_SAFE_GROUND_OFFSET;

      const resolveGroundY = (x, z) => {
        const sampledGroundY = sampleGroundY(x, z);
        const isSafeSample =
          sampledGroundY != null && sampledGroundY >= getMinSafeGroundY();
        if (isSafeSample) {
          groundMissFrames = 0;
          resolvedGroundY = sampledGroundY;
          return resolvedGroundY;
        }
        groundMissFrames += 1;
        if (groundMissFrames >= GROUND_MISS_TOLERANCE_FRAMES) {
          resolvedGroundY = baseGroundY;
        }
        return resolvedGroundY;
      };
      if (isPunchPlaying) {
        if (punchMixer) punchMixer.update(delta);
        syncWalkSound(false);
        if (!options.skipCameraFollow)
          updateCameraFollow(camera, characterModel.position, options);
        return;
      }

      const keys = getKeys();
      _moveVector.set(0, 0, 0);
      if (keys.ArrowUp || keys.w || keys.W || keys.KeyW) _moveVector.z -= 1;
      if (keys.ArrowDown || keys.s || keys.S || keys.KeyS) _moveVector.z += 1;
      if (keys.ArrowLeft || keys.a || keys.A || keys.KeyA) _moveVector.x -= 1;
      if (keys.ArrowRight || keys.d || keys.D || keys.KeyD) _moveVector.x += 1;

      const movingInput = _moveVector.length() > 0;
      let moved = false;

      if (movingInput) {
        _direction.copy(_moveVector).normalize();
        _moveVector
          .copy(_direction)
          .multiplyScalar(config.character.moveSpeed * delta);

        const oldX = characterModel.position.x;
        const oldZ = characterModel.position.z;
        const clampedX = THREE.MathUtils.clamp(
          oldX + _moveVector.x,
          _minCx,
          _maxCx,
        );
        const clampedZ = THREE.MathUtils.clamp(
          oldZ + _moveVector.z,
          _minCz,
          _maxCz,
        );
        const slid = slideMoveXZAgainstAABBs(
          oldX,
          oldZ,
          clampedX,
          clampedZ,
          collisionRadius,
          staticColliderBoxes,
        );
        const candidateX = slid.x;
        const candidateZ = slid.z;
        const movedXZ =
          Math.abs(candidateX - oldX) > 1e-6 ||
          Math.abs(candidateZ - oldZ) > 1e-6;

        // XZ 이동은 바운딩·정적 충돌만 적용. Y(지면)는 아래 resolveGroundY에서 처리.
        // (walkable 레이 실패·Island bbox Y 오차로 XZ가 막히던 문제 방지)
        let canMoveToCandidate = movedXZ;
        if (canMoveToCandidate && walkableGroundMeshes.length > 0) {
          const sampledCandidateGroundY = sampleGroundY(candidateX, candidateZ);
          if (
            sampledCandidateGroundY != null &&
            sampledCandidateGroundY < getMinSafeGroundY() - MAX_SAFE_STEP_DOWN
          ) {
            canMoveToCandidate = false;
          }
        }

        const targetX = canMoveToCandidate ? candidateX : oldX;
        const targetZ = canMoveToCandidate ? candidateZ : oldZ;
        if (canMoveToCandidate) {
          groundMissFrames = 0;
          const sampledAtTarget = sampleGroundY(targetX, targetZ);
          if (sampledAtTarget != null) {
            resolvedGroundY = sampledAtTarget;
          }
        }
        const nextGroundY = resolveGroundY(targetX, targetZ);
        const targetY = nextGroundY + characterGroundLift;
        const easeAlpha = 1 - Math.exp(-GROUND_HEIGHT_EASE_SPEED * delta);
        characterYPosition = THREE.MathUtils.lerp(
          characterYPosition,
          targetY,
          easeAlpha,
        );
        characterModel.position.set(targetX, characterYPosition, targetZ);
        moved =
          Math.abs(targetX - oldX) > 1e-6 || Math.abs(targetZ - oldZ) > 1e-6;
        characterModel.rotation.y = Math.atan2(_direction.x, _direction.z);
      } else {
        const p = characterModel.position;
        const nextGroundY = resolveGroundY(p.x, p.z);
        const targetY = nextGroundY + characterGroundLift;
        const easeAlpha = 1 - Math.exp(-GROUND_HEIGHT_EASE_SPEED * delta);
        characterYPosition = THREE.MathUtils.lerp(
          characterYPosition,
          targetY,
          easeAlpha,
        );
        characterModel.position.y = characterYPosition;
      }

      isMoving = moved;

      if (characterWalkAction && isWalking !== movingInput) {
        setCharacterVisibility(movingInput);
        characterWalkAction.paused = !movingInput;
        if (idleCharacterAction) idleCharacterAction.paused = movingInput;
        isWalking = movingInput;
      }

      if (!movingInput && idleCharacterModel) {
        idleCharacterModel.position.copy(characterModel.position);
        idleCharacterModel.rotation.copy(characterModel.rotation);
      }

      if (characterMixer && (isWalking || !idleCharacterMixer))
        characterMixer.update(delta);
      if (idleCharacterMixer && !isWalking) idleCharacterMixer.update(delta);

      syncWalkSound(moved);

      if (!options.skipCameraFollow)
        updateCameraFollow(camera, characterModel.position, options);
    },

    cleanup() {
      if (impactTimeoutId !== null) {
        clearTimeout(impactTimeoutId);
        impactTimeoutId = null;
      }
      if (punchMixer) {
        punchMixer.stopAllAction();
        punchMixer = null;
      }
      if (punchCharacterModel) {
        scene.remove(punchCharacterModel);
        punchCharacterModel = null;
      }
      punchAction = null;
      isPunchPlaying = false;
      if (walkAudio) {
        walkAudio.pause();
        walkAudio.src = "";
        walkAudio = null;
      }
      if (characterModel) {
        scene.remove(characterModel);
        characterModel = null;
      }
      if (idleCharacterModel) {
        scene.remove(idleCharacterModel);
        idleCharacterModel = null;
      }
      if (characterMixer) {
        characterMixer.stopAllAction();
        characterMixer = null;
      }
      if (idleCharacterMixer) {
        idleCharacterMixer.stopAllAction();
        idleCharacterMixer = null;
      }
      characterWalkAction = null;
      idleCharacterAction = null;
      isWalking = false;
      backgroundBounds = null;
      walkableGroundMeshes = [];
      allowedBoundsXZ = null;
      minSafeGroundY = null;
      groundRayOriginY = 30;
      islandModelForRaycast = null;
      resolvedGroundY = 0;
      groundMissFrames = 0;
      staticColliderBoxes = [];
    },

    getPosition: () => characterModel?.position ?? null,
    getYaw: () => characterModel?.rotation.y ?? null,
    getIsMoving: () => isMoving,

    /**
     * 머리 근처 월드 좌표 — Bone 이름에 "head" 포함 우선, 없으면 가시 메시 AABB 상단 중심.
     * @param {THREE.Vector3} out
     */
    getHeadAnchorWorld(out) {
      const src = isWalking
        ? characterModel
        : (idleCharacterModel ?? characterModel);
      if (!src) return false;
      src.updateMatrixWorld(true);
      /** @type {THREE.Bone | null} */
      let headBone = null;
      src.traverse((o) => {
        if (headBone || !(/** @type {any} */ (o).isBone)) return;
        const n = String(o.name || "").toLowerCase();
        if (n.includes("head")) headBone = /** @type {THREE.Bone} */ (o);
      });
      if (headBone) {
        headBone.getWorldPosition(out);
        return (
          Number.isFinite(out.x) &&
          Number.isFinite(out.y) &&
          Number.isFinite(out.z)
        );
      }
      _headAnchorBox.setFromObject(src);
      if (_headAnchorBox.isEmpty()) return false;
      _headAnchorBox.getCenter(out);
      out.y = _headAnchorBox.max.y;
      return (
        Number.isFinite(out.x) &&
        Number.isFinite(out.y) &&
        Number.isFinite(out.z)
      );
    },

    playHammerCue(onImpact, options = {}) {
      if (!punchCharacterModel || !punchAction || isPunchPlaying) return;
      const src = idleCharacterModel?.visible
        ? idleCharacterModel
        : characterModel;
      if (!src) return;
      const reverse =
        options.reverse ?? Boolean(config.character?.punchAnimationReverse);
      const speedRaw = Number(config.character?.punchAnimationTimeScale);
      const speed = THREE.MathUtils.clamp(
        Number.isFinite(speedRaw) && speedRaw > 0 ? speedRaw : 1.65,
        0.05,
        20,
      );
      punchCharacterModel.position.copy(src.position);
      punchCharacterModel.rotation.copy(src.rotation);
      punchCharacterModel.rotation.y = spawnFacingYaw;
      characterModel.visible = false;
      if (idleCharacterModel) idleCharacterModel.visible = false;
      punchCharacterModel.visible = true;
      punchAction.reset();
      const clip = punchAction.getClip();
      const dur = clip.duration;
      if (reverse) {
        punchAction.time = dur;
        punchAction.timeScale = -speed;
      } else {
        punchAction.time = 0;
        punchAction.timeScale = speed;
      }
      punchAction.enabled = true;
      punchAction.paused = false;
      punchAction.play();
      isPunchPlaying = true;
      if (typeof onImpact === "function") {
        const wallDur = dur / speed;
        /** 클립 진행 0~1 중 타격 시점(1=애니 끝 프레임) */
        const impactFrac = 1;
        const elapsedFrac = reverse ? 1 - impactFrac : impactFrac;
        const delay = Math.max(0, wallDur * elapsedFrac * 1000);
        impactTimeoutId = setTimeout(() => {
          impactTimeoutId = null;
          onImpact();
        }, delay);
      }
    },

    isPunching: () => isPunchPlaying,
  };
}
