// ----- 단계 전환 관리

/**
 * Stage 전환을 관리하는 StageManager 생성
 * @param {import("three").WebGLRenderer} renderer
 * @param {import("three").Scene} scene
 * @returns {{
 *   registerStage: function,
 *   switchToStage: function,
 *   update: function,
 *   getCurrentCamera: function,
 *   getCurrentStage: function,
 *   getCurrentStageNumber: function
 * }}
 */
export function createStageManager(renderer, scene) {
  let currentStage = null;
  let currentStageNumber = null;
  const stages = new Map();
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

  function stopStage3IntroAudio() {
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
        // 아직 같은 재생 세션이면 페이드 시작
        if (stage3IntroAudio === a && !a.paused) startStage3FadeOut();
      }, delayMs);
    };
    a.addEventListener("loadedmetadata", onMeta);
    unlistenStage3IntroMeta = () =>
      a.removeEventListener("loadedmetadata", onMeta);
  }

  function playStage3IntroAudioTwice() {
    if (hasPlayedStage3Intro) return;
    hasPlayedStage3Intro = true;
    stage3IntroPlayCount = 0;

    const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
    const src =
      base + "/static/sounds/20711 finch bird isolated tweet-full.mp3";

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
      // 0회차 종료 → 1회차(두 번째 재생) 시작
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
      // 2회 재생 완료 후 리스너 정리
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

  return {
    // 단계 등록
    registerStage(stageNumber, stageInstance) {
      stages.set(stageNumber, stageInstance);
    },

    // 단계 전환
    switchToStage(stageNumber) {
      if (currentStageNumber === stageNumber) return;

      // Stage3 인트로 사운드가 다른 스테이지로 넘어가며 남지 않도록 정리
      if (currentStageNumber === 3 && stageNumber !== 3) {
        stopStage3IntroAudio();
      }

      // 기존 단계 정리
      if (currentStage && currentStage.cleanup) {
        currentStage.cleanup(scene);
      }

      // 새 단계 로드
      const newStage = stages.get(stageNumber);
      if (newStage) {
        currentStage = newStage;
        currentStageNumber = stageNumber;
        currentStage.setup(scene, renderer);
        console.log(`✅ Stage ${stageNumber} 로드 완료`);

        if (stageNumber === 3) {
          playStage3IntroAudioTwice();
        }
      }
    },

    // 현재 단계 업데이트
    update(delta) {
      if (currentStage && currentStage.update) {
        currentStage.update(delta);
      }
    },

    // 현재 카메라 가져오기
    getCurrentCamera() {
      return currentStage ? currentStage.camera : null;
    },

    // 현재 Stage 가져오기 (cleanup용)
    getCurrentStage() {
      return currentStage;
    },

    // 현재 스테이지 번호 (성능 프로파일 등용)
    getCurrentStageNumber() {
      return currentStageNumber;
    },
  };
}
