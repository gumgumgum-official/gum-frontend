import { resolvePublicAssetUrl } from "./gltfTemplateCache.js";
import { STAGE3_OBJECTS_CONFIG } from "../../config/stages/stage3/stage3ObjectsConfig.js";
import { applyExtendedAudioVolume } from "./audioGain.js";

/** @type {HTMLAudioElement | null} */
let portalTransitionAudio = null;

/** 포탈 클릭으로 스테이지 전환이 시작될 때 `portalTransitionSoundPaths` 중 랜덤 1종 재생 */
export function playRandomPortalTransitionSound() {
  const paths =
    STAGE3_OBJECTS_CONFIG.portal_bright?.portalTransitionSoundPaths ?? [];
  if (paths.length === 0) return;
  const path = paths[Math.floor(Math.random() * paths.length)];
  const src = resolvePublicAssetUrl(path);
  const v = Number(
    STAGE3_OBJECTS_CONFIG.portal_bright?.portalTransitionSoundVolume ?? 0.55,
  );
  if (!portalTransitionAudio) {
    portalTransitionAudio = new window.Audio();
    portalTransitionAudio.preload = "auto";
  }
  applyExtendedAudioVolume(portalTransitionAudio, v);
  portalTransitionAudio.pause();
  portalTransitionAudio.currentTime = 0;
  portalTransitionAudio.src = src;
  try {
    portalTransitionAudio.load();
  } catch {
    // ignore
  }
  const p = portalTransitionAudio.play();
  if (p && typeof p.catch === "function") {
    p.catch(() => {});
  }
}

export function disposePortalTransitionSound() {
  if (portalTransitionAudio) {
    portalTransitionAudio.pause();
    portalTransitionAudio.src = "";
    portalTransitionAudio = null;
  }
}
