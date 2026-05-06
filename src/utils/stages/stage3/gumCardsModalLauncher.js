/**
 * 껌 카드(타로) 모달: Stage3 INT_tent 클릭 등과 React GumCardsModalOverlay 연동
 * — open 시 `STAGE3_OBJECTS_CONFIG.tent.tentSoundPaths` 중 1종 랜덤 재생
 */

import { resolvePublicAssetUrl } from "../../common/gltfTemplateCache.js";
import { STAGE3_OBJECTS_CONFIG } from "../../../config/stages/stage3/stage3ObjectsConfig.js";
import { applyExtendedAudioVolume } from "../../common/audioGain.js";

const EVENT_OPEN = "gum-cards-modal:open";
const EVENT_CLOSE = "gum-cards-modal:close";

function getTentSoundPaths() {
  return STAGE3_OBJECTS_CONFIG.tent?.tentSoundPaths ?? [];
}

/** @type {HTMLAudioElement[]} */
let tentPreloadElements = [];

function primeTentSoundCache() {
  const paths = getTentSoundPaths();
  if (tentPreloadElements.length > 0 || paths.length === 0) return;
  tentPreloadElements = paths.map((rel) => {
    const a = new window.Audio();
    a.preload = "auto";
    a.src = resolvePublicAssetUrl(rel);
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

/** 착지 아이스크림 효과음과 같이 매번 새 Audio — 싱글톤에 load() 직후 play()는 미로드 상태에서 자주 실패함 */
function playRandomTentModalSound() {
  const paths = getTentSoundPaths();
  if (paths.length === 0) return;
  const rel = paths[Math.floor(Math.random() * paths.length)];
  const src = resolvePublicAssetUrl(rel);
  const audio = new window.Audio();
  const v = Number(STAGE3_OBJECTS_CONFIG.tent?.tentSoundVolume ?? 0.28);
  applyExtendedAudioVolume(audio, v);
  audio.preload = "auto";
  audio.src = src;
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
