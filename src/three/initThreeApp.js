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
  const antialias = perfMode
    ? false
    : (APP_CONFIG?.renderer?.antialias ?? true);
  const pixelRatio = perfMode
    ? Math.min(1.5, Math.max(1, window.devicePixelRatio || 1))
    : (APP_CONFIG?.renderer?.pixelRatio ??
      Math.min(2, Math.max(1, window.devicePixelRatio || 1)));

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas: canvasElement,
      antialias,
    });
  } catch (err) {
    reportError(
      "WebGL를 사용할 수 없습니다. 브라우저나 기기를 확인해 주세요.",
      err,
    );
    return { dispose: noopDispose };
  }

  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(pixelRatio);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.4;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  // Scene
  const scene = new THREE.Scene();

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

  // Stage Manager
  const stageManager = createStageManager(renderer, scene);

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
  let animationId = null;

  /** Stage3 성능 프로파일: localStorage.setItem('STAGE3_PROFILE','1') 후 새로고침 */
  const profileEnabled = () =>
    typeof window !== "undefined" &&
    (window.STAGE3_PROFILE || localStorage.getItem("STAGE3_PROFILE"));
  let profileLastTime = 0;
  const profileTimes = [];

  function animate() {
    animationId = requestAnimationFrame(animate);
    try {
      const delta = clock.getDelta();
      stageManager.update(delta);
      const camera = stageManager.getCurrentCamera();
      if (camera) {
        renderer.render(scene, camera);
      }

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
      const camera = stageManager.getCurrentCamera();
      if (camera) {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
      }
      renderer.setSize(window.innerWidth, window.innerHeight);
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
    },
  };
}
