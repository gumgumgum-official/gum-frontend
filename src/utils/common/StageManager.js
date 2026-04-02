// ----- 단계 전환 관리

/**
 * Stage 전환을 관리하는 StageManager 생성
 * @param {import("three").WebGLRenderer} renderer
 * @param {import("three").Scene} scene
 * @returns {{ registerStage: function, switchToStage: function, update: function, getCurrentCamera: function, getCurrentStage: function }}
 */
export function createStageManager(renderer, scene) {
  let currentStage = null;
  let currentStageNumber = null;
  const stages = new Map();
  let hasPlayedStage3Intro = false;
  /** @type {HTMLAudioElement | null} */
  let stage3IntroAudio = null;

  function stopStage3IntroAudio() {
    if (!stage3IntroAudio) return;
    stage3IntroAudio.pause();
    stage3IntroAudio.currentTime = 0;
  }

  function playStage3IntroAudioOnce() {
    if (hasPlayedStage3Intro) return;
    hasPlayedStage3Intro = true;

    const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
    const src =
      base + "/static/sounds/20711 finch bird isolated tweet-full.mp3";

    if (!stage3IntroAudio) {
      stage3IntroAudio = new window.Audio();
      stage3IntroAudio.preload = "auto";
      stage3IntroAudio.volume = 0.6;
    }

    stage3IntroAudio.pause();
    stage3IntroAudio.currentTime = 0;
    stage3IntroAudio.src = src;
    stage3IntroAudio.play().catch(() => {});
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
          playStage3IntroAudioOnce();
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
