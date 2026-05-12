/** Stage3 캐릭터 관련 config만 모아둔 파일 */

export const STAGE3_CHARACTER_CONFIG = {
  /** 캐릭터 GLB 경로 */
  characterModelPath: "/models/common/user_walk_v2.glb",
  /** idle(서있기) 애니메이션 전용 GLB 경로 */
  characterIdleModelPath: "/models/common/user_idle.glb",
  /** punch(망치질) 애니메이션 전용 GLB 경로 */
  characterPunchModelPath: "/models/stage3/user_punch.glb",

  /** 캐릭터 이동·카메라 (Stage3 전용) */
  character: /** @type {import("../../../types.js").Stage3CharacterConfig} */ ({
    groundOffset: 0.45, // 배경 위에 설 때 y 여유 (메시·바운딩 오차 보정)
    scale: 0.35, // 캐릭터 전체 크기 배율
    moveSpeed: 5.0, // 이동 속도
    boundsPadding: 0.5, // 바운드 경계 여유 공간 (가장자리 미끄러짐 방지)
    cameraOffset: { x: 0, y: 9, z: 25 }, // 캐릭터 뒤쪽 카메라 오프셋 (더 줌아웃)
    cameraLerpFactor: 0.1, // 카메라 부드러운 추적 강도
    /** INT가 화면 프러스텀 밖이면 cameraOffset을 Y축으로 살짝 회전(지형 가림은 미처리; 레이캐스트 확장 가능) */
    cameraYawAssistMaxRad: 0.32,
    cameraYawAssistLerp: 0.09,
    /** 프러스텀 경계 떨림 완화 — 목표 각 1차 스무딩(초, 지수 보간 time constant) */
    cameraYawAssistDemandEaseSec: 0.34,
    /** 카메라에 실제 적용되는 보조 각 2차 스무딩(초) */
    cameraYawAssistEaseSec: 0.62,
    /** 정지/시야 복귀 시 기본 각으로(초, 클수록 더 천천히·부드럽게) */
    cameraYawAssistReturnEaseSec: 0.52,
    cameraYawAssistMaxDistance: 42,
    cameraYawAssistOnlyWhenMoving: true,
    walkSoundVolume: 0.5, // 이동 시 걷기 루프 볼륨 (0~1)
    lookAtHeightOffset: 0.9, // lookAt 시 캐릭터 기준점을 낮춰 화면에서 캐릭터를 살짝 위로 배치
    /** true면 펀치 애니를 GLB 클립 끝에서 역재생(맞춤 타격 타이밍은 동일 프레임 기준 유지) */
    punchAnimationReverse: true,
    /** 펀치 클립 재생 배율(1=원본 길이, 값이 클수록 더 빠름) */
    punchAnimationTimeScale: 1.65,
    /** XZ 평면 원형 충돌 반경(m). 미설정 시 scale×0.22 (최소 0.2) */
    collisionRadius: 0.65,
    /** 섬 중심 대비 스폰 위치(월드 +X = 오른쪽) */
    spawnOffset: { x: 1.2, z: 0 },

    /**
     * 껌딱지(사이드 캐릭터) 2마리 설정
     * - 유저 이동/회전에 반응해 유기적으로 추종
     */
    gumFollowers: {
      models: {
        modelPath: "/models/common/gum/gum_walk_final.glb",
        scale: 1.4, // 껌딱지 모델 전체 크기 (기존 대비 4배)
      },
      behavior: {
        distance: 4, // 유저와 껌딱지 간 간격(바닥 기준)
        angleDeg: 25, // 유저 후방 기준 좌/우로 벌리는 각도
        followLerpFactor: 4, // 위치 lerp 스무딩
        turnLerpFactor: 7, // 유저가 급회전할 때 오프셋 yaw 스무딩
        facingLerpFactor: 6, // 유저/목표 방향 바라보기 yaw 스무딩
        lookAtHeightOffset: 0.9, // 유저 바라볼 때 y 오프셋
        /** Stage2 껌 말풍선과 동일 — 월드 AABB 높이 대비 세로 앵커 (center + height×값) */
        bubbleOffsetY: 0.85,
        breakOff: {
          enabled: true,
          yawThresholdDeg: 120, // 유저 yaw 변화가 이 이상이면 잠깐 "분리" 모드
          durationSec: 0.55, // 분리 지속 시간
          distanceMultiplier: 1.5, // 분리 중 목표 간격 확대
          followLerpMultiplier: 0.35, // 분리 중 따라오는 강도 감소(관성)
          driftAmplitude: 0.55, // 분리 중 옆으로 벌어지는 정도
        },
        // 유저의 groundOffset을 그대로 쓰되, 필요하면 오버라이드 가능
        groundOffset: null,
      },
    },
  }),
};
