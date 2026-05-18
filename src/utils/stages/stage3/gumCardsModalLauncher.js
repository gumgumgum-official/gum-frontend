/**
 * 껌 카드(타로) 모달: Stage3 INT_tent 클릭 등과 React GumCardsModalOverlay 연동
 * — open 시 클릭 효과음 + `tentModalBgmPath` 루프 배경음
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
/** @type {HTMLAudioElement | null} */
let tentModalBgmAudio = null;
let tentModalBgmFadeRafId = 0;

function cancelTentModalBgmFade() {
  if (tentModalBgmFadeRafId) {
    cancelAnimationFrame(tentModalBgmFadeRafId);
    tentModalBgmFadeRafId = 0;
  }
}

function getTentModalBgmPath() {
  return STAGE3_OBJECTS_CONFIG.tent?.tentModalBgmPath ?? "";
}

function ensureTentModalBgmAudio() {
  if (tentModalBgmAudio) return tentModalBgmAudio;
  const path = getTentModalBgmPath();
  if (!path) return null;
  tentModalBgmAudio = new window.Audio();
  tentModalBgmAudio.preload = "auto";
  tentModalBgmAudio.loop = true;
  tentModalBgmAudio.src = resolvePublicAssetUrl(path);
  try {
    tentModalBgmAudio.load();
  } catch {
    // ignore
  }
  return tentModalBgmAudio;
}

function primeTentModalBgmCache() {
  ensureTentModalBgmAudio();
}

export function stopTentModalBgm() {
  cancelTentModalBgmFade();
  if (!tentModalBgmAudio) return;
  tentModalBgmAudio.pause();
  tentModalBgmAudio.currentTime = 0;
  tentModalBgmAudio.src = "";
  tentModalBgmAudio = null;
}

function startTentModalBgmFadeIn(audio) {
  const targetVol = Number(
    STAGE3_OBJECTS_CONFIG.tent?.tentModalBgmVolume ?? 0.3,
  );
  const fadeSec = Number(
    STAGE3_OBJECTS_CONFIG.tent?.tentModalBgmFadeInSec ?? 2.4,
  );
  applyExtendedAudioVolume(audio, targetVol);
  audio.volume = 0;
  audio.currentTime = 0;

  const a = audio;
  let fadeT0 = null;
  const tick = (now) => {
    tentModalBgmFadeRafId = 0;
    if (!tentModalBgmAudio || tentModalBgmAudio !== a || a.paused) return;
    if (fadeT0 === null) fadeT0 = now;
    const elapsed = (now - fadeT0) / 1000;
    const u = Math.min(1, elapsed / fadeSec);
    a.volume = targetVol * u;
    if (u < 1) {
      tentModalBgmFadeRafId = requestAnimationFrame(tick);
    }
  };

  const beginFade = () => {
    if (!tentModalBgmAudio || tentModalBgmAudio !== a || a.paused) return;
    tentModalBgmFadeRafId = requestAnimationFrame(tick);
  };

  const p = audio.play();
  if (p && typeof p.then === "function") {
    p.then(beginFade).catch((err) => {
      if (import.meta.env.DEV) {
        console.warn("[gumCardsModal] tent BGM play failed:", err, a.src);
      }
    });
  } else {
    beginFade();
  }
}

function startTentModalBgm() {
  const audio = ensureTentModalBgmAudio();
  if (!audio) return;
  cancelTentModalBgmFade();
  startTentModalBgmFadeIn(audio);
}

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
  const run = () => {
    primeTentSoundCache();
    primeTentModalBgmCache();
  };
  if (typeof globalThis.requestIdleCallback === "function") {
    globalThis.requestIdleCallback(run, { timeout: 4_000 });
  } else {
    setTimeout(run, 500);
  }
  window.addEventListener(EVENT_CLOSE, stopTentModalBgm);
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
  startTentModalBgm();
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
