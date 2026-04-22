/**
 * Stage3 글자 크랙/shatter 효과음 플레이어.
 * 크랙: crack1/crack2 중 랜덤(직전과 다르게). 마지막 파열: crack_final 1종.
 */
import { resolvePublicAssetUrl } from "../../common/gltfTemplateCache.js";

const CRACK_PATHS = [
  "/static/sounds/text_crack/crack1.mp3",
  "/static/sounds/text_crack/crack2.mp3",
];
const CRACK_FINAL_PATH = "/static/sounds/text_crack/crack_final.mp3";
const CRACK_VOLUME = 0.55;
const CRACK_FINAL_VOLUME = 0.8;

let lastCrackIdx = -1;
/** @type {HTMLAudioElement | null} */
let crackFinalAudio = null;

function clamp01(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/**
 * 히트마다 호출. 매번 새로운 Audio 객체로 재생해 연타 시 겹쳐도 잘리지 않게.
 * 직전 재생된 인덱스와 다른 파일을 우선 선택.
 */
export function playRandomCrackSound() {
  if (CRACK_PATHS.length === 0) return;
  let idx = Math.floor(Math.random() * CRACK_PATHS.length);
  if (idx === lastCrackIdx && CRACK_PATHS.length > 1) {
    idx = (idx + 1) % CRACK_PATHS.length;
  }
  lastCrackIdx = idx;
  try {
    const a = new window.Audio(resolvePublicAssetUrl(CRACK_PATHS[idx]));
    a.volume = clamp01(CRACK_VOLUME);
    const p = a.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
  } catch {
    // ignore (SSR, codec, autoplay 차단)
  }
}

/** 최종 shatter 시점 1회 재생. 공유 Audio 인스턴스 재사용. */
export function playCrackFinalSound() {
  if (!crackFinalAudio) {
    crackFinalAudio = new window.Audio();
    crackFinalAudio.preload = "auto";
    crackFinalAudio.src = resolvePublicAssetUrl(CRACK_FINAL_PATH);
  }
  crackFinalAudio.volume = clamp01(CRACK_FINAL_VOLUME);
  crackFinalAudio.pause();
  crackFinalAudio.currentTime = 0;
  const p = crackFinalAudio.play();
  if (p && typeof p.catch === "function") p.catch(() => {});
}

export function disposeStage3CrackSound() {
  if (crackFinalAudio) {
    crackFinalAudio.pause();
    crackFinalAudio.src = "";
    crackFinalAudio = null;
  }
  lastCrackIdx = -1;
}
