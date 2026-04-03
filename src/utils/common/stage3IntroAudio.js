/**
 * Stage3 진입 인트로 사운드 (2회 재생 + 끝 구간 페이드)
 * — GL 배경이 씬에 올라온 뒤에 재생하도록 Stage3 `loadStage3Background` onReady에서 호출한다.
 */

let hasPlayedStage3Intro = false;
/** @type {HTMLAudioElement | null} */
let stage3IntroAudio = null;
let stage3IntroPlayCount = 0;
let stage3IntroFadeRafId = 0;
/** @type {(() => void) | null} */
let unlistenStage3IntroEnded = null;
/** @type {(() => void) | null} */
let unlistenStage3IntroMeta = null;

const STAGE3_INTRO_BASE_VOLUME = 0.6;
const STAGE3_INTRO_FADE_OUT_SEC = 1.6;

function startStage3FadeOut() {
  if (!stage3IntroAudio) return;
  if (stage3IntroFadeRafId) return;
  const a = stage3IntroAudio;
  const fadeSec = STAGE3_INTRO_FADE_OUT_SEC;
  const baseVolume = STAGE3_INTRO_BASE_VOLUME;

  const tick = () => {
    stage3IntroFadeRafId = 0;
    if (!stage3IntroAudio) return;
    if (a.paused || !Number.isFinite(a.duration) || a.duration <= 0) return;
    const remaining = a.duration - a.currentTime;
    if (remaining <= 0) return;
    const t = Math.max(0, Math.min(1, remaining / fadeSec));
    a.volume = baseVolume * t;
    if (remaining > 0.02) {
      stage3IntroFadeRafId = requestAnimationFrame(tick);
    }
  };
  stage3IntroFadeRafId = requestAnimationFrame(tick);
}

function ensureStage3FadeOutHook() {
  if (!stage3IntroAudio) return;
  const a = stage3IntroAudio;

  if (unlistenStage3IntroMeta) {
    unlistenStage3IntroMeta();
    unlistenStage3IntroMeta = null;
  }

  const onMeta = () => {
    if (!Number.isFinite(a.duration) || a.duration <= 0) return;
    const fadeSec = STAGE3_INTRO_FADE_OUT_SEC;
    const delayMs = Math.max(0, (a.duration - fadeSec) * 1000);
    window.setTimeout(() => {
      if (stage3IntroAudio === a && !a.paused) startStage3FadeOut();
    }, delayMs);
  };
  a.addEventListener("loadedmetadata", onMeta);
  unlistenStage3IntroMeta = () =>
    a.removeEventListener("loadedmetadata", onMeta);
}

/**
 * 다른 스테이지로 나갈 때 호출
 */
export function stopStage3IntroAudio() {
  if (!stage3IntroAudio) return;
  if (stage3IntroFadeRafId) {
    cancelAnimationFrame(stage3IntroFadeRafId);
    stage3IntroFadeRafId = 0;
  }
  if (unlistenStage3IntroEnded) {
    unlistenStage3IntroEnded();
    unlistenStage3IntroEnded = null;
  }
  if (unlistenStage3IntroMeta) {
    unlistenStage3IntroMeta();
    unlistenStage3IntroMeta = null;
  }
  stage3IntroAudio.pause();
  stage3IntroAudio.currentTime = 0;
  stage3IntroAudio.volume = STAGE3_INTRO_BASE_VOLUME;
}

/**
 * 섬 GLB가 씬에 추가된 뒤(onReady) 호출. 최초 1회만 재생(기존 StageManager 동작 유지).
 */
export function playStage3IntroAudioTwice() {
  if (hasPlayedStage3Intro) return;
  hasPlayedStage3Intro = true;
  stage3IntroPlayCount = 0;

  const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
  const src = base + "/static/sounds/20711 finch bird isolated tweet-full.mp3";

  if (!stage3IntroAudio) {
    stage3IntroAudio = new window.Audio();
    stage3IntroAudio.preload = "auto";
    stage3IntroAudio.volume = STAGE3_INTRO_BASE_VOLUME;
  }

  if (unlistenStage3IntroEnded) {
    unlistenStage3IntroEnded();
    unlistenStage3IntroEnded = null;
  }

  const a = stage3IntroAudio;
  const onEnded = () => {
    stage3IntroPlayCount += 1;
    if (stage3IntroPlayCount === 1) {
      if (!stage3IntroAudio) return;
      if (stage3IntroFadeRafId) {
        cancelAnimationFrame(stage3IntroFadeRafId);
        stage3IntroFadeRafId = 0;
      }
      stage3IntroAudio.volume = STAGE3_INTRO_BASE_VOLUME;
      stage3IntroAudio.currentTime = 0;
      ensureStage3FadeOutHook();
      stage3IntroAudio.play().catch(() => {});
      return;
    }
    if (unlistenStage3IntroEnded) {
      unlistenStage3IntroEnded();
      unlistenStage3IntroEnded = null;
    }
    if (unlistenStage3IntroMeta) {
      unlistenStage3IntroMeta();
      unlistenStage3IntroMeta = null;
    }
  };
  a.addEventListener("ended", onEnded);
  unlistenStage3IntroEnded = () => a.removeEventListener("ended", onEnded);

  a.pause();
  a.currentTime = 0;
  a.volume = STAGE3_INTRO_BASE_VOLUME;
  a.src = src;
  ensureStage3FadeOutHook();
  a.play().catch(() => {});
}
