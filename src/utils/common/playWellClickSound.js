import { resolvePublicAssetUrl } from "./gltfTemplateCache.js";
import { STAGE3_OBJECTS_CONFIG } from "../../config/stages/stage3/stage3ObjectsConfig.js";
import { applyExtendedAudioVolume } from "./audioGain.js";

/** `INT_Well` 클릭 시 `well.wellSoundPaths` 중 랜덤 1종 재생 */
export function playRandomWellClickSound() {
  const paths = STAGE3_OBJECTS_CONFIG.well?.wellSoundPaths ?? [];
  if (paths.length === 0) return;
  const path = paths[Math.floor(Math.random() * paths.length)];
  const src = resolvePublicAssetUrl(path);
  const audio = new window.Audio();
  const v = Number(STAGE3_OBJECTS_CONFIG.well?.wellSoundVolume ?? 0.35);
  applyExtendedAudioVolume(audio, v);
  audio.preload = "auto";
  audio.src = src;
  audio.play().catch(() => {});
}
