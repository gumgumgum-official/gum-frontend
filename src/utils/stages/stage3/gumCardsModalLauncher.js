/**
 * 껌 카드(타로) 모달: Stage3 INT_tent 클릭 등과 React GumCardsModalOverlay 연동
 * — open 시 텐트 효과음 1종 랜덤 재생 (`#` 파일명은 URL 인코딩)
 */

import { resolvePublicAssetUrl } from "../../common/gltfTemplateCache.js";

const EVENT_OPEN = "gum-cards-modal:open";
const EVENT_CLOSE = "gum-cards-modal:close";

const TENT_SOUND_RELS = [
  "/static/sounds/tent/Quick_fabric_rustlin_#1-1775835446790.mp3",
  "/static/sounds/tent/Quick_fabric_rustlin_#2-1775835457914.mp3",
  "/static/sounds/tent/Quick_fabric_rustlin_#3-1775835465321.mp3",
  "/static/sounds/tent/Quick_fabric_rustlin_#4-1775835465322.mp3",
];

function tentSoundAbsoluteUrl(rel) {
  const i = rel.lastIndexOf("/");
  const dir = i >= 0 ? rel.slice(0, i + 1) : "/";
  const file = i >= 0 ? rel.slice(i + 1) : rel;
  return resolvePublicAssetUrl(dir + encodeURIComponent(file));
}

/** @type {HTMLAudioElement | null} */
let tentModalAudio = null;
/** @type {HTMLAudioElement[]} */
let tentPreloadElements = [];

function ensureTentModalAudio() {
  if (!tentModalAudio) {
    tentModalAudio = new window.Audio();
    tentModalAudio.preload = "auto";
    tentModalAudio.volume = 0.75;
  }
  return tentModalAudio;
}

function primeTentSoundCache() {
  if (tentPreloadElements.length > 0 || TENT_SOUND_RELS.length === 0) return;
  tentPreloadElements = TENT_SOUND_RELS.map((rel) => {
    const a = new window.Audio();
    a.preload = "auto";
    a.src = tentSoundAbsoluteUrl(rel);
    try {
      a.load();
    } catch {
      // ignore
    }
    return a;
  });
}

if (typeof window !== "undefined") {
  const run = () => primeTentSoundCache();
  if (typeof globalThis.requestIdleCallback === "function") {
    globalThis.requestIdleCallback(run, { timeout: 4_000 });
  } else {
    setTimeout(run, 500);
  }
}

function playRandomTentModalSound() {
  if (TENT_SOUND_RELS.length === 0) return;
  const rel =
    TENT_SOUND_RELS[Math.floor(Math.random() * TENT_SOUND_RELS.length)];
  const src = tentSoundAbsoluteUrl(rel);
  const audio = ensureTentModalAudio();
  audio.pause();
  audio.currentTime = 0;
  audio.src = src;
  try {
    audio.load();
  } catch {
    // ignore
  }
  const p = audio.play();
  if (p && typeof p.catch === "function") {
    p.catch((err) => {
      if (import.meta.env.DEV) {
        console.warn("[gumCardsModal] tent sound play failed:", err, src);
      }
    });
  }
}

export function openGumCardsModal() {
  playRandomTentModalSound();
  window.dispatchEvent(new CustomEvent(EVENT_OPEN));
}

export function dispatchGumCardsModalClose() {
  window.dispatchEvent(new CustomEvent(EVENT_CLOSE));
}

export function onGumCardsModalClose(callback) {
  const handler = () => callback();
  window.addEventListener(EVENT_CLOSE, handler);
  return () => window.removeEventListener(EVENT_CLOSE, handler);
}

export { EVENT_OPEN, EVENT_CLOSE };
