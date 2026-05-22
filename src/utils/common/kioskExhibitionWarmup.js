/**
 * 전시 키오스크 반복 루프(/start → /kiosk → /airport)용 에셋 선로드.
 * 메모리 GLTF 캐시는 유지하고, idle 시간에 PNG·누락 GLB를 파싱/디코드한다.
 */

import { CARDS } from "../../config/stages/stage3/gumCardsConfig.js";
import { STAGE3_OBJECTS_CONFIG } from "../../config/stages/stage3/stage3ObjectsConfig.js";
import { STAMP_POSTER_IMAGE_PATH } from "../../config/stages/stage3/stage3Stamp.js";
import { getStage3PrewarmAbsoluteUrls } from "../stages/stage3/stage3GltfWarmup.js";
import { preloadStage6AirportGlb } from "../stages/stage6/stage6AirportPreload.js";
import {
  loadGltfTemplateCached,
  resolvePublicAssetUrl,
} from "./gltfTemplateCache.js";
import { preloadImageUrls } from "./preloadImages.js";

export const TENT_SCENE_GLB_PATH = "/models/stage3/tent_gum_scene.glb";
const TENT_SCENE_HDRI_PATH = "/hdri/sunny_rose_garden_1k.exr";

/** @type {Promise<void> | null} */
let idleWarmPromise = null;
/** @type {Promise<void> | null} */
let criticalGlbPromise = null;

/**
 * @returns {string[]}
 */
export function getKioskExhibitionImageUrls() {
  /** @type {string[]} */
  const urls = [];
  for (const card of CARDS) {
    if (card.img) urls.push(card.img);
  }
  const notice = STAGE3_OBJECTS_CONFIG.notice;
  if (notice?.posterImages) {
    for (const rel of Object.values(notice.posterImages)) {
      urls.push(resolvePublicAssetUrl(rel));
    }
  }
  for (const rel of notice?.voteCandidateImages ?? []) {
    urls.push(resolvePublicAssetUrl(rel));
  }
  if (notice?.guestbookFullscreenBg) {
    urls.push(resolvePublicAssetUrl(notice.guestbookFullscreenBg));
  }
  urls.push(resolvePublicAssetUrl(STAMP_POSTER_IMAGE_PATH));
  return [...new Set(urls)];
}

/**
 * /kiosk·complete=1 전에 파싱 완료를 기다릴 핵심 GLB URL
 * @returns {string[]}
 */
export function getKioskExhibitionCriticalGlbUrls() {
  const stage3 = getStage3PrewarmAbsoluteUrls({
    includeVendingMachineSpawnPaths: false,
  });
  const tent = resolvePublicAssetUrl(TENT_SCENE_GLB_PATH);
  return [...new Set([...stage3, tent])];
}

/**
 * @param {string[]} urls
 * @returns {Promise<void>}
 */
function loadGlbUrls(urls) {
  return Promise.all(
    urls.map(async (u) => {
      try {
        await loadGltfTemplateCached(u);
      } catch {
        /* Stage·모달에서 재시도 */
      }
    }),
  ).then(() => {});
}

function scheduleIdle(task) {
  if (typeof globalThis.requestIdleCallback === "function") {
    globalThis.requestIdleCallback(
      () => {
        void task();
      },
      { timeout: 4_000 },
    );
  } else {
    globalThis.setTimeout(() => {
      void task();
    }, 300);
  }
}

function runIdleWarmup() {
  const glbUrls = [
    ...getStage3PrewarmAbsoluteUrls({ includeVendingMachineSpawnPaths: true }),
    resolvePublicAssetUrl(TENT_SCENE_GLB_PATH),
  ];
  preloadStage6AirportGlb();
  void loadGlbUrls([...new Set(glbUrls)]);
  void preloadImageUrls(getKioskExhibitionImageUrls());
  const hdriUrl = resolvePublicAssetUrl(TENT_SCENE_HDRI_PATH);
  void fetch(hdriUrl, { priority: "low" }).catch(() => {});
}

/**
 * @param {{ priority?: 'immediate' | 'idle' }} [options]
 */
export function warmKioskExhibitionAssets(options = {}) {
  const { priority = "idle" } = options;
  if (priority === "immediate") {
    if (!idleWarmPromise) {
      idleWarmPromise = Promise.resolve().then(() => {
        runIdleWarmup();
      });
    }
    return;
  }
  if (idleWarmPromise) return;
  idleWarmPromise = new Promise((resolve) => {
    scheduleIdle(() => {
      runIdleWarmup();
      resolve();
    });
  });
}

/**
 * complete=1·/kiosk 진입 전: 섬·캐릭터·텐트 GLB 파싱 완료 대기
 * @returns {Promise<void>}
 */
export function waitForKioskExhibitionCriticalGlb() {
  if (!criticalGlbPromise) {
    criticalGlbPromise = loadGlbUrls(getKioskExhibitionCriticalGlbUrls());
  }
  return criticalGlbPromise;
}
