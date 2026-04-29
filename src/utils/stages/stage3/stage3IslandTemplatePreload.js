/**
 * Stage3 섬 GLB: 템플릿은 전역 캐시에서 한 번만 파싱하고,
 * 씬 인스턴스는 `deepCloneSceneForStage3Instance`로 분리한다.
 */

import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import {
  loadGltfTemplateCached,
  resolvePublicAssetUrl,
} from "../../common/gltfTemplateCache.js";
// TODO: scene_with_fountain_v6.glb 재익스포트 후 아래 import와 분기 제거
import { loadFountainGltfPatched } from "./fountainGlbPatch.js";

export { resolvePublicAssetUrl as resolveStage3PublicModelUrl };

const FOUNTAIN_GLB_PATH = "scene_with_fountain_v6.glb";

/**
 * @param {string} modelPathFromConfig - config.model.path
 */
export function preloadStage3IslandTemplate(modelPathFromConfig) {
  // TODO: 재익스포트 후 이 분기 제거 (항상 loadGltfTemplateCached 사용)
  if (modelPathFromConfig.includes(FOUNTAIN_GLB_PATH)) {
    return loadFountainGltfPatched(modelPathFromConfig);
  }
  return loadGltfTemplateCached(resolvePublicAssetUrl(modelPathFromConfig));
}

/**
 * 템플릿 `gltf.scene`과 독립된 인스턴스.
 * geometry/material은 공유해 clone 비용을 최소화한다.
 * (cleanup에서 공유 자원을 dispose하지 않아야 함)
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
