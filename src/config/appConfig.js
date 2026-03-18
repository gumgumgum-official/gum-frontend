// 앱 전체 설정값

/**
 * @typedef {Object} AppConfig
 * @property {number} initialStage
 * @property {{antialias: boolean, pixelRatio: number}} renderer
 * @property {Object} lights
 * @property {string} canvasSelector
 */
/** @type {AppConfig} */
export const APP_CONFIG = {
  // 초기 시작 스테이지
  initialStage: 6,

  // 렌더러 설정
  renderer: {
    antialias: true,
    pixelRatio: window.devicePixelRatio > 1 ? 2 : 1,
  },

  // 공통 조명 설정
  lights: {
    hemisphere: {
      skyColor: 0xffffff,
      groundColor: 0x888888,
      intensity: 1.0,
    },
    ambient: {
      color: 0xffffff,
      intensity: 0.4,
    },
    sun: {
      color: 0xffffff,
      intensity: 1.2,
      position: { x: 500, y: 1500, z: 500 },
    },
  },

  // 캔버스 셀렉터
  canvasSelector: "#three-canvas",
};
