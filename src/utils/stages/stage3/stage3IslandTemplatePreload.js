/**
 * Stage3 섬 GLB: 템플릿은 전역 캐시에서 한 번만 파싱하고,
 * 씬 인스턴스는 `deepCloneSceneForStage3Instance`로 분리한다.
 */

import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
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
 * geometry/material은 `.clone()`으로 GPU 리소스를 분리한다.
 * (`teardownStage3Scene`에서 인스턴스별 dispose; 템플릿 캐시는 건드리지 않음)
 * @param {import("three").Object3D} source
 */
export function deepCloneSceneForStage3Instance(source) {
  // SkeletonUtils.clone()으로 뼈대(skeleton) 바인딩까지 정확히 복제한다.
  // 일반 clone(true)은 SkinnedMesh의 bone 참조가 원본을 그대로 가리켜
  // 애니메이션 재생 시 몸체가 움직이지 않는 문제가 생긴다.
  const root = SkeletonUtils.clone(source);
  root.traverse((obj) => {
    const mesh = /** @type {import("three").Mesh} */ (obj);
    if (mesh.isMesh || mesh.isSkinnedMesh) {
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
