/**
 * Stage3 섬 GLB: 템플릿은 전역 캐시에서 한 번만 파싱하고,
 * 씬 인스턴스는 `deepCloneSceneForStage3Instance`로 분리한다.
 */

import {
  loadGltfTemplateCached,
  resolvePublicAssetUrl,
} from "../../common/gltfTemplateCache.js";

export { resolvePublicAssetUrl as resolveStage3PublicModelUrl };

/**
 * @param {string} modelPathFromConfig - config.model.path
 */
export function preloadStage3IslandTemplate(modelPathFromConfig) {
  return loadGltfTemplateCached(resolvePublicAssetUrl(modelPathFromConfig));
}

/**
 * 템플릿 `gltf.scene`과 독립된 인스턴스.
 * geometry/material은 공유해 clone 비용을 최소화한다.
 * (cleanup에서 공유 자원을 dispose하지 않아야 함)
 * @param {import("three").Object3D} source
 */
export function deepCloneSceneForStage3Instance(source) {
  return source.clone(true);
}
