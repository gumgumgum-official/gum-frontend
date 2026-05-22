import * as THREE from "three";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import { inspectGLTF } from "../../common/modelInspector.js";
import {
  loadGltfTemplateCached,
  resolvePublicAssetUrl,
} from "../../common/gltfTemplateCache.js";
import { dispatchStage3IslandExitBlocked } from "../../../events/stage3Events.js";
import { slideMoveXZAgainstAABBs } from "./islandStaticColliders.js";

const WALK_SOUND_REL = "/static/sounds/character_walk.mp3";

/** walkable 계단·단차 메시명 (stage3Island STAGE3_WALKABLE_NAME_PATTERNS와 동기) */
const STAIR_WALKABLE_NAME = /OBJ_Stair|^Stair|OBJ_Step/i;

/**
 * @param {import("three").Intersection} hit
 */
function isStairWalkableHit(hit) {
  let node = hit.object;
  while (node) {
    const name = typeof node.name === "string" ? node.name.trim() : "";
    if (STAIR_WALKABLE_NAME.test(name)) return true;
    node = node.parent;
  }
  return false;
}

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
 *       allowedBoundsXZ?: import("three").Box3 | null,
 *     },
 *   ) => void,
 *   update: (
 *     delta: number,
 *     camera: import("three").Camera,
 *     options?: {
 *       skipCameraFollow?: boolean;
 *       cameraYawAssistRad?: number;
 *       overrideY?: number;
 *     },
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
 *   applyIslandWalkableBounds: (
 *     allowedBounds: import("three").Box3 | null,
 *   ) => void,
 *   setFacingYaw: (yRad: number) => void,
 *   setOpacity: (opacity: number) => void,
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

  // 경계 clamp 값 — setup()에서 1회 계산, update() 매 프레임 재사용
  let _minCx = 0,
    _maxCx = 0,
    _minCz = 0,
    _maxCz = 0;
  /** @type {import("three").Box3 | null} */
  let allowedBoundsXZ = null;

  const _moveVector = new THREE.Vector3();
  const _direction = new THREE.Vector3();
  const _cameraOffset = new THREE.Vector3();
  const _targetPosition = new THREE.Vector3();
  const _lookAtPosition = new THREE.Vector3();
  const _worldUp = new THREE.Vector3(0, 1, 0);
  const _groundRaycaster = new THREE.Raycaster();
  const _groundRayOrigin = new THREE.Vector3();
  const _groundDown = new THREE.Vector3(0, -1, 0);
  const _groundHits = [];
  const _headAnchorBox = new THREE.Box3();
  const GROUND_MISS_TOLERANCE_FRAMES = 5;
  const GROUND_HEIGHT_EASE_SPEED = 16;
  /** 계단·경사 한 칸 오르내리기 허용 높이(m) — 상·하 동일 */
  const MAX_SAFE_STEP_VERT = 0.8;
  const MIN_SAFE_GROUND_OFFSET = 0.12;
  /** 섬 밖 이동 토스트 재표시 간격(초) — App 표시 시간과 동일 */
  const ISLAND_EXIT_TOAST_COOLDOWN_SEC = 2;
  /** allowed/배경 clamp 경계에서 이 거리(m) 안이면 「가장자리」로 간주 */
  const ISLAND_EXIT_EDGE_PROXIMITY = 7;
  /** 계단·단차 위에 있을 때 가장자리 판정을 넓힘 (clamp 박스 안쪽 계단) */
  const ISLAND_EXIT_EDGE_PROXIMITY_ON_STAIRS = 12;
  /** baseGroundY 대비 이 높이(m) 이상이면 계단 위로 간주 */
  const STAIR_LEVEL_MIN_ABOVE_BASE = 0.18;
  /** 이동 방향 전방(m) walkable 없음/절벽이면 섬 밖 시도로 간주 (계단·그네 등 AABB 밖 가장자리) */
  const ISLAND_EXIT_PROBE_DISTANCE = 3;
  let islandExitBlockedToastCooldown = 0;
  let suppressIslandExitToast = false;

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
    /**
     * walkable 수집이 끝난 뒤 이동 허용 XZ만 갱신한다(콜라이더 배열은 동일 참조로 push).
     * @param {THREE.Box3 | null} allowedBounds
     */
    applyIslandWalkableBounds(allowedBounds) {
      allowedBoundsXZ =
        allowedBounds instanceof THREE.Box3 && !allowedBounds.isEmpty()
          ? allowedBounds.clone()
          : null;
    },

    setup(backgroundMaxY, bounds, colliderBoxes = [], setupOptions = {}) {
      const {
        worldSpawnXZ,
        walkableMeshes,
        allowedBoundsXZ: allowedBounds,
        suppressIslandExitToast: suppressToast = false,
      } = setupOptions;
      suppressIslandExitToast = suppressToast;
      backgroundBounds = bounds;
      staticColliderBoxes = colliderBoxes;
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
          } else {
            if (!bounds.isEmpty()) {
              spawnX = (bounds.min.x + bounds.max.x) * 0.5;
              spawnZ = (bounds.min.z + bounds.max.z) * 0.5;
            }
            const off = config.character?.spawnOffset;
            if (off) {
              spawnX += off.x ?? 0;
              spawnZ += off.z ?? 0;
            }
          }
          const charCfg = /** @type {any} */ (config.character);
          const spawnRotationRadRaw = Number(charCfg?.spawnRotationRad);
          const spawnRotationDegRaw = Number(charCfg?.spawnRotationDeg);
          const spawnYaw = Number.isFinite(spawnRotationRadRaw)
            ? spawnRotationRadRaw
            : Number.isFinite(spawnRotationDegRaw)
              ? THREE.MathUtils.degToRad(spawnRotationDegRaw)
              : null;

          characterModel.position.set(spawnX, characterYPosition, spawnZ);
          if (spawnYaw != null) {
            characterModel.rotation.y = spawnYaw;
          }
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

      /**
       * (x,z) walkable 지면 Y
       * @param {number} x
       * @param {number} z
       * @param {number} [refY] - 현재 발 기준 높이(미지정 시 resolvedGroundY)
       * @param {'nearest'|'highest'|'lowest'} [prefer]
       */
      const sampleGroundY = (
        x,
        z,
        refY = resolvedGroundY,
        prefer = "nearest",
      ) => {
        if (!walkableGroundMeshes.length) return baseGroundY;
        const rayOriginY = Math.max(
          refY + 4,
          characterYPosition + 4,
          baseGroundY + 30,
        );
        _groundRayOrigin.set(x, rayOriginY, z);
        _groundRaycaster.set(_groundRayOrigin, _groundDown);
        _groundHits.length = 0;
        _groundRaycaster.intersectObjects(
          walkableGroundMeshes,
          false,
          _groundHits,
        );
        if (_groundHits.length === 0) return null;

        const minReachY = refY - MAX_SAFE_STEP_VERT;
        const maxReachY = refY + MAX_SAFE_STEP_VERT;
        /** @type {number[]} */
        const reachable = [];
        for (let i = 0; i < _groundHits.length; i++) {
          const y = _groundHits[i].point.y;
          if (y < baseGroundY - MIN_SAFE_GROUND_OFFSET) continue;
          if (y < minReachY || y > maxReachY) continue;
          reachable.push(y);
        }
        if (reachable.length === 0) return null;
        if (prefer === "highest") return Math.max(...reachable);
        if (prefer === "lowest") return Math.min(...reachable);
        let bestY = reachable[0];
        let bestDist = Math.abs(bestY - refY);
        for (let i = 1; i < reachable.length; i++) {
          const y = reachable[i];
          const dist = Math.abs(y - refY);
          if (dist < bestDist) {
            bestDist = dist;
            bestY = y;
          }
        }
        return bestY;
      };

      /**
       * 이동 목표 지점 지면 — 계단 오를 때 윗면, 내릴 때 아랫면 우선
       * @param {number} x
       * @param {number} z
       * @param {number} refY
       */
      const sampleGroundYForStep = (x, z, refY) => {
        const high = sampleGroundY(x, z, refY, "highest");
        const low = sampleGroundY(x, z, refY, "lowest");
        const stepUpEps = 0.04;
        const stepDownEps = 0.04;
        if (
          high != null &&
          high > refY + stepUpEps &&
          high - refY <= MAX_SAFE_STEP_VERT
        ) {
          return high;
        }
        if (
          low != null &&
          low < refY - stepDownEps &&
          refY - low <= MAX_SAFE_STEP_VERT
        ) {
          return low;
        }
        return sampleGroundY(x, z, refY, "nearest") ?? high ?? low;
      };

      const resolveGroundY = (x, z) => {
        const sampledGroundY = sampleGroundY(x, z);
        const isSafeSample =
          sampledGroundY != null &&
          sampledGroundY >= baseGroundY - MIN_SAFE_GROUND_OFFSET;
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
      const isInsideAllowedBoundsXZ = (x, z) => {
        // bounds 미적용 시 이동 불가(deferred walkable 대기·실패 시 안전)
        if (!allowedBoundsXZ) return false;
        return (
          x >= allowedBoundsXZ.min.x &&
          x <= allowedBoundsXZ.max.x &&
          z >= allowedBoundsXZ.min.z &&
          z <= allowedBoundsXZ.max.z
        );
      };

      /** @param {number} y */
      const isOnStairLevelY = (y) =>
        y > baseGroundY + STAIR_LEVEL_MIN_ABOVE_BASE;
      /** @param {number} y */
      const getIslandExitEdgeMargin = (y) =>
        isOnStairLevelY(y)
          ? ISLAND_EXIT_EDGE_PROXIMITY_ON_STAIRS
          : ISLAND_EXIT_EDGE_PROXIMITY;

      /**
       * walkable 허용 영역·섬 GLB clamp 경계 안쪽에서 바깥 방향으로 밀 때 true
       * @param {number} x
       * @param {number} z
       * @param {number} dirX
       * @param {number} dirZ
       */
      const isPressingTowardExitBoundary = (x, z, dirX, dirZ) => {
        const margin = getIslandExitEdgeMargin(resolvedGroundY);
        const dirEps = 0.05;
        if (allowedBoundsXZ) {
          const b = allowedBoundsXZ;
          if (x - b.min.x < margin && dirX < -dirEps) return true;
          if (b.max.x - x < margin && dirX > dirEps) return true;
          if (z - b.min.z < margin && dirZ < -dirEps) return true;
          if (b.max.z - z < margin && dirZ > dirEps) return true;
        }
        if (x - _minCx < margin && dirX < -dirEps) return true;
        if (_maxCx - x < margin && dirX > dirEps) return true;
        if (z - _minCz < margin && dirZ < -dirEps) return true;
        if (_maxCz - z < margin && dirZ > dirEps) return true;
        return false;
      };

      /** 섬 이동 clamp 박스(_minCx 등) 가장자리까지 거리(m) */
      const getMinDistToMovementEdgeXZ = (x, z) =>
        Math.min(x - _minCx, _maxCx - x, z - _minCz, _maxCz - z);

      /** walkable 허용 XZ 박스 가장자리까지 거리(m) */
      const getMinDistToAllowedBoundsXZ = (x, z) => {
        if (!allowedBoundsXZ) return Infinity;
        const b = allowedBoundsXZ;
        return Math.min(x - b.min.x, b.max.x - x, z - b.min.z, b.max.z - z);
      };

      /** 이동 clamp·walkable 허용 경계 중 더 가까운 쪽(m) */
      const getMinDistToPlayableEdgeXZ = (x, z) =>
        Math.min(
          getMinDistToMovementEdgeXZ(x, z),
          getMinDistToAllowedBoundsXZ(x, z),
        );

      /**
       * 발 밑 walkable 레이캐스트에 계단 메시가 포함되는지
       * @param {number} x
       * @param {number} z
       */
      const isStandingOnStairMesh = (x, z) => {
        if (!walkableGroundMeshes.length) return false;
        const rayOriginY = Math.max(
          resolvedGroundY + 4,
          characterYPosition + 4,
          baseGroundY + 30,
        );
        _groundRayOrigin.set(x, rayOriginY, z);
        _groundRaycaster.set(_groundRayOrigin, _groundDown);
        _groundHits.length = 0;
        _groundRaycaster.intersectObjects(
          walkableGroundMeshes,
          false,
          _groundHits,
        );
        const minReachY = resolvedGroundY - MAX_SAFE_STEP_VERT - 0.15;
        const maxReachY = resolvedGroundY + MAX_SAFE_STEP_VERT + 0.15;
        for (let i = 0; i < _groundHits.length; i++) {
          const hit = _groundHits[i];
          const y = hit.point.y;
          if (y < baseGroundY - MIN_SAFE_GROUND_OFFSET) continue;
          if (y < minReachY || y > maxReachY) continue;
          if (isStairWalkableHit(hit)) return true;
        }
        return false;
      };

      /**
       * 이동 방향 앞에 바다/절벽·허용 영역 밖이면 true (계단 위 외곽 포함)
       * @param {number} x
       * @param {number} z
       * @param {number} dirX
       * @param {number} dirZ
       */
      const isLeavingPlayableAhead = (x, z, dirX, dirZ) => {
        const len = Math.hypot(dirX, dirZ);
        if (len < 1e-6) return false;
        const nx = dirX / len;
        const nz = dirZ / len;
        const hereY = resolvedGroundY;
        const isOnStairLevel = isOnStairLevelY(hereY);
        const onStairGround = isOnStairLevel || isStandingOnStairMesh(x, z);
        const edgeMargin = getIslandExitEdgeMargin(hereY);
        const nearPlayableEdge = getMinDistToPlayableEdgeXZ(x, z) < edgeMargin;
        const shoreDropEps = 0.12;

        const probeDistances = [
          ISLAND_EXIT_PROBE_DISTANCE,
          ISLAND_EXIT_PROBE_DISTANCE * 1.5,
        ];
        for (let d = 0; d < probeDistances.length; d++) {
          const dist = probeDistances[d];
          const probeX = x + nx * dist;
          const probeZ = z + nz * dist;

          if (allowedBoundsXZ && !isInsideAllowedBoundsXZ(probeX, probeZ)) {
            return true;
          }

          if (!walkableGroundMeshes.length) continue;

          const probeLow = sampleGroundY(probeX, probeZ, hereY, "lowest");
          const probeHigh = sampleGroundY(probeX, probeZ, hereY, "highest");
          if (probeLow == null && probeHigh == null) return true;

          const probeY = probeLow ?? probeHigh;
          if (probeY == null) return true;
          if (probeY < baseGroundY - MIN_SAFE_GROUND_OFFSET) return true;

          if (probeHigh != null && probeHigh > hereY + 0.08) {
            if (nearPlayableEdge || onStairGround) {
              if (allowedBoundsXZ && !isInsideAllowedBoundsXZ(probeX, probeZ)) {
                return true;
              }
              if (probeLow == null) return true;
            } else {
              continue;
            }
          }

          if (probeY < hereY - MAX_SAFE_STEP_VERT) return true;
          if (nearPlayableEdge && probeY < hereY - shoreDropEps) return true;

          if (onStairGround) {
            if (probeLow == null && probeHigh == null) return true;
            if (probeY < hereY - shoreDropEps) return true;
            if (allowedBoundsXZ && !isInsideAllowedBoundsXZ(probeX, probeZ)) {
              return true;
            }
          }
        }

        return false;
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
        const footAhead = 0.35;
        const sampleX = candidateX + _direction.x * footAhead;
        const sampleZ = candidateZ + _direction.z * footAhead;
        const sampledCandidateGroundY = sampleGroundYForStep(
          sampleX,
          sampleZ,
          resolvedGroundY,
        );
        const isAboveMinSafeGround =
          sampledCandidateGroundY != null &&
          sampledCandidateGroundY >= baseGroundY - MIN_SAFE_GROUND_OFFSET;
        const stepDelta =
          isAboveMinSafeGround && sampledCandidateGroundY != null
            ? sampledCandidateGroundY - resolvedGroundY
            : 0;
        const wouldFallTooFar = stepDelta < -MAX_SAFE_STEP_VERT;
        const wouldClimbTooHigh = stepDelta > MAX_SAFE_STEP_VERT;
        const canMoveToCandidate =
          isInsideAllowedBoundsXZ(candidateX, candidateZ) &&
          isAboveMinSafeGround &&
          !wouldFallTooFar &&
          !wouldClimbTooHigh;
        const targetX = canMoveToCandidate ? candidateX : oldX;
        const targetZ = canMoveToCandidate ? candidateZ : oldZ;
        let nextGroundY;
        if (isAboveMinSafeGround && canMoveToCandidate) {
          groundMissFrames = 0;
          resolvedGroundY = sampledCandidateGroundY;
          nextGroundY = sampledCandidateGroundY;
        } else {
          nextGroundY = resolveGroundY(targetX, targetZ);
        }
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

        if (allowedBoundsXZ) {
          const pressingExit = isPressingTowardExitBoundary(
            oldX,
            oldZ,
            _direction.x,
            _direction.z,
          );
          const leavingAhead = isLeavingPlayableAhead(
            oldX,
            oldZ,
            _direction.x,
            _direction.z,
          );
          const edgeMargin = getIslandExitEdgeMargin(resolvedGroundY);
          const nearPlayableEdge =
            getMinDistToPlayableEdgeXZ(oldX, oldZ) < edgeMargin;
          const onStairGround =
            isOnStairLevelY(resolvedGroundY) ||
            isStandingOnStairMesh(oldX, oldZ);
          const movementRejected =
            !canMoveToCandidate ||
            !moved ||
            wouldFallTooFar ||
            wouldClimbTooHigh;
          const blockedAtShore =
            movementRejected &&
            (!isInsideAllowedBoundsXZ(candidateX, candidateZ) ||
              !isAboveMinSafeGround ||
              wouldFallTooFar ||
              wouldClimbTooHigh);
          const tryingToStepUp =
            (sampledCandidateGroundY != null &&
              sampledCandidateGroundY > resolvedGroundY + 0.04) ||
            stepDelta > 0.04;
          const climbBlockedAtEdge =
            nearPlayableEdge && tryingToStepUp && movementRejected;
          const nearEdgePressingOut =
            nearPlayableEdge &&
            isPressingTowardExitBoundary(
              oldX,
              oldZ,
              _direction.x,
              _direction.z,
            );
          const stairAscentTowardExit =
            onStairGround &&
            tryingToStepUp &&
            (pressingExit || leavingAhead || movementRejected);
          const edgeMoveBlocked = nearPlayableEdge && movementRejected;
          const stairMoveBlocked = onStairGround && movementRejected;
          if (
            (pressingExit ||
              leavingAhead ||
              blockedAtShore ||
              climbBlockedAtEdge ||
              nearEdgePressingOut ||
              stairAscentTowardExit ||
              edgeMoveBlocked ||
              stairMoveBlocked) &&
            islandExitBlockedToastCooldown <= 0
          ) {
            if (!suppressIslandExitToast) dispatchStage3IslandExitBlocked();
            islandExitBlockedToastCooldown = ISLAND_EXIT_TOAST_COOLDOWN_SEC;
          }
        }
      } else {
        const p = characterModel.position;
        if (options.overrideY != null) {
          characterYPosition = options.overrideY;
          characterModel.position.y = options.overrideY;
        } else {
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

      if (islandExitBlockedToastCooldown > 0) {
        islandExitBlockedToastCooldown = Math.max(
          0,
          islandExitBlockedToastCooldown - delta,
        );
      }

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
      resolvedGroundY = 0;
      groundMissFrames = 0;
      staticColliderBoxes = [];
      islandExitBlockedToastCooldown = 0;
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

    setFacingYaw(yRad) {
      if (characterModel) characterModel.rotation.y = yRad;
      if (idleCharacterModel) idleCharacterModel.rotation.y = yRad;
    },

    /**
     * walkable 레이캐스트로 확정된 실제 지면 Y를 반영한다.
     * backgroundMaxY 추정값이 실제 지면보다 높을 때 isAboveMinSafeGround 체크를 바로잡는다.
     * @param {number} y
     */
    applyBaseGroundY(y) {
      if (!Number.isFinite(y)) return;
      baseGroundY = y;
      resolvedGroundY = y;
      groundMissFrames = 0;
    },

    /** 캐릭터 모델 전체 메시 opacity 일괄 설정 (에스컬레이터 fade out 용) */
    setOpacity(opacity) {
      const targets = [characterModel, idleCharacterModel];
      for (const root of targets) {
        if (!root) continue;
        root.traverse((obj) => {
          const mesh = /** @type {any} */ (obj);
          if (!mesh.isMesh || !mesh.material) return;
          const mats = Array.isArray(mesh.material)
            ? mesh.material
            : [mesh.material];
          mats.forEach((m) => {
            if (!m) return;
            m.transparent = true;
            m.opacity = opacity;
          });
        });
      }
    },
  };
}
