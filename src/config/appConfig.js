// 앱 전체 설정값

/**
 * @typedef {Object} AppConfig
 * @property {number} initialStage
 * @property {{antialias: boolean, pixelRatio: number, performanceMode?: boolean}} renderer
 * @property {Object} lights
 * @property {string} canvasSelector
 */
/** @type {AppConfig} */
export const APP_CONFIG = {
  // 초기 시작 스테이지
  initialStage: 2,

  // 렌더러 설정 (performanceMode: true 시 antialias off, pixelRatio 상한 1.5)
  renderer: {
    antialias: true,
    /** 2 상한으로 디바이스 DPR 반영. 고해상도에서도 픽셀 수 제한 → 성능 우선 */
    pixelRatio: Math.min(2, Math.max(1, window.devicePixelRatio || 1)),
    /** true 시 antialias 끄고 pixelRatio 1.5 상한 (저사양 대응) */
    performanceMode: false,
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
