import { resolvePublicAssetUrl } from "./gltfTemplateCache.js";
import { STAGE3_OBJECTS_CONFIG } from "../../config/stages/stage3/stage3ObjectsConfig.js";

/** `INT_Clock` 클릭 시 `clock.clockSoundPaths` 중 랜덤 1종 재생 */
export function playRandomClockClickSound() {
  const paths = STAGE3_OBJECTS_CONFIG.clock?.clockSoundPaths ?? [];
  if (paths.length === 0) return;
  const path = paths[Math.floor(Math.random() * paths.length)];
  const src = resolvePublicAssetUrl(path);
  const audio = new window.Audio();
  const v = Number(STAGE3_OBJECTS_CONFIG.clock?.clockSoundVolume ?? 0.4);
  audio.volume = Math.min(1, Math.max(0, v));
  audio.preload = "auto";
  audio.src = src;
  audio.play().catch(() => {});
}
