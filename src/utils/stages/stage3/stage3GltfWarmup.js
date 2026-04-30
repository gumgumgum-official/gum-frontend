/**
 * Stage3에 쓰이는 GLB URL을 앱 기동 직후 백그라운드에서 파싱까지 시작한다.
 */
import { STAGE3_CONFIG } from "../../../config/stages/stage3.js";
import { STAGE3_STANDALONE_FLOWER_GLB_PATHS } from "../../../config/stages/stage3/stage3ObjectsConfig.js";
import {
  loadGltfTemplateCached,
  resolvePublicAssetUrl,
} from "../../common/gltfTemplateCache.js";

function debugLogStage3Warmup(
  runId,
  hypothesisId,
  location,
  message,
  data = {},
) {
  // #region agent log
  fetch("http://127.0.0.1:7759/ingest/35888210-4385-4e6e-bf1e-df1b53425c05", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "2e4bd2",
    },
    body: JSON.stringify({
      sessionId: "2e4bd2",
      runId,
      hypothesisId,
      location,
      message,
      data,
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
}

function nowMs() {
  return globalThis.performance?.now?.() ?? Date.now();
}

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
  const punchPath =
    STAGE3_CONFIG.characterPunchModelPath ?? "/models/stage3/user_punch.glb";
  if (punchPath) {
    urls.push(resolvePublicAssetUrl(punchPath));
  }
  const gumPath =
    STAGE3_CONFIG.character?.gumFollowers?.models?.modelPath ??
    "/models/common/gum_walk_final.glb";
  urls.push(resolvePublicAssetUrl(gumPath));
  const gumIdlePath =
    STAGE3_CONFIG.character?.gumFollowers?.models?.idleModelPath ??
    "/models/common/gum_idle.glb";
  urls.push(resolvePublicAssetUrl(gumIdlePath));
  for (const rel of STAGE3_CONFIG.icecreamCart?.spawnPaths ?? []) {
    urls.push(rel.startsWith("http") ? rel : resolvePublicAssetUrl(rel));
  }
  for (const rel of STAGE3_STANDALONE_FLOWER_GLB_PATHS) {
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
  const runId = `stage3-warmup-${Date.now()}`;
  const t0 = nowMs();
  debugLogStage3Warmup(
    runId,
    "H1",
    "stage3GltfWarmup.js:waitForStage3GltfTemplatesReady:start",
    "Stage3 warmup wait started",
    { urlCount: urls.length },
  );
  await Promise.all(
    urls.map(async (u) => {
      const itemT0 = nowMs();
      try {
        await loadGltfTemplateCached(u);
        debugLogStage3Warmup(
          runId,
          "H2",
          "stage3GltfWarmup.js:waitForStage3GltfTemplatesReady:itemSuccess",
          "Stage3 warmup URL resolved",
          { url: u, elapsedMs: Math.round(nowMs() - itemT0) },
        );
      } catch {
        debugLogStage3Warmup(
          runId,
          "H3",
          "stage3GltfWarmup.js:waitForStage3GltfTemplatesReady:itemFail",
          "Stage3 warmup URL failed",
          { url: u, elapsedMs: Math.round(nowMs() - itemT0) },
        );
        /* 네비게이션은 진행; Stage3에서 재시도 */
      }
    }),
  );
  debugLogStage3Warmup(
    runId,
    "H1",
    "stage3GltfWarmup.js:waitForStage3GltfTemplatesReady:done",
    "Stage3 warmup wait finished",
    { elapsedMs: Math.round(nowMs() - t0), urlCount: urls.length },
  );
}
