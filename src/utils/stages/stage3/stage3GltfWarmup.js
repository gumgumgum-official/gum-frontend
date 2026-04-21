/**
 * Stage3에 쓰이는 GLB URL을 앱 기동 직후 백그라운드에서 파싱까지 시작한다.
 */
import { STAGE3_CONFIG } from "../../../config/stages/stage3.js";
import {
  loadGltfTemplateCached,
  resolvePublicAssetUrl,
} from "../../common/gltfTemplateCache.js";

/** @returns {string[]} */
function getStage3PrewarmAbsoluteUrls() {
  /** @type {string[]} */
  const urls = [];
  urls.push(resolvePublicAssetUrl(STAGE3_CONFIG.model.path));
  const charPath =
    STAGE3_CONFIG.characterModelPath ?? "/models/common/user_walk_v2.glb";
  urls.push(resolvePublicAssetUrl(charPath));
  const charIdlePath =
    STAGE3_CONFIG.characterIdleModelPath ?? "/models/common/user_idle.glb";
  urls.push(resolvePublicAssetUrl(charIdlePath));
  const gumPath =
    STAGE3_CONFIG.character?.gumFollowers?.models?.modelPath ??
    "/models/common/gum_walk_final.glb";
  urls.push(resolvePublicAssetUrl(gumPath));
  for (const rel of STAGE3_CONFIG.icecreamCart?.spawnPaths ?? []) {
    urls.push(rel.startsWith("http") ? rel : resolvePublicAssetUrl(rel));
  }
  for (const rel of [
    "/models/common/flowers/pink2.glb",
    "/models/common/flowers/white2.glb",
    "/models/common/flowers/red2.glb",
    "/models/common/flowers/purple2.glb",
    "/models/common/flowers/pastelpink2.glb",
    "/models/common/flowers/blue3.glb",
  ]) {
    urls.push(resolvePublicAssetUrl(rel));
  }
  return [...new Set(urls)];
}

export function warmStage3GltfTemplateUrls() {
  for (const u of getStage3PrewarmAbsoluteUrls()) {
    void loadGltfTemplateCached(u).catch(() => {});
  }
}

/**
 * `/start`에서 키오스크로 넘어가기 전에 호출: 섬·캐릭터 등 템플릿 GLB 파싱이 끝날 때까지 대기해
 * Stage3 첫 프레임에 하늘만 보이는 구간을 줄인다.
 * @returns {Promise<void>}
 */
export async function waitForStage3GltfTemplatesReady() {
  const urls = getStage3PrewarmAbsoluteUrls();
  await Promise.all(
    urls.map((u) =>
      loadGltfTemplateCached(u).catch(() => {
        /* 네비게이션은 진행; Stage3에서 재시도 */
      }),
    ),
  );
}
