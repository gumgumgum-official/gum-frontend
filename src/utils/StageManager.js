// ----- 단계 전환 관리

export function createStageManager(renderer, scene) {
  let currentStage = null;
  const stages = new Map();

  return {
    // 단계 등록
    registerStage(stageNumber, stageInstance) {
      stages.set(stageNumber, stageInstance);
    },

    // 단계 전환
    switchToStage(stageNumber) {
      // 기존 단계 정리
      if (currentStage && currentStage.cleanup) {
        currentStage.cleanup(scene);
      }

      // 새 단계 로드
      const newStage = stages.get(stageNumber);
      if (newStage) {
        currentStage = newStage;
        currentStage.setup(scene);
        console.log(`✅ Stage ${stageNumber} 로드 완료`);
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
  };
}
