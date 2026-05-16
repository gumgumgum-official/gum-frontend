/**
 * Stage3 cleanup 시 씬·렌더러 리소스 해제
 */
import { disposeFountain } from "../fountainEffect.js";

/**
 * @param {import("three").Scene} scene
 * @param {{
 *   objects: import("three").Object3D[],
 *   fountainState: import("../fountainEffect.js").FountainState | null,
 *   backgroundModel: import("three").Object3D | null,
 *   skyBackgroundTexture: import("three").CanvasTexture | null,
 *   stage3LightingRestore: {
 *     renderer: import("three").WebGLRenderer,
 *     toneMappingExposure: number,
 *     environmentIntensity: number,
 *   } | null,
 *   onPortalVortexCleared: () => void,
 * }} state
 */
export function teardownStage3Scene(scene, state) {
  const {
    objects,
    fountainState,
    backgroundModel,
    skyBackgroundTexture,
    stage3LightingRestore,
    onPortalVortexCleared,
  } = state;

  objects.forEach((obj) => {
    scene.remove(obj);
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

  if (fountainState) {
    disposeFountain(fountainState);
  }

  if (backgroundModel) {
    scene.remove(backgroundModel);
    onPortalVortexCleared();
  }

  if (skyBackgroundTexture) {
    skyBackgroundTexture.dispose();
  }
  scene.background = null;

  if (stage3LightingRestore) {
    const {
      renderer: r,
      toneMappingExposure,
      environmentIntensity,
    } = stage3LightingRestore;
    r.toneMappingExposure = toneMappingExposure;
    scene.environmentIntensity = environmentIntensity;
  }
}
