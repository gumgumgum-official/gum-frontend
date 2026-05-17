/**
 * Stage3 배경 GLB onReady — 콜라이더·walkable·캐릭터·껌딱지·인트로
 */
import {
  collectIslandStaticColliderBoxes,
  filterCollidersExcludingDominantTerrain,
} from "../islandStaticColliders.js";
import { setupFountainFromModel } from "../fountainEffect.js";
import { createGumFollowersController } from "../gumFollowerController.js";
import {
  collectStage3WalkableFromModel,
  buildStage3AllowedBoundsXZ,
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
    setCameraRef(stageCamera);
    setGroundY(backgroundMaxY);
    onDebugOrbitTarget(center);

    // 콜라이더·walkable 수집 전에 카메라 인트로를 먼저 시작(진입 자막만 Stage3에서 지연)
    if (getIsStageActive()) {
      onCameraIntroStart(center, backgroundBounds);
    }

    onUiMounted();
    onMonitorBackgroundReady();

    const useStatic = config.model.useStaticObstacleColliders !== false;
    const rawColliders = useStatic
      ? collectIslandStaticColliderBoxes(model)
      : [];
    const islandStaticColliders = useStatic
      ? filterCollidersExcludingDominantTerrain(rawColliders, backgroundBounds)
      : [];

    const {
      meshes: walkableMeshes,
      bounds: walkableBounds,
      hasBounds,
    } = collectStage3WalkableFromModel(model);

    setCollidersRef(islandStaticColliders);

    character.setup(backgroundMaxY, backgroundBounds, islandStaticColliders, {
      walkableMeshes,
      allowedBoundsXZ: buildStage3AllowedBoundsXZ(walkableBounds, hasBounds),
    });

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
        backgroundMaxY,
        isCancelled: () => !getIsStageActive() || isGumCancelled(),
        staticColliderBoxes: islandStaticColliders,
        walkableMeshes,
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
