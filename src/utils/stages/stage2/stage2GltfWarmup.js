/**
 * Stage2에 쓰이는 GLB URL을 앱 기동 직후 백그라운드에서 파싱까지 시작한다.
 */

import { STAGE2_CONFIG } from "../../../config/stages/stage2.js";
import {
  loadGltfTemplateCached,
  resolvePublicAssetUrl,
} from "../../common/gltfTemplateCache.js";

/** @returns {string[]} */
function getStage2PrewarmAbsoluteUrls() {
  /** @type {string[]} */
  const urls = [];
  urls.push(resolvePublicAssetUrl(STAGE2_CONFIG.model.path));

  const props = STAGE2_CONFIG.props ?? [];
  for (const prop of props) {
    if (!prop?.path) continue;
    const rel = String(prop.path);
    urls.push(rel.startsWith("http") ? rel : resolvePublicAssetUrl(rel));
  }

  const charPath =
    STAGE2_CONFIG.characterModelPath ?? "/models/common/gum_walk_final.glb";
  urls.push(resolvePublicAssetUrl(charPath));
  const charIdlePath =
    STAGE2_CONFIG.characterIdleModelPath ?? "/models/common/gum_idle.glb";
  urls.push(resolvePublicAssetUrl(charIdlePath));

  return [...new Set(urls)];
}

export function warmStage2GltfTemplateUrls() {
  for (const u of getStage2PrewarmAbsoluteUrls()) {
    void loadGltfTemplateCached(u).catch(() => {});
  }
}
