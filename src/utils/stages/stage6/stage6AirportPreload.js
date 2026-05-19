/**
 * Stage6 공항 배경 GLB 선로드 (Stage3·포탈 전환·/airport 진입 지연 완화)
 */

import { STAGE6_CONFIG } from "../../../config/stages/stage6/stage6.js";
import {
  loadGltfTemplateCached,
  resolvePublicAssetUrl,
} from "../../common/gltfTemplateCache.js";

export function preloadStage6AirportGlb() {
  const path = STAGE6_CONFIG?.model?.path;
  if (!path) return;
  const url = resolvePublicAssetUrl(path);
  void loadGltfTemplateCached(url).catch(() => {});
}
