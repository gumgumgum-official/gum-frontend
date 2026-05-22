/**
 * Stage3에 쓰이는 GLB URL을 앱 기동 직후 백그라운드에서 파싱까지 시작한다.
 * 핵심 에셋(섬·캐릭터)을 먼저 시작하고, 꽃·캔 등 부가 에셋은 idle 콜백으로 대역폭 충돌을 줄인다.
 */
import { STAGE3_CONFIG } from "../../../config/stages/stage3/stage3.js";
import { STAGE3_STANDALONE_FLOWER_GLB_PATHS } from "../../../config/stages/stage3/stage3ObjectsConfig.js";
import {
  loadGltfTemplateCached,
  resolvePublicAssetUrl,
} from "../../common/gltfTemplateCache.js";

/**
 * @returns {{ critical: string[]; deferred: string[] }}
 */
function getStage3PrewarmUrlGroups() {
  const critical = [];
  const deferred = [];

  critical.push(resolvePublicAssetUrl(STAGE3_CONFIG.model.path));
  const charPath =
    STAGE3_CONFIG.characterModelPath ?? "/models/common/user_walk_v2.glb";
  critical.push(resolvePublicAssetUrl(charPath));
  const charIdlePath =
    STAGE3_CONFIG.characterIdleModelPath ?? "/models/common/user_idle.glb";
  critical.push(resolvePublicAssetUrl(charIdlePath));
  const gumPath =
    STAGE3_CONFIG.character?.gumFollowers?.models?.modelPath ??
    "/models/common/gum/gum_walk_final.glb";
  critical.push(resolvePublicAssetUrl(gumPath));
  const gumIdlePath =
    STAGE3_CONFIG.character?.gumFollowers?.models?.idleModelPath ??
    "/models/common/gum/gum_idle.glb";
  critical.push(resolvePublicAssetUrl(gumIdlePath));

  const punchPath =
    STAGE3_CONFIG.characterPunchModelPath ?? "/models/stage3/user_punch.glb";
  if (punchPath) deferred.push(resolvePublicAssetUrl(punchPath));
  for (const rel of STAGE3_CONFIG.vendingMachine?.spawnPaths ?? []) {
    deferred.push(rel.startsWith("http") ? rel : resolvePublicAssetUrl(rel));
  }
  for (const rel of STAGE3_STANDALONE_FLOWER_GLB_PATHS) {
    deferred.push(resolvePublicAssetUrl(rel));
  }

  return {
    critical: [...new Set(critical)],
    deferred: [...new Set(deferred)],
  };
}

export function warmStage3GltfTemplateUrls() {
  const { critical, deferred } = getStage3PrewarmUrlGroups();
  for (const u of critical) {
    void loadGltfTemplateCached(u).catch(() => {});
  }
  const startDeferred = () => {
    for (const u of deferred) {
      void loadGltfTemplateCached(u).catch(() => {});
    }
  };
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(startDeferred, { timeout: 4000 });
  } else {
    setTimeout(startDeferred, 2000);
  }
}

/**
 * `/start`에서 키오스크로 넘어가기 전에 호출: 섬·캐릭터 등 핵심 GLB 파싱이 끝날 때까지 대기해
 * Stage3 첫 프레임에 하늘만 보이는 구간을 줄인다.
 * @returns {Promise<void>}
 */
export async function waitForStage3GltfTemplatesReady() {
  const { critical } = getStage3PrewarmUrlGroups();
  await Promise.all(
    critical.map(async (u) => {
      try {
        await loadGltfTemplateCached(u);
      } catch {
        /* 네비게이션은 진행; Stage3에서 재시도 */
      }
    }),
  );
}
