/**
 * Three.js 앱 초기화 (기존 main.js 로직)
 * canvas element에 렌더러/씬/Stage를 연결
 */

import * as THREE from "three";
import { EXRLoader } from "three/examples/jsm/loaders/EXRLoader.js";
import { createStageManager } from "../utils/common/StageManager.js";
import { Stage2 } from "../stages/Stage2.js";
import { Stage3 } from "../stages/Stage3.js";
import { Stage6 } from "../stages/Stage6.js";
import { APP_CONFIG } from "../config/appConfig.js";
import { getGLBLoader } from "../utils/common/assetLoaders.js";
import { isElectronLikeUserAgent } from "../utils/common/envUtils.js";
import { warmStage3GltfTemplateUrls } from "../utils/stages/stage3/stage3GltfWarmup.js";
import { warmStage2GltfTemplateUrls } from "../utils/stages/stage2/stage2GltfWarmup.js";
import {
  disposeStage6LoadingTransition,
  preloadStage6AirplaneModel,
  resizeStage6LoadingTransition,
  updateStage6LoadingTransition,
} from "../utils/stages/stage6/stage6LoadingTransition.js";

/** Stage 1은 별도 프로젝트(태블릿)에서 구현 */
const STAGE_FACTORIES = {
  2: Stage2,
  3: Stage3,
  6: Stage6,
};

const noopDispose = () => {};

/**
 * Three.js 앱을 canvas에 초기화합니다.
 * @param {HTMLCanvasElement} canvasElement - Three.js가 렌더링할 canvas 요소
 * @param {import("../types.js").InitThreeAppOptions} [options]
 * @returns {import("../types.js").InitThreeAppReturn}
 */
export function initThreeApp(canvasElement, options = {}) {
  const {
    allowedStages = [],
    initialStage,
    enableKeyboardSwitch = false,
    onError,
  } = options;
  const safeAllowedStages = Array.isArray(allowedStages) ? allowedStages : [];

  const reportError = (userMessage, err) => {
    console.error(userMessage, err ?? "");
    onError?.(userMessage, err);
  };

  if (!canvasElement) {
    console.warn("[initThreeApp] canvas element가 없습니다.");
    return { dispose: noopDispose };
  }

  if (typeof canvasElement.getContext !== "function") {
    console.warn("[initThreeApp] 유효한 canvas element가 아닙니다.");
    return { dispose: noopDispose };
  }

  const perfMode = APP_CONFIG?.renderer?.performanceMode ?? false;
  const isElectronLike = isElectronLikeUserAgent();
  const antialias = perfMode
    ? false
    : (APP_CONFIG?.renderer?.antialias ?? true);
  const pixelRatio = perfMode
    ? Math.min(1.5, Math.max(1, window.devicePixelRatio || 1))
    : (APP_CONFIG?.renderer?.pixelRatio ??
      Math.min(2, Math.max(1, window.devicePixelRatio || 1)));
  // Cursor/Electron 웹뷰는 동일 장비에서도 외부 Chrome보다 GPU/합성 성능이 낮은 경우가 많다.
  // 이 환경에서는 픽셀 수를 제한해 GLB 표시 체감 지연을 줄인다.
  const finalAntialias = isElectronLike ? false : antialias;
  const finalPixelRatio = isElectronLike
    ? Math.min(1.25, pixelRatio)
    : pixelRatio;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas: canvasElement,
      antialias: finalAntialias,
    });
  } catch (err) {
    reportError(
      "WebGL를 사용할 수 없습니다. 브라우저나 기기를 확인해 주세요.",
      err,
    );
    return { dispose: noopDispose };
  }

  let stageManager = null;

  const getViewportSize = () => {
    const w = Math.max(
      1,
      Math.floor(canvasElement.clientWidth || window.innerWidth || 1),
    );
    const h = Math.max(
      1,
      Math.floor(canvasElement.clientHeight || window.innerHeight || 1),
    );
    return { w, h };
  };

  const applyRendererSize = () => {
    const { w, h } = getViewportSize();
    renderer.setSize(w, h, false);
    const camera = stageManager?.getCurrentCamera?.();
    if (camera) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
  };

  applyRendererSize();
  renderer.setPixelRatio(finalPixelRatio);
  if (isElectronLike) {
    console.info(
      `[initThreeApp] Electron/Cursor 최적화 적용: antialias=${finalAntialias}, pixelRatio=${finalPixelRatio.toFixed(2)}`,
    );
  }
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.33;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  // Scene
  const scene = new THREE.Scene();
  scene.environmentIntensity = 0.85;

  // HDRI 환경광 (Blender Material Preview 스타일)
  const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
  const exrLoader = new EXRLoader();
  exrLoader.load(
    base + "/hdri/sunny_rose_garden_1k.exr",
    (texture) => {
      texture.mapping = THREE.EquirectangularReflectionMapping;
      scene.environment = texture;
    },
    undefined,
    (err) => console.warn("[initThreeApp] HDRI 로드 실패:", err),
  );

  // Lights (공통)
  const lights = APP_CONFIG?.lights ?? {};
  const hemi = lights.hemisphere ?? {};
  const amb = lights.ambient ?? {};
  const sun = lights.sun ?? {};

  const hemiLight = new THREE.HemisphereLight(
    hemi.skyColor ?? 0xffffff,
    hemi.groundColor ?? 0x888888,
    hemi.intensity ?? 1,
  );
  scene.add(hemiLight);

  const ambientLight = new THREE.AmbientLight(
    amb.color ?? 0xffffff,
    amb.intensity ?? 0.4,
  );
  scene.add(ambientLight);

  const sunLight = new THREE.DirectionalLight(
    sun.color ?? 0xffffff,
    sun.intensity ?? 1.2,
  );
  sunLight.position.set(
    sun.position?.x ?? 500,
    sun.position?.y ?? 1500,
    sun.position?.z ?? 500,
  );
  scene.add(sunLight);

  getGLBLoader().attachRenderer(renderer).preloadDecoders();

  // Stage Manager
  stageManager = createStageManager(renderer, scene);

  safeAllowedStages.forEach((stageNum) => {
    const factory = STAGE_FACTORIES[stageNum];
    if (factory) {
      try {
        stageManager.registerStage(stageNum, factory());
      } catch (err) {
        reportError(`Stage ${stageNum}을 불러오는 데 실패했습니다.`, err);
      }
    }
  });

  const safeInitialStage =
    safeAllowedStages.includes(initialStage) && typeof initialStage === "number"
      ? initialStage
      : safeAllowedStages[0];

  if (safeAllowedStages.includes(6)) {
    preloadStage6AirplaneModel();
  }

  if (safeAllowedStages.includes(2)) {
    warmStage2GltfTemplateUrls();
  }

  if (safeAllowedStages.includes(3)) {
    warmStage3GltfTemplateUrls();
    void fetch(
      base + "/static/sounds/20711 finch bird isolated tweet-full.mp3",
      {
        priority: "low",
      },
    ).catch(() => {});
  }

  if (safeInitialStage != null) {
    try {
      stageManager.switchToStage(safeInitialStage);
    } catch (err) {
      reportError(
        `화면을 전환하는 데 실패했습니다. (Stage ${safeInitialStage})`,
        err,
      );
    }
  }

  // Animation Loop
  const clock = new THREE.Clock();
  const drawingSizeScratch = new THREE.Vector2();
  let animationId = null;

  /**
   * Stage3만 프레임 간격(ms)을 60샘플마다 로그(avg/max, 대략적 FPS).
   * 설정: `localStorage.setItem('STAGE3_PROFILE','1')` 후 새로고침, 또는
   * 콘솔에 `window.STAGE3_PROFILE = 1` (동일).
   * 키오스크: Start `complete=1` 웜업 순서·에셋 변경 **전/후**를 **같은 기기**에서 비교할 때 사용.
   */
  const profileEnabled = () =>
    typeof window !== "undefined" &&
    (window.STAGE3_PROFILE || localStorage.getItem("STAGE3_PROFILE"));
  let profileLastTime = 0;
  const profileTimes = [];

  function animate() {
    animationId = requestAnimationFrame(animate);
    try {
      // DevTools 열림/닫힘, 패널 리사이즈 등으로 캔버스 실제 크기가 바뀌는 경우를 매 프레임 보정
      const { w, h } = getViewportSize();
      renderer.getSize(drawingSizeScratch);
      if (drawingSizeScratch.x !== w || drawingSizeScratch.y !== h) {
        applyRendererSize();
      }

      const delta = clock.getDelta();
      stageManager.update(delta);
      const camera = stageManager.getCurrentCamera();
      if (camera) {
        renderer.render(scene, camera);
      }

      updateStage6LoadingTransition(delta);

      if (profileEnabled() && stageManager.getCurrentStageNumber?.() === 3) {
        const now = window.performance.now();
        if (profileLastTime > 0) profileTimes.push(now - profileLastTime);
        profileLastTime = now;
        if (profileTimes.length >= 60) {
          const avg =
            profileTimes.reduce((a, b) => a + b, 0) / profileTimes.length;
          const max = Math.max(...profileTimes);
          console.log(
            `[Stage3 Profile] avg: ${avg.toFixed(1)}ms | max: ${max.toFixed(0)}ms | fps: ${(1000 / avg).toFixed(0)}`,
          );
          profileTimes.length = 0;
        }
      }
    } catch (err) {
      console.error("[initThreeApp] animate 오류:", err);
    }
  }
  animate();

  // Resize
  function handleResize() {
    try {
      applyRendererSize();
      resizeStage6LoadingTransition();
    } catch (err) {
      console.error("[initThreeApp] resize 오류:", err);
    }
  }
  window.addEventListener("resize", handleResize);

  // Keyboard (개발용, Stage 2~6)
  let keydownHandler = null;
  if (enableKeyboardSwitch) {
    keydownHandler = (e) => {
      const num = parseInt(e.key);
      if ([2, 3, 6].includes(num) && safeAllowedStages.includes(num)) {
        stageManager.switchToStage(num);
      }
    };
    window.addEventListener("keydown", keydownHandler);
  }

  const handleStageSwitch = (e) => {
    const { targetStage } = e.detail ?? {};
    if (
      typeof targetStage === "number" &&
      safeAllowedStages.includes(targetStage)
    ) {
      stageManager.switchToStage(targetStage);
    }
  };
  window.addEventListener("stage:switch", handleStageSwitch);

  return {
    dispose() {
      try {
        if (animationId !== null) {
          cancelAnimationFrame(animationId);
          animationId = null;
        }
      } catch (err) {
        console.error("[initThreeApp] animation cancel 오류:", err);
      }
      try {
        window.removeEventListener("resize", handleResize);
      } catch (err) {
        console.error("[initThreeApp] resize listener 제거 오류:", err);
      }
      if (keydownHandler) {
        try {
          window.removeEventListener("keydown", keydownHandler);
        } catch (err) {
          console.error("[initThreeApp] keydown listener 제거 오류:", err);
        }
      }
      try {
        window.removeEventListener("stage:switch", handleStageSwitch);
      } catch (err) {
        console.error("[initThreeApp] stage:switch listener 제거 오류:", err);
      }
      try {
        const currentStage = stageManager.getCurrentStage();
        if (currentStage?.cleanup) {
          currentStage.cleanup(scene);
        }
      } catch (err) {
        console.error("[initThreeApp] stage cleanup 오류:", err);
      }
      try {
        if (scene.environment) {
          scene.environment.dispose?.();
          scene.environment = null;
        }
      } catch (err) {
        console.error("[initThreeApp] environment dispose 오류:", err);
      }
      try {
        renderer?.dispose?.();
      } catch (err) {
        console.error("[initThreeApp] renderer dispose 오류:", err);
      }
      try {
        disposeStage6LoadingTransition();
      } catch (err) {
        console.error(
          "[initThreeApp] stage6 loading transition dispose 오류:",
          err,
        );
      }
    },
  };
}
