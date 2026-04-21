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
 * 템플릿 `gltf.scene`과 독립된 인스턴스 (cleanup 시 geometry/material dispose 안전, 정적 메시 위주)
 * @param {import("three").Object3D} source
 */
export function deepCloneSceneForStage3Instance(source) {
  const root = source.clone(true);
  root.traverse((obj) => {
    const mesh = /** @type {import("three").Mesh} */ (obj);
    if (mesh.isMesh) {
      if (mesh.geometry) mesh.geometry = mesh.geometry.clone();
      const mat = mesh.material;
      if (Array.isArray(mat)) {
        mesh.material = mat.map((m) => (m?.clone ? m.clone() : m));
      } else if (mat?.clone) {
        mesh.material = mat.clone();
      }
    }
  });
  return root;
}
