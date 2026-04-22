import { resolvePublicAssetUrl } from "./gltfTemplateCache.js";
import { STAGE3_OBJECTS_CONFIG } from "../../config/stages/stage3/stage3ObjectsConfig.js";
import { applyExtendedAudioVolume } from "./audioGain.js";

/** @type {HTMLAudioElement | null} */
let streetLightAudio = null;
let lastStreetLightSoundIndex = -1;

/**
 * @param {number} length
 */
function pickStreetLightSoundIndex(length) {
  if (length <= 1) return 0;
  const webCrypto =
    typeof globalThis !== "undefined" && globalThis.crypto
      ? globalThis.crypto
      : null;
  let idx = 0;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    if (webCrypto?.getRandomValues) {
      const buf = new Uint32Array(1);
      webCrypto.getRandomValues(buf);
      idx = buf[0] % length;
    } else {
      idx = Math.floor(Math.random() * length);
    }
    if (idx !== lastStreetLightSoundIndex) break;
  }
  if (idx === lastStreetLightSoundIndex) {
    idx = (lastStreetLightSoundIndex + 1) % length;
  }
  lastStreetLightSoundIndex = idx;
  return idx;
}

/** GLB `INT_StreetLight*` 클릭 시 설정된 MP3 중 랜덤 1종 (연속 클릭 시 직전과 다른 파일 우선). */
export function playRandomStreetLightClickSound() {
  const paths = STAGE3_OBJECTS_CONFIG.streetLight?.streetLightSoundPaths ?? [];
  if (paths.length === 0) return;
  const idx = pickStreetLightSoundIndex(paths.length);
  const src = resolvePublicAssetUrl(paths[idx]);
  const v = Number(
    STAGE3_OBJECTS_CONFIG.streetLight?.streetLightSoundVolume ?? 0.5,
  );
  if (!streetLightAudio) {
    streetLightAudio = new window.Audio();
    streetLightAudio.preload = "auto";
  }
  applyExtendedAudioVolume(streetLightAudio, v);
  streetLightAudio.pause();
  streetLightAudio.currentTime = 0;
  streetLightAudio.src = src;
  try {
    streetLightAudio.load();
  } catch {
    // ignore
  }
  const p = streetLightAudio.play();
  if (p && typeof p.catch === "function") {
    p.catch(() => {});
  }
}

export function disposeStreetLightSound() {
  if (streetLightAudio) {
    streetLightAudio.pause();
    streetLightAudio.src = "";
    streetLightAudio = null;
  }
  lastStreetLightSoundIndex = -1;
}
