/**
 * Stage6 HTMLAudio 자동재생 — 사용자 제스처 후 unlock (탭·포탈·/start 클릭 등)
 */
import { applyExtendedAudioVolume } from "../../common/audioGain.js";
import { resolvePublicAssetUrl } from "../../common/gltfTemplateCache.js";

let stage6AudioUnlocked = false;

/** @type {HTMLAudioElement | null} */
let primeAudio = null;

export function isStage6AudioUnlocked() {
  return stage6AudioUnlocked;
}

export function markStage6AudioUnlocked() {
  stage6AudioUnlocked = true;
}

export function resetStage6AudioUnlock() {
  stage6AudioUnlocked = false;
  if (primeAudio) {
    primeAudio.pause();
    primeAudio.src = "";
    primeAudio = null;
  }
}

/**
 * pointerdown/keydown 등 사용자 제스처 안에서 호출.
 * @returns {Promise<void>}
 */
export async function unlockStage6AudioFromUserGesture() {
  if (stage6AudioUnlocked) return;
  stage6AudioUnlocked = true;

  const Ctor =
    window.AudioContext ||
    /** @type {typeof AudioContext | undefined} */ (window.webkitAudioContext);
  if (Ctor) {
    try {
      const ctx = new Ctor();
      if (ctx.state === "suspended") {
        await ctx.resume().catch(() => {});
      }
      const buffer = ctx.createBuffer(1, 1, 22050);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(ctx.destination);
      src.start(0);
      await ctx.close().catch(() => {});
    } catch {
      // ignore
    }
  }

  if (!primeAudio) {
    primeAudio = new window.Audio();
    primeAudio.preload = "auto";
  }
  primeAudio.pause();
  primeAudio.currentTime = 0;
  primeAudio.src = resolvePublicAssetUrl("/static/sounds/click.mp3");
  applyExtendedAudioVolume(primeAudio, 0.02);
  try {
    primeAudio.load();
  } catch {
    // ignore
  }
  try {
    await primeAudio.play();
    primeAudio.pause();
    primeAudio.currentTime = 0;
  } catch {
    // ignore
  }
}
