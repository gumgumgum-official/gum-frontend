// ----- 단계 전환 관리

import { stopStage3IntroAudio } from "./stage3IntroAudio.js";

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
        // Stage3 인트로 MP3는 섬 GLB onReady 이후 재생 (stage3IntroAudio)
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
