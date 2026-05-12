/**
 * Stage3 글자 크랙/shatter 효과음 플레이어.
 * 크랙: crack1/crack2 중 랜덤(직전과 다르게). 마지막 파열: crack_final 1종.
 */
import { resolvePublicAssetUrl } from "../../common/gltfTemplateCache.js";
import { applyExtendedAudioVolume } from "../../common/audioGain.js";
import { STAGE3_AUDIO_CONFIG } from "../../../config/stages/stage3/stage3AudioConfig.js";

const CRACK_PATHS = [
  "/static/sounds/text_crack/crack1.mp3",
  "/static/sounds/text_crack/crack2.mp3",
];
const CRACK_FINAL_PATH = "/static/sounds/text_crack/crack_final.mp3";
const FLOWER_MAGIC_PATHS = [
  "/static/sounds/text_crack/flower_magic.mp3",
  "/static/sounds/text_crack/flower_magic2.mp3",
];
const DROP_PATH = "/static/sounds/text_crack/drop.mp3";
const getCrackVolume = () => Number(STAGE3_AUDIO_CONFIG.crackVolume ?? 1.6);
const getCrackFinalVolume = () =>
  Number(STAGE3_AUDIO_CONFIG.crackFinalVolume ?? 1.6);
const getFlowerMagicVolume = () =>
  Number(STAGE3_AUDIO_CONFIG.flowerMagicVolume ?? 1.6);
const getDropVolume = () => Number(STAGE3_AUDIO_CONFIG.dropVolume ?? 1.6);

let lastCrackIdx = -1;
/** @type {HTMLAudioElement | null} */
let dropAudio = null;
/** @type {HTMLAudioElement | null} */
let crackFinalAudio = null;
/** @type {HTMLAudioElement[]} */
let flowerMagicAudios = [];

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
    applyExtendedAudioVolume(a, getCrackVolume());
    const p = a.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
  } catch {
    // ignore (SSR, codec, autoplay 차단)
  }
}

/**
 * 첫 꽃이 피어나는 순간 1회만 재생(호출부에서 가드). flower_magic과 flower_magic2를
 * 동시에 겹쳐 재생. 공유 Audio 인스턴스 재사용으로 이중 호출 시 처음부터 다시 재생.
 */
export function playFlowerMagicSound() {
  if (flowerMagicAudios.length === 0) {
    flowerMagicAudios = FLOWER_MAGIC_PATHS.map((path) => {
      const a = new window.Audio();
      a.preload = "auto";
      a.src = resolvePublicAssetUrl(path);
      return a;
    });
  }
  const vol = getFlowerMagicVolume();
  for (const a of flowerMagicAudios) {
    applyExtendedAudioVolume(a, vol);
    a.pause();
    a.currentTime = 0;
    const p = a.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
  }
}

/** 최종 shatter 시점 1회 재생. 공유 Audio 인스턴스 재사용. */
export function playCrackFinalSound() {
  if (!crackFinalAudio) {
    crackFinalAudio = new window.Audio();
    crackFinalAudio.preload = "auto";
    crackFinalAudio.src = resolvePublicAssetUrl(CRACK_FINAL_PATH);
  }
  applyExtendedAudioVolume(crackFinalAudio, getCrackFinalVolume());
  crackFinalAudio.pause();
  crackFinalAudio.currentTime = 0;
  const p = crackFinalAudio.play();
  if (p && typeof p.catch === "function") p.catch(() => {});
}

/** 글자가 바닥에 첫 착지하는 순간 1회 재생. */
export function playDropSound() {
  if (!dropAudio) {
    dropAudio = new window.Audio();
    dropAudio.preload = "auto";
    dropAudio.src = resolvePublicAssetUrl(DROP_PATH);
  }
  applyExtendedAudioVolume(dropAudio, getDropVolume());
  dropAudio.pause();
  dropAudio.currentTime = 0;
  const p = dropAudio.play();
  if (p && typeof p.catch === "function") p.catch(() => {});
}

export function disposeStage3CrackSound() {
  if (crackFinalAudio) {
    crackFinalAudio.pause();
    crackFinalAudio.src = "";
    crackFinalAudio = null;
  }
  if (dropAudio) {
    dropAudio.pause();
    dropAudio.src = "";
    dropAudio = null;
  }
  for (const a of flowerMagicAudios) {
    a.pause();
    a.src = "";
  }
  flowerMagicAudios = [];
  lastCrackIdx = -1;
}
