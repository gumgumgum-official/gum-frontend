/**
 * 동일 URL의 GLTF는 전역에서 한 번만 파싱·디코드하고 Promise를 공유한다.
 * 템플릿 `gltf.scene`은 그대로 두고, 씬에 붙일 때는 clone 전용 유틸을 쓴다.
 */

import { getGLBLoader } from "./assetLoaders.js";

/** @type {Map<string, Promise<import("three/examples/jsm/loaders/GLTFLoader").GLTF>>} */
const _gltfByAbsoluteUrl = new Map();

/** 다음 세션용으로 파싱된 GLTF 캐시를 비운다(동일 탭에서 재진입 시 네트워크에서 다시 로드). */
export function clearGltfTemplateCache() {
  _gltfByAbsoluteUrl.clear();
}

/**
 * public 상대 경로 → 브라우저 요청 URL (VITE_BASE_URL / 서브패스 대비)
 * @param {string} path - 예: `/models/stage3/island.glb`
 */
export function resolvePublicAssetUrl(path) {
  const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return base + p;
}

/**
 * @param {string} absoluteUrl - `resolvePublicAssetUrl` 결과 등 절대·완결 URL
 */
export function loadGltfTemplateCached(absoluteUrl) {
  let p = _gltfByAbsoluteUrl.get(absoluteUrl);
  if (!p) {
    p = getGLBLoader()
      .loadAsync(absoluteUrl)
      .catch((err) => {
        _gltfByAbsoluteUrl.delete(absoluteUrl);
        throw err instanceof Error ? err : new Error(String(err));
      });
    _gltfByAbsoluteUrl.set(absoluteUrl, p);
  }
  return p;
}
