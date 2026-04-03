/**
 * Stage3에 쓰이는 GLB URL을 앱 기동 직후 백그라운드에서 파싱까지 시작한다.
 */
import { STAGE3_CONFIG } from "../../../config/stages/stage3.js";
import {
  loadGltfTemplateCached,
  resolvePublicAssetUrl,
} from "../../common/gltfTemplateCache.js";

export function warmStage3GltfTemplateUrls() {
  /** @type {string[]} */
  const urls = [];
  urls.push(resolvePublicAssetUrl(STAGE3_CONFIG.model.path));
  const charPath =
    STAGE3_CONFIG.characterModelPath ?? "/models/common/user_walking_color.glb";
  urls.push(resolvePublicAssetUrl(charPath));
  const gumPath =
    STAGE3_CONFIG.character?.gumFollowers?.models?.modelPath ??
    "/models/common/walk__gum.glb";
  urls.push(resolvePublicAssetUrl(gumPath));
  for (const rel of STAGE3_CONFIG.icecreamCart?.spawnPaths ?? []) {
    urls.push(rel.startsWith("http") ? rel : resolvePublicAssetUrl(rel));
  }
  for (const u of urls) {
    void loadGltfTemplateCached(u).catch(() => {});
  }
}
