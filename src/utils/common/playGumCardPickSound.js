import { resolvePublicAssetUrl } from "./gltfTemplateCache.js";
import {
  GUM_CARDS_PICK_SOUND_PATHS,
  GUM_CARDS_PICK_SOUND_VOLUME,
} from "../../config/stages/stage3/gumCardsConfig.js";

/** 카드 모달에서 카드를 선택(뒤집기)할 때 `GUM_CARDS_PICK_SOUND_PATHS` 중 랜덤 재생 */
export function playRandomGumCardPickSound() {
  const paths = GUM_CARDS_PICK_SOUND_PATHS ?? [];
  if (paths.length === 0) return;
  const path = paths[Math.floor(Math.random() * paths.length)];
  const src = resolvePublicAssetUrl(path);
  const audio = new window.Audio();
  const v = Number(GUM_CARDS_PICK_SOUND_VOLUME ?? 0.32);
  audio.volume = Math.min(1, Math.max(0, v));
  audio.preload = "auto";
  audio.src = src;
  audio.play().catch(() => {});
}
