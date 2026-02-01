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
 * @property {number[]} [allowedStages] - 허용 Stage 목록 (예: [2], [3,4,5,6])
 * @property {number} [initialStage] - 시작 Stage
 * @property {boolean} [enableKeyboardSwitch] - 키보드 2~6 전환 활성화
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
 * @property {Stage2PropConfig[]} [props]
 */

/**
 * Stage3~6 공통 설정 (카메라 + 배경)
 * @typedef {Object} StageBasicConfig
 * @property {StageCameraConfig} camera
 * @property {{color: number}} background
 */

export {};
