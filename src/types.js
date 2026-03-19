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
 * Stage3 캐릭터 이동·카메라 설정
 * @typedef {Object} Stage3CharacterConfig
 * @property {number} groundOffset - 배경 위 y 여유 공간
 * @property {number} moveSpeed - 이동 속도
 * @property {number} boundsPadding - 바운드 경계 여유 공간
 * @property {{x: number, y: number, z: number}} cameraOffset - 캐릭터 뒤 카메라 오프셋
 * @property {number} cameraLerpFactor - 카메라 추적 부드러움
 * @property {number} lookAtHeightOffset - lookAt 시 머리 높이
 */

/**
 * Stage3 오브제 공통 설정 (tree1, notice, water 등)
 * @typedef {Object} Stage3PropConfig
 * @property {string} path
 * @property {{x?: number, y?: number, z?: number}} [position]
 * @property {{x?: number, y?: number, z?: number}} [rotation]
 * @property {number} [scale]
 * @property {string[]} [paperSoundPaths] - 게시판 등 클릭 시 재생할 사운드 경로
 */

/**
 * Stage3 포탈 전용 설정 (평면 통과 시 스테이지 전환)
 * @typedef {Object} Stage3PortalConfig
 * @extends Stage3PropConfig
 * @property {string} path
 * @property {{x?: number, y?: number, z?: number}} [position]
 * @property {{x?: number, y?: number, z?: number}} [rotation]
 * @property {number} [scale]
 * @property {{x: number, z: number}} [normal] - 평면 법선 (XZ)
 * @property {number} [halfWidth] - 포탈 반폭 (수평 허용 거리)
 * @property {number} [targetStage] - 전환할 Stage 번호
 */

/** Stage3 아이스크림 카트 전용 설정 */
/**
 * @typedef {Object} Stage3IcecreamCartConfig
 * @property {string} path
 * @property {{x?: number, y?: number, z?: number}} [position]
 * @property {{x?: number, y?: number, z?: number}} [rotation]
 * @property {number} [scale]
 * @property {string[]} [spawnPaths] - 클릭 시 랜덤 스폰될 아이스크림 GLB 경로
 * @property {number} [spawnScale] - 스폰 아이스크림 스케일
 * @property {number} [maxSpawns] - 스폰 최대 개수
 */

/**
 * @typedef {Object} Stage3Config
 * @property {StageCameraConfig} camera
 * @property {{color: number}} background
 * @property {string} [characterModelPath] - 캐릭터 GLB 경로
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
 * @property {Stage3PropConfig} [mirror] - FBX 거울
 */

export {};
