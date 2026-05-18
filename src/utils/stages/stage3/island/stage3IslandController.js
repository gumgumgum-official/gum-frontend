/**
 * Stage3 배경 GLB onReady — 콜라이더·walkable·캐릭터·껌딱지·인트로
 */
import * as THREE from "three";
import {
  collectIslandStaticColliderBoxes,
  debugOverlappingCollidersAt,
  filterCollidersExcludingDominantTerrain,
  filterCollidersExcludingInflatedMeshBounds,
  filterCollidersExcludingSpawnOverlap,
} from "../islandStaticColliders.js";
import { setupFountainFromModel } from "../fountainEffect.js";
import { createGumFollowersController } from "../gumFollowerController.js";
import {
  collectStage3WalkableFromModel,
  buildStage3MovementBoundsXZ,
  resolveStage3CharacterGroundY,
  resolveStage3SpawnXZ,
} from "./stage3IslandWalkable.js";

/**
 * @param {{
 *   getConfig: () => import("../../../../types.js").Stage3Config,
 *   getIsStageActive: () => boolean,
 *   isGumCancelled: () => boolean,
 *   getScene: () => import("three").Scene | null,
 *   getGlbLoader: () => ReturnType<typeof import("../../../common/assetLoaders.js").getGLBLoader>,
 *   getRenderer: () => import("three").WebGLRenderer | null,
 *   getCharacter: () => ReturnType<typeof import("../characterController.js").createCharacterController> | null,
 *   setCameraRef: (camera: import("three").PerspectiveCamera) => void,
 *   setGroundY: (y: number) => void,
 *   setCollidersRef: (colliders: import("../islandStaticColliders.js").IslandColliderAabb[]) => void,
 *   setFlowerExclusionBoxes?: (boxes: {minX:number,maxX:number,minZ:number,maxZ:number}[]) => void,
 *   setBackgroundModel: (model: import("three").Object3D) => void,
 *   setFountainState: (state: import("../fountainEffect.js").FountainState | null) => void,
 *   setPortalVortexMaterial: (material: import("three").ShaderMaterial | null) => void,
 *   setGumFollowers: (followers: ReturnType<typeof createGumFollowersController> | null) => void,
 *   drainPendingGumStickCardNums: () => string[],
 *   onUiMounted: () => void,
 *   onIntroAudio: () => void,
 *   onDebugOrbitTarget: (center: import("three").Vector3) => void,
 *   onMonitorBackgroundReady: () => void,
 *   onCameraIntroStart: (center: import("three").Vector3, bounds: import("three").Box3) => void,
 *   scheduleDeferredSetup: (task: () => void) => void,
 *   registerIslandInteractions: (model: import("three").Object3D, animations: import("three").AnimationClip[]) => void,
 *   applyPortalVortex: (model: import("three").Object3D) => import("three").ShaderMaterial | null,
 *   preloadIceCream: () => void,
 * }} params
 */
export function createStage3IslandController({
  getConfig,
  getIsStageActive,
  isGumCancelled,
  getScene,
  getGlbLoader,
  getRenderer,
  getCharacter,
  setCameraRef,
  setGroundY,
  setCollidersRef,
  setFlowerExclusionBoxes = null,
  setBackgroundModel,
  setFountainState,
  setPortalVortexMaterial,
  setGumFollowers,
  drainPendingGumStickCardNums,
  onUiMounted,
  onIntroAudio,
  onDebugOrbitTarget,
  onMonitorBackgroundReady,
  onCameraIntroStart,
  scheduleDeferredSetup,
  registerIslandInteractions,
  applyPortalVortex,
  preloadIceCream,
}) {
  /**
   * @param {{
   *   model: import("three").Object3D,
   *   center: import("three").Vector3,
   *   backgroundMaxY: number,
   *   backgroundBounds: import("three").Box3,
   *   animations?: unknown[],
   * }} payload
   * @param {import("three").PerspectiveCamera} stageCamera
   */
  function onBackgroundReady(payload, stageCamera) {
    const { model, center, backgroundMaxY, backgroundBounds } = payload;
    const animations = /** @type {import("three").AnimationClip[]} */ (
      payload.animations ?? []
    );
    const config = getConfig();
    const scene = getScene();
    const character = getCharacter();
    if (!scene || !character) return;

    setFountainState(setupFountainFromModel(model, animations));
    setBackgroundModel(model);
    onUiMounted();
    if (getIsStageActive()) {
      onIntroAudio();
    }
    onDebugOrbitTarget(center);
    setCameraRef(stageCamera);
    onMonitorBackgroundReady();

    const useStatic = config.model.useStaticObstacleColliders !== false;
    const initialSpawnXZ = resolveStage3SpawnXZ(
      backgroundBounds,
      config.character?.spawnOffset,
    );
    const spawnCollisionRadius =
      (typeof config.character?.collisionRadius === "number"
        ? config.character.collisionRadius
        : 0.55) + 0.35;

    const rawColliders = useStatic
      ? collectIslandStaticColliderBoxes(model, backgroundBounds)
      : [];
    const islandStaticColliders = useStatic
      ? filterCollidersExcludingSpawnOverlap(
          filterCollidersExcludingInflatedMeshBounds(
            filterCollidersExcludingDominantTerrain(
              rawColliders,
              backgroundBounds,
            ),
          ),
          initialSpawnXZ.x,
          initialSpawnXZ.z,
          spawnCollisionRadius,
        )
      : [];

    // #region agent log
    const _dbgPicnicPos = new THREE.Vector3();
    const picnicZone = model.getObjectByName("Picnic_Zone");
    if (picnicZone) picnicZone.getWorldPosition(_dbgPicnicPos);
    const picnicFinalHits = debugOverlappingCollidersAt(
      _dbgPicnicPos.x,
      _dbgPicnicPos.z,
      spawnCollisionRadius,
      islandStaticColliders,
    );
    fetch("http://127.0.0.1:7759/ingest/35888210-4385-4e6e-bf1e-df1b53425c05", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "672540",
      },
      body: JSON.stringify({
        sessionId: "672540",
        hypothesisId: "H2-H4",
        location: "stage3IslandController.js:onBackgroundReady",
        message: "final colliders at picnic zone",
        data: {
          rawCount: rawColliders.length,
          finalCount: islandStaticColliders.length,
          picnicPos: { x: _dbgPicnicPos.x, z: _dbgPicnicPos.z },
          picnicFinalHits: picnicFinalHits.slice(0, 10),
          pathProbeHits: debugOverlappingCollidersAt(
            -5,
            -25.9,
            spawnCollisionRadius,
            islandStaticColliders,
          ).slice(0, 8),
          spawnXZ: initialSpawnXZ,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    const {
      meshes: walkableMeshes,
      bounds: walkableBounds,
      hasBounds,
    } = collectStage3WalkableFromModel(model);

    setCollidersRef(islandStaticColliders);

    if (setFlowerExclusionBoxes) {
      const exclusionBoxes = [];
      const _tmpBox = new THREE.Box3();
      model.traverse((obj) => {
        if (!obj.isMesh) return;
        let p = /** @type {THREE.Object3D | null} */ (obj);
        while (p) {
          const n = typeof p.name === "string" ? p.name.toUpperCase() : "";
          if (
            n.startsWith("INT_") ||
            n.startsWith("OBJ_") ||
            n.startsWith("DECO_")
          ) {
            _tmpBox.setFromObject(obj);
            if (!_tmpBox.isEmpty()) {
              exclusionBoxes.push({
                minX: _tmpBox.min.x,
                maxX: _tmpBox.max.x,
                minZ: _tmpBox.min.z,
                maxZ: _tmpBox.max.z,
              });
            }
            break;
          }
          p = p.parent;
        }
      });
      setFlowerExclusionBoxes(exclusionBoxes);
    }

    const characterGroundY = resolveStage3CharacterGroundY({
      backgroundMaxY,
      backgroundBounds,
      walkableMeshes,
      walkableBounds,
      hasWalkableBounds: hasBounds,
      spawnOffset: config.character?.spawnOffset,
    });
    setGroundY(characterGroundY);

    const movementBoundsXZ = buildStage3MovementBoundsXZ(
      walkableBounds,
      hasBounds,
      backgroundBounds,
      initialSpawnXZ,
      config.character?.boundsPadding ?? 0.5,
    );

    character.setup(characterGroundY, backgroundBounds, islandStaticColliders, {
      walkableMeshes,
      walkableBounds: hasBounds ? walkableBounds : null,
      movementBoundsXZ,
      worldSpawnXZ: initialSpawnXZ,
      islandModel: model,
    });

    if (getIsStageActive()) {
      onCameraIntroStart(center, backgroundBounds);
    }

    scheduleDeferredSetup(() => {
      if (!getIsStageActive()) return;
      registerIslandInteractions(model, animations);
      setPortalVortexMaterial(applyPortalVortex(model));
    });

    const gumFollowers = createGumFollowersController({
      scene,
      glbLoader: getGlbLoader(),
      config,
      getUserState: () => ({
        position: character.getPosition?.() ?? null,
        yaw: character.getYaw?.() ?? null,
        moving: character.getIsMoving?.() ?? false,
      }),
      getHeadAnchorWorld: (out) => character.getHeadAnchorWorld?.(out) ?? false,
      renderer: getRenderer(),
      getCamera: () => stageCamera,
    });
    setGumFollowers(gumFollowers);

    void gumFollowers
      .init({
        backgroundMaxY: characterGroundY,
        isCancelled: () => !getIsStageActive() || isGumCancelled(),
        staticColliderBoxes: islandStaticColliders,
        walkableMeshes,
        walkableBounds: hasBounds ? walkableBounds : null,
        initialSpawnXZ,
      })
      .then(() => {
        if (!getIsStageActive()) return;
        const pending = drainPendingGumStickCardNums();
        for (const cardNum of pending) {
          if (typeof cardNum === "string")
            gumFollowers.addStickFollower(cardNum);
        }
      })
      .catch((e) => {
        if (import.meta.env.DEV) {
          console.warn("[Stage3] 껌딱지 모델 로드 실패:", e);
        }
        gumFollowers.cleanup?.();
        setGumFollowers(null);
      });

    void preloadIceCream();
  }

  return { onBackgroundReady };
}
