/** Stage3 진입 시 씬 밝기 보정 */

export const STAGE3_TONE_MAPPING_EXPOSURE_DELTA = 0.06;
export const STAGE3_ENVIRONMENT_INTENSITY_DELTA = 0.12;

/**
 * @param {import("three").Scene} scene
 * @param {import("three").WebGLRenderer} renderer
 */
export function captureStage3Lighting(scene, renderer) {
  return {
    renderer,
    toneMappingExposure: renderer.toneMappingExposure,
    environmentIntensity: scene.environmentIntensity,
  };
}

/**
 * @param {import("three").Scene} scene
 * @param {import("three").WebGLRenderer} renderer
 */
export function applyStage3LightingBoost(scene, renderer) {
  renderer.toneMappingExposure += STAGE3_TONE_MAPPING_EXPOSURE_DELTA;
  scene.environmentIntensity += STAGE3_ENVIRONMENT_INTENSITY_DELTA;
}

/**
 * @param {import("three").Scene} scene
 * @param {ReturnType<typeof captureStage3Lighting> | null} restore
 */
export function restoreStage3Lighting(scene, restore) {
  if (!restore) return;
  restore.renderer.toneMappingExposure = restore.toneMappingExposure;
  scene.environmentIntensity = restore.environmentIntensity;
}
