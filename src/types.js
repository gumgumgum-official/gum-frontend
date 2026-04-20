/**
 * 공통 타입 정의 (JSDoc)
 * @module types
 */

/**
 * Stage 인스턴스 인터페이스
 * @typedef {Object} StageInstance
 * @property {import("three").PerspectiveCamera|null} camera
 * @property {function(import("three").Scene, import("three").WebGLRenderer): void} setup
 * @property {function(number): void} [update]
 * @property {function(import("three").Scene): void} [cleanup]
 */

/**
 * initThreeApp 옵션
 * @typedef {Object} InitThreeAppOptions
 * @property {number[]} [allowedStages] - 허용 Stage 목록 (예: [2], [3, 6])
 * @property {number} [initialStage] - 시작 Stage
 * @property {boolean} [enableKeyboardSwitch] - 키보드 2~6 전환 활성화
 * @property {function(string, Error?): void} [onError] - 에러 시 사용자 피드백용 콜백 (메시지, 원본 에러)
 */

/**
 * initThreeApp 반환 객체
 * @typedef {Object} InitThreeAppReturn
 * @property {function(): void} dispose - 리소스 정리
 */

/**
 * Stage camera 설정
 * @typedef {Object} StageCameraConfig
 * @property {number} [fov]
 * @property {number} [near]
 * @property {number} [far]
 * @property {{x: number, y: number, z: number}} [position]
 * @property {{x: number, y: number, z: number}} [rotation]
 * @property {{x: number, y: number, z: number}} [lookAt]
 */

/**
 * Stage2 model 설정
 * @typedef {Object} Stage2ModelConfig
 * @property {string} path
 * @property {{x?: number, y?: number, z?: number}} [position]
 * @property {number} [envMapIntensity]
 * @property {boolean} [castShadow]
 * @property {boolean} [receiveShadow]
 * @property {boolean} [useStaticObstacleColliders] - Stage3: `INT_`/`OBJ_` 메시 기반 XZ 정적 충돌(기본 true). false면 바운딩 클램프만 사용(디버그·임시)
 * @property {string} [island] - Stage2: 섬 GLB (island/sea/sky 분할 로드 시)
 * @property {string} [sea]
 * @property {string} [sky]
 */

/**
 * Stage2 prop 설정
 * @typedef {Object} Stage2PropConfig
 * @property {string} path
 * @property {{x?: number, y?: number, z?: number}} [position]
 * @property {{x?: number, y?: number, z?: number}} [rotation]
 * @property {{x?: number, y?: number, z?: number}} [scale]
 */

/**
 * Stage2 전체 설정
 * @typedef {Object} Stage2Config
 * @property {StageCameraConfig} camera
 * @property {{color: number, near: number, far: number}} fog
 * @property {{color: number}} background
 * @property {Stage2ModelConfig} model
 * @property {string} [characterModelPath] - 캐릭터 GLB 경로
 * @property {number} [characterScale] - 캐릭터 스케일 (1 = 원본)
 * @property {number} [characterGroundY] - 캐릭터 발 위치 Y(m). 미설정 시 배경 GLB 바운딩 상단 기준으로 추정
 * @property {number} [characterGroundYOffset] - 추정 지면에 더할 Y(m). 미세 조정용
 * @property {boolean} [scatterCharacters] - true면 초기 XZ를 걸음 영역 안에서 랜덤 분산(기본 true)
 * @property {number} [characterScatterMinDistance] - 분산 시 캐릭터 간 최소 거리(m)
 * @property {{ minX: number, maxX: number, minZ: number, maxZ: number }} [characterWalkBounds] - 캐릭터 이동 XZ(미설정 시 배경·island·prop 순으로 추정)
 * @property {{ minX: number, maxX: number, minZ: number, maxZ: number }} [characterFenceBounds] - 울타리 안 XZ(섬 걸음 영역과 교집합; GLB에 Fence 메쉬가 없을 때 수동 지정)
 * @property {Array<{ position?: { x?: number, y?: number, z?: number } }>} [characters] - 캐릭터 위치 (5명)
 * @property {Stage2PropConfig[]} [props]
 */

/**
 * Stage3~6 공통 설정 (카메라 + 배경)
 * @typedef {Object} StageBasicConfig
 * @property {StageCameraConfig} camera
 * @property {{color: number}} background
 */

/**
 * Stage3 껌딱지(사이드 캐릭터) 분리(break-off) 동작 설정
 * @typedef {Object} Stage3GumFollowerBreakOffConfig
 * @property {boolean} [enabled]
 * @property {number} [yawThresholdDeg] - 유저 yaw 변화가 이 값(도) 이상이면 분리 모드
 * @property {number} [durationSec] - 분리 지속 시간(초)
 * @property {number} [distanceMultiplier] - 분리 중 목표 간격 배율
 * @property {number} [followLerpMultiplier] - 분리 중 위치 추종 강도 배율
 * @property {number} [driftAmplitude] - 분리 중 옆으로 벌어지는 정도
 */

/**
 * Stage3 껌딱지 GLB 경로·스케일
 * @typedef {Object} Stage3GumFollowerModelsConfig
 * @property {string} [modelPath]
 * @property {number} [scale] - 모델 전체 스케일
 */

/**
 * Stage3 껌딱지 추종·바라보기·애니메이션 동작
 * @typedef {Object} Stage3GumFollowerBehaviorConfig
 * @property {number} [distance] - 유저와의 바닥 기준 간격
 * @property {number} [angleDeg] - 유저 후방 기준 좌/우 벌림 각도(도)
 * @property {number} [followLerpFactor] - 위치 lerp
 * @property {number} [turnLerpFactor] - 오프셋 yaw lerp
 * @property {number} [facingLerpFactor] - 바라보기 yaw lerp
 * @property {number} [lookAtHeightOffset] - 유저 바라볼 때 y 오프셋
 * @property {number} [bubbleOffsetY] - 말풍선 세로 앵커 (AABB 높이 배율, Stage2 기본 0.85)
 * @property {number} [animationSpeed] - 애니메이션 속도(미지정 시 스케일로 보정)
 * @property {number|null} [groundOffset] - 발 높이 보정(null이면 캐릭터 groundOffset)
 * @property {Stage3GumFollowerBreakOffConfig} [breakOff]
 */

/**
 * Stage3 껌딱지(사이드 캐릭터) 전체 설정 (models + behavior)
 * @typedef {Object} Stage3GumFollowersConfig
 * @property {Stage3GumFollowerModelsConfig} models
 * @property {Stage3GumFollowerBehaviorConfig} behavior
 */

/**
 * Stage3 캐릭터 이동·카메라 설정
 * @typedef {Object} Stage3CharacterConfig
 * @property {number} [scale] - 캐릭터 루트 스케일 배율
 * @property {number} groundOffset - 배경 위 y 여유 공간
 * @property {number} moveSpeed - 이동 속도
 * @property {number} boundsPadding - 바운드 경계 여유 공간
 * @property {{x: number, y: number, z: number}} cameraOffset - 캐릭터 뒤 카메라 오프셋
 * @property {number} cameraLerpFactor - 카메라 추적 부드러움
 * @property {number} [walkSoundVolume] - 이동(걷기) 루프 사운드 볼륨 0~1
 * @property {number} lookAtHeightOffset - lookAt 시 머리 높이
 * @property {number} [collisionRadius] - 바닥 이동용 XZ 원형 충돌 반경(m); 생략 시 scale 기반 추정
 * @property {{x?: number, z?: number}} [spawnOffset] - 섬 바운딩 XZ 중심 기준 스폰 추가 오프셋(m)
 * @property {Stage3GumFollowersConfig} gumFollowers
 */

/**
 * Stage3 오브제 공통 설정 (외부 GLB 배치 시)
 * @typedef {Object} Stage3PropConfig
 * @property {string} [path]
 * @property {{x?: number, y?: number, z?: number}} [position]
 * @property {{x?: number, y?: number, z?: number}} [rotation]
 * @property {number} [scale]
 * @property {string[]} [paperSoundPaths] - 게시판 등 클릭 시 재생할 사운드 경로
 * @property {number} [paperSoundVolume] - 종이 효과음 볼륨 0~1
 * @property {string[]} [tentSoundPaths] - 텐트(INT_tent) 클릭 시 재생할 사운드 경로
 * @property {number} [tentSoundVolume] - 텐트 클릭 효과음 볼륨 0~1
 * @property {string[]} [wellSoundPaths] - 우물(INT_Well) 클릭 시 재생할 사운드 경로
 * @property {number} [wellSoundVolume] - 우물 클릭 효과음 볼륨 0~1
 * @property {string[]} [clockSoundPaths] - 시계(INT_Clock) 클릭 시 재생할 사운드 경로
 * @property {number} [clockSoundVolume] - 시계 클릭 효과음 볼륨 0~1
 */

/**
 * Stage3 포탈 설정 (`INT_Portal` 클릭 시 `targetStage`로 전환)
 * @typedef {Object} Stage3PortalConfig
 * @extends Stage3PropConfig
 * @property {string} [path]
 * @property {{x?: number, y?: number, z?: number}} [position]
 * @property {{x?: number, y?: number, z?: number}} [rotation]
 * @property {number} [scale]
 * @property {{x: number, y?: number, z: number}} [normal] - 레거시(평면 통과 시 사용, 현재 미사용)
 * @property {number} [halfWidth] - 레거시(평면 통과 시 사용, 현재 미사용)
 * @property {number} [targetStage] - 전환할 Stage 번호
 * @property {string[]} [portalTransitionSoundPaths] - 포탈 전환 시작 시 재생할 MP3 경로(public 기준)
 * @property {number} [portalTransitionSoundVolume] - 포탈 전환 효과음 볼륨 (0~1)
 */

/** Stage3 아이스크림 클릭 스폰 설정 (카트 메시는 island GLB 내 INT_icecream) */
/**
 * @typedef {Object} Stage3IcecreamCartConfig
 * @property {string} [path]
 * @property {{x?: number, y?: number, z?: number}} [position]
 * @property {{x?: number, y?: number, z?: number}} [rotation]
 * @property {number} [scale]
 * @property {string[]} [spawnPaths] - 카트 클릭 시 복제해 스폰할 GLB 경로(public 기준, 예: /models/…)
 * @property {number} [spawnScale] - 스폰 아이스크림 스케일
 * @property {number} [maxVisualSize] - 스폰 아이스크림의 최대 외곽 길이(월드 단위)
 * @property {number} [minVisualSize] - 스폰 아이스크림의 최소 외곽 길이(월드 단위)
 * @property {number} [spawnRadiusMin] - 카트 중심 주변 스폰 최소 반경(m)
 * @property {number} [spawnRadiusMax] - 카트 중심 주변 스폰 최대 반경(m)
 * @property {number} [spawnHeightAboveCart] - 카트 중심 Y 위 추가 높이(m)
 * @property {number} [spawnHeightJitter] - 스폰 높이 무작위 오차(m)
 * @property {number} [launchHorizontalMin] - 스폰 직후 수평 속도 하한(m/s)
 * @property {number} [launchHorizontalSpread] - 수평 속도 무작위 가산(m/s)
 * @property {number} [launchUpMin] - 수직 초기 속도 하한(m/s)
 * @property {number} [launchUpSpread] - 수직 초기 속도 무작위 가산(m/s)
 * @property {number} [launchTowardPlayerSpread] - 캐릭터 방향 발사 시 좌우 무작위 각(rad)
 * @property {number} [physicsGroundYOffset] - 아이스크림 Cannon 지면 Y 보정(m)
 * @property {number} [maxSpawns] - 스폰 최대 개수
 * @property {number} [physicsSubsteps] - Cannon 물리 스텝당 서브스텝 수 (기본 2, 낮을수록 성능 우선)
 * @property {number} [landSoundVolume] - 착지 시 icecream 효과음 볼륨 0~1
 */

/**
 * Stage3 인트로·배경 루프 볼륨
 * @typedef {Object} Stage3AudioConfig
 * @property {number} [introVolume] - 인트로(새소리) 0~1
 * @property {number} [backgroundAmbientVolume] - 배경 루프 목표 볼륨 0~1
 */

/**
 * @typedef {Object} Stage3SkyGradientStop
 * @property {number} t - 0(화면 위)~1(화면 아래)
 * @property {number} color
 *
 * @typedef {Object} Stage3Config
 * @property {StageCameraConfig} camera
 * @property {{
 *   gradient: {
 *     top?: number,
 *     bottom?: number,
 *     stops?: Stage3SkyGradientStop[],
 *   },
 * }} background
 * @property {Stage3AudioConfig} [audio]
 * @property {string} [characterModelPath] - 캐릭터 GLB 경로
 * @property {string} [characterIdleModelPath] - 캐릭터 idle(서있기) 애니메이션 GLB 경로
 * @property {Stage2ModelConfig} model
 * @property {Stage3CharacterConfig} character
 * @property {Stage3IcecreamCartConfig} [icecreamCart]
 * @property {Stage3PropConfig} [tree1]
 * @property {Stage3PropConfig} [notice]
 * @property {Stage3PortalConfig} [portal_bright]
 * @property {Stage3PropConfig} [statue]
 * @property {Stage3PropConfig} [well]
 * @property {Stage3PropConfig} [clock]
 * @property {Stage3PropConfig} [water]
 * @property {Stage3PropConfig} [gameMachine]
 * @property {Stage3PropConfig} [bench]
 * @property {Stage3PropConfig} [signs]
 * @property {Stage3PropConfig} [tent]
 * @property {{ x?: number; z?: number }} [letterSpawnXZ] - Stage3 낙하 글자 시작 위치(월드 XZ, 원점 기준)
 * @property {number} [letterTargetHeight] - SVG 원본 크기와 무관하게 글자 그룹의 목표 월드 높이(Y)
 */

export {};
