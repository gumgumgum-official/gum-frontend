/**
 * Stage3 진입 인트로 사운드 (2회 재생 + 끝 구간 페이드)
 * — GL 배경이 씬에 올라온 뒤에 재생하도록 Stage3 `loadStage3Background` onReady에서 호출한다.
 * — 인트로가 모두 끝나면 잔잔한 배경 루프를 이어서 재생한다.
 */

import { STAGE3_AUDIO_CONFIG } from "../../config/stages/stage3/stage3AudioConfig.js";
import { resolvePublicAssetUrl } from "./gltfTemplateCache.js";

let hasPlayedStage3Intro = false;
/** @type {HTMLAudioElement | null} */
let stage3IntroAudio = null;
/** @type {HTMLAudioElement | null} */
let stage3BackgroundAudio = null;
/** 인트로 끝난 뒤 배경 시작 전까지 대기 (ms) */
let stage3BackgroundDelayTimeoutId = 0;
/** 배경 볼륨 페이드 인용 */
let stage3BackgroundFadeRafId = 0;
let stage3IntroPlayCount = 0;
let stage3IntroFadeRafId = 0;
let stage3BackgroundPausedByOverlay = false;
/** @type {(() => void) | null} */
let unlistenStage3IntroEnded = null;
/** @type {(() => void) | null} */
let unlistenStage3IntroMeta = null;

const STAGE3_INTRO_BASE_VOLUME = STAGE3_AUDIO_CONFIG.introVolume ?? 0.6;
const STAGE3_INTRO_FADE_OUT_SEC = 1.6;
/** 인트로 종료 후 이어지는 배경 루프 최종 볼륨 */
const STAGE3_BACKGROUND_VOLUME =
  STAGE3_AUDIO_CONFIG.backgroundAmbientVolume ?? 0.03;
/** 새소리가 완전히 끝난 뒤 배경 페이드 인까지의 공백 (초) */
const STAGE3_BACKGROUND_DELAY_AFTER_INTRO_SEC = 0.3;
/** 배경을 0 → 목표 볼륨까지 올리는 시간 (초) */
const STAGE3_BACKGROUND_FADE_IN_SEC = 3.2;

function cancelStage3BackgroundTimers() {
  if (stage3BackgroundDelayTimeoutId) {
    window.clearTimeout(stage3BackgroundDelayTimeoutId);
    stage3BackgroundDelayTimeoutId = 0;
  }
  if (stage3BackgroundFadeRafId) {
    cancelAnimationFrame(stage3BackgroundFadeRafId);
    stage3BackgroundFadeRafId = 0;
  }
}

function stopStage3BackgroundAmbient() {
  cancelStage3BackgroundTimers();
  if (!stage3BackgroundAudio) return;
  // #region agent log
  fetch("http://127.0.0.1:7759/ingest/35888210-4385-4e6e-bf1e-df1b53425c05", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "223f13",
    },
    body: JSON.stringify({
      sessionId: "223f13",
      runId: "pre-fix",
      hypothesisId: "H1",
      location: "stage3IntroAudio.js:stopStage3BackgroundAmbient",
      message: "stop background ambient called",
      data: {
        paused: stage3BackgroundAudio.paused,
        volume: stage3BackgroundAudio.volume,
        currentTime: stage3BackgroundAudio.currentTime,
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
  stage3BackgroundAudio.pause();
  stage3BackgroundAudio.currentTime = 0;
  stage3BackgroundAudio.volume = 0;
}

function startStage3BackgroundFadeIn() {
  if (!stage3BackgroundAudio) {
    stage3BackgroundAudio = new window.Audio();
    stage3BackgroundAudio.preload = "auto";
    stage3BackgroundAudio.loop = true;
    stage3BackgroundAudio.src = resolvePublicAssetUrl(
      "/static/sounds/background/stage3_background_sound.mp3",
    );
  }

  const targetVol = STAGE3_BACKGROUND_VOLUME;
  const a = stage3BackgroundAudio;
  const fadeSec = STAGE3_BACKGROUND_FADE_IN_SEC;

  cancelStage3BackgroundTimers();
  a.volume = 0;
  a.currentTime = 0;

  // #region agent log
  fetch("http://127.0.0.1:7759/ingest/35888210-4385-4e6e-bf1e-df1b53425c05", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "223f13",
    },
    body: JSON.stringify({
      sessionId: "223f13",
      runId: "pre-fix",
      hypothesisId: "H2",
      location: "stage3IntroAudio.js:startStage3BackgroundFadeIn:init",
      message: "background fade-in init",
      data: { targetVol, fadeSec, paused: a.paused },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  let fadeT0 = null;
  const tick = (now) => {
    stage3BackgroundFadeRafId = 0;
    if (!stage3BackgroundAudio || stage3BackgroundAudio !== a || a.paused) {
      // #region agent log
      fetch(
        "http://127.0.0.1:7759/ingest/35888210-4385-4e6e-bf1e-df1b53425c05",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Debug-Session-Id": "223f13",
          },
          body: JSON.stringify({
            sessionId: "223f13",
            runId: "pre-fix",
            hypothesisId: "H3",
            location:
              "stage3IntroAudio.js:startStage3BackgroundFadeIn:tick:stop",
            message: "fade tick stopped early",
            data: {
              missing: !stage3BackgroundAudio,
              sameRef: stage3BackgroundAudio === a,
              paused: a.paused,
              volume: a.volume,
              currentTime: a.currentTime,
            },
            timestamp: Date.now(),
          }),
        },
      ).catch(() => {});
      // #endregion
      return;
    }
    if (fadeT0 === null) fadeT0 = now;
    const elapsed = (now - fadeT0) / 1000;
    const u = Math.min(1, elapsed / fadeSec);
    a.volume = targetVol * u;
    if (u < 1) {
      stage3BackgroundFadeRafId = requestAnimationFrame(tick);
    } else {
      // #region agent log
      fetch(
        "http://127.0.0.1:7759/ingest/35888210-4385-4e6e-bf1e-df1b53425c05",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Debug-Session-Id": "223f13",
          },
          body: JSON.stringify({
            sessionId: "223f13",
            runId: "pre-fix",
            hypothesisId: "H2",
            location:
              "stage3IntroAudio.js:startStage3BackgroundFadeIn:tick:done",
            message: "fade tick done",
            data: { volume: a.volume, currentTime: a.currentTime },
            timestamp: Date.now(),
          }),
        },
      ).catch(() => {});
      // #endregion
    }
  };

  a.play()
    .then(() => {
      if (!stage3BackgroundAudio || stage3BackgroundAudio !== a || a.paused) {
        // #region agent log
        fetch(
          "http://127.0.0.1:7759/ingest/35888210-4385-4e6e-bf1e-df1b53425c05",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Debug-Session-Id": "223f13",
            },
            body: JSON.stringify({
              sessionId: "223f13",
              runId: "pre-fix",
              hypothesisId: "H4",
              location:
                "stage3IntroAudio.js:startStage3BackgroundFadeIn:play:then",
              message: "play resolved but cannot start fade",
              data: {
                missing: !stage3BackgroundAudio,
                sameRef: stage3BackgroundAudio === a,
                paused: a.paused,
                volume: a.volume,
                currentTime: a.currentTime,
              },
              timestamp: Date.now(),
            }),
          },
        ).catch(() => {});
        // #endregion
        return;
      }
      // #region agent log
      fetch(
        "http://127.0.0.1:7759/ingest/35888210-4385-4e6e-bf1e-df1b53425c05",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Debug-Session-Id": "223f13",
          },
          body: JSON.stringify({
            sessionId: "223f13",
            runId: "pre-fix",
            hypothesisId: "H2",
            location:
              "stage3IntroAudio.js:startStage3BackgroundFadeIn:play:then",
            message: "play resolved; starting fade tick",
            data: {
              paused: a.paused,
              volume: a.volume,
              currentTime: a.currentTime,
            },
            timestamp: Date.now(),
          }),
        },
      ).catch(() => {});
      // #endregion
      stage3BackgroundFadeRafId = requestAnimationFrame(tick);
    })
    .catch((e) => {
      // #region agent log
      fetch(
        "http://127.0.0.1:7759/ingest/35888210-4385-4e6e-bf1e-df1b53425c05",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Debug-Session-Id": "223f13",
          },
          body: JSON.stringify({
            sessionId: "223f13",
            runId: "pre-fix",
            hypothesisId: "H4",
            location:
              "stage3IntroAudio.js:startStage3BackgroundFadeIn:play:catch",
            message: "play rejected",
            data: { name: e?.name, message: String(e?.message ?? "") },
            timestamp: Date.now(),
          }),
        },
      ).catch(() => {});
      // #endregion
    });
}

function scheduleStage3BackgroundAmbientAfterIntro() {
  cancelStage3BackgroundTimers();
  // #region agent log
  fetch("http://127.0.0.1:7759/ingest/35888210-4385-4e6e-bf1e-df1b53425c05", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "223f13",
    },
    body: JSON.stringify({
      sessionId: "223f13",
      runId: "pre-fix",
      hypothesisId: "H1",
      location: "stage3IntroAudio.js:scheduleStage3BackgroundAmbientAfterIntro",
      message: "scheduled background ambient after intro",
      data: { delaySec: STAGE3_BACKGROUND_DELAY_AFTER_INTRO_SEC },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
  stage3BackgroundDelayTimeoutId = window.setTimeout(() => {
    stage3BackgroundDelayTimeoutId = 0;
    // #region agent log
    fetch("http://127.0.0.1:7759/ingest/35888210-4385-4e6e-bf1e-df1b53425c05", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "223f13",
      },
      body: JSON.stringify({
        sessionId: "223f13",
        runId: "pre-fix",
        hypothesisId: "H1",
        location:
          "stage3IntroAudio.js:scheduleStage3BackgroundAmbientAfterIntro:fire",
        message: "background ambient timer fired",
        data: {},
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    startStage3BackgroundFadeIn();
  }, STAGE3_BACKGROUND_DELAY_AFTER_INTRO_SEC * 1000);
}

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
 * 다른 스테이지로 나갈 때 호출 (인트로 + 배경 루프 정리)
 */
export function stopStage3IntroAudio() {
  stopStage3BackgroundAmbient();
  stage3BackgroundPausedByOverlay = false;
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

/** Stage3 오버레이(예: 미니게임)가 열릴 때 배경 루프를 일시정지 */
export function pauseStage3BackgroundAmbientForOverlay() {
  if (!stage3BackgroundAudio) return;
  cancelStage3BackgroundTimers();
  if (!stage3BackgroundAudio.paused) {
    stage3BackgroundAudio.pause();
  }
  stage3BackgroundPausedByOverlay = true;
}

/** Stage3 오버레이가 닫힐 때 배경 루프 재개 */
export function resumeStage3BackgroundAmbientFromOverlay() {
  if (!stage3BackgroundPausedByOverlay) return;
  if (!stage3BackgroundAudio) {
    stage3BackgroundPausedByOverlay = false;
    return;
  }
  stage3BackgroundAudio.play().catch(() => {});
  stage3BackgroundPausedByOverlay = false;
}

/**
 * 섬 GLB가 씬에 추가된 뒤(onReady) 호출. 최초 1회만 재생(기존 StageManager 동작 유지).
 */
export function playStage3IntroAudioTwice() {
  if (hasPlayedStage3Intro) return;
  hasPlayedStage3Intro = true;
  stage3IntroPlayCount = 0;

  const src = resolvePublicAssetUrl(
    "/static/sounds/20711 finch bird isolated tweet-full.mp3",
  );

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
    scheduleStage3BackgroundAmbientAfterIntro();
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
