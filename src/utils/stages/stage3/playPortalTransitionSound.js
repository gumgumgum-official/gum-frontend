import { resolvePublicAssetUrl } from "../../common/gltfTemplateCache.js";
import { STAGE3_OBJECTS_CONFIG } from "../../../config/stages/stage3/stage3ObjectsConfig.js";
import { applyExtendedAudioVolume } from "../../common/audioGain.js";
import { markStage6AudioUnlocked } from "../stage6/stage6AudioUnlock.js";

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
  portalTransitionAudio.onplay = () => {
    markStage6AudioUnlocked();
  };
  const p = portalTransitionAudio.play();
  if (p && typeof p.then === "function") {
    p.then(() => markStage6AudioUnlocked()).catch(() => {});
  } else if (p && typeof p.catch === "function") {
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
