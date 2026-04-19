/**
 * Stage6 탑승 후 로딩 오버레이 (별도 WebGLRenderer + 공유 GLB 로더/Draco)
 */

import * as THREE from "three";
import { STAGE6_CONFIG } from "../../../config/stages/stage6.js";
import {
  loadGltfTemplateCached,
  resolvePublicAssetUrl,
} from "../../common/gltfTemplateCache.js";
import { createStage6NightSkyBackground } from "./stage6NightSkyBackground.js";

const START_X = 15;
const START_Y = -8;
const END_X = -15;
const END_Y = 8;
/** 프레임당 진행량 (작을수록 비행이 더 길게 이어짐, ~60fps 기준 약 4초) */
const PROGRESS_STEP = 0.003;

/** @type {THREE.WebGLRenderer | null} */
let airplaneRenderer = null;
/** @type {THREE.Scene | null} */
let airplaneScene = null;
/** @type {THREE.PerspectiveCamera | null} */
let airplaneCamera = null;
/** @type {THREE.Object3D | null} */
let airplaneModel = null;

/** @type {ReturnType<typeof createStage6NightSkyBackground> | null} */
let nightSkyBackground = null;

let airplaneProgress = 0;
let isTransitioning = false;
/** @type {(() => void) | null} */
let pendingComplete = null;

/** @type {number[]} */
let pendingTimeouts = [];

function clearScheduledTimeouts() {
  pendingTimeouts.forEach((id) => window.clearTimeout(id));
  pendingTimeouts = [];
}

function schedule(callback, delayMs) {
  const id = window.setTimeout(() => {
    pendingTimeouts = pendingTimeouts.filter((x) => x !== id);
    callback();
  }, delayMs);
  pendingTimeouts.push(id);
  return id;
}

function getPixelRatio() {
  return Math.min(2, window.devicePixelRatio || 1);
}

function ensureAirplaneScene() {
  const canvas = document.getElementById("airplane-canvas");
  if (!canvas || airplaneRenderer) return;

  airplaneRenderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
  });
  airplaneRenderer.setPixelRatio(getPixelRatio());
  airplaneRenderer.outputColorSpace = THREE.SRGBColorSpace;
  airplaneRenderer.setClearColor(0x080810, 1);

  const w = window.innerWidth;
  const h = window.innerHeight;
  airplaneRenderer.setSize(w, h, false);

  airplaneScene = new THREE.Scene();
  nightSkyBackground = createStage6NightSkyBackground();
  airplaneScene.background = nightSkyBackground.texture;
  airplaneCamera = new THREE.PerspectiveCamera(45, w / h, 0.1, 1000);
  airplaneCamera.position.set(0, 2, 8);
  airplaneCamera.lookAt(0, 0, 0);

  const dir = new THREE.DirectionalLight(0xffffff, 1.5);
  dir.position.set(5, 5, 5);
  airplaneScene.add(dir);
  airplaneScene.add(new THREE.AmbientLight(0xffffff, 0.5));

  const url = resolvePublicAssetUrl(STAGE6_CONFIG.airplane.path);
  loadGltfTemplateCached(url)
    .then((gltf) => {
      const root = gltf.scene.clone(true);
      root.scale.set(1.5, 1.5, 1.5);
      root.rotation.y = Math.PI / 4;
      airplaneModel = root;
      airplaneScene.add(root);
      applyPlanePositionFromProgress();
    })
    .catch((err) => {
      console.warn("[stage6LoadingTransition] 비행기 GLB 로드 실패:", err);
    });
}

function resetLoadingOverlayDom() {
  const overlay = document.getElementById("loading-overlay");
  const bg = document.getElementById("loading-bg");
  const loadingText = document.getElementById("loading-text");
  if (overlay) {
    overlay.style.display = "none";
    overlay.style.opacity = "0";
  }
  if (bg) bg.style.opacity = "0";
  if (loadingText) loadingText.style.opacity = "0";
}

function applyPlanePositionFromProgress() {
  if (!airplaneModel) return;
  const t = Math.min(1, airplaneProgress);
  airplaneModel.position.x = START_X + (END_X - START_X) * t;
  airplaneModel.position.y = START_Y + (END_Y - START_Y) * t;
}

function finishTransition() {
  isTransitioning = false;
  airplaneProgress = 0;
  clearScheduledTimeouts();
  resetLoadingOverlayDom();
  const done = pendingComplete;
  pendingComplete = null;
  done?.();
}

/**
 * Stage6 포함 키오스크에서 비행기 GLB를 미리 받아 둔다.
 */
export function preloadStage6AirplaneModel() {
  if (!STAGE6_CONFIG?.airplane?.path) return;
  const url = resolvePublicAssetUrl(STAGE6_CONFIG.airplane.path);
  void loadGltfTemplateCached(url).catch(() => {});
}

/**
 * 리셋 이벤트 등으로 트랜지션을 중단할 때
 */
export function cancelStage6LoadingTransition() {
  if (!isTransitioning && !pendingComplete) return;
  isTransitioning = false;
  airplaneProgress = 0;
  pendingComplete = null;
  clearScheduledTimeouts();
  resetLoadingOverlayDom();
}

/**
 * @param {() => void} [onComplete] - 비행기 이동 종료 후 (예: kiosk-finish)
 */
export function startStage6LoadingTransition(onComplete) {
  cancelStage6LoadingTransition();

  ensureAirplaneScene();

  const overlay = document.getElementById("loading-overlay");
  const bg = document.getElementById("loading-bg");
  const loadingText = document.getElementById("loading-text");
  if (!overlay || !bg || !loadingText) {
    onComplete?.();
    return;
  }

  clearScheduledTimeouts();
  pendingComplete = onComplete ?? null;

  overlay.style.display = "block";
  overlay.style.opacity = "1";

  schedule(() => {
    bg.style.opacity = "1";
  }, 50);

  isTransitioning = true;
  airplaneProgress = 0;
  applyPlanePositionFromProgress();

  schedule(() => {
    loadingText.style.opacity = "1";
  }, 1100);
}

/**
 * initThreeApp `animate` 루프에서 호출
 * @param {number} [deltaSec] - 프레임 간격(초). 밤하늘 별/스트릭 애니메이션에 사용
 */
export function updateStage6LoadingTransition(deltaSec) {
  if (!airplaneRenderer || !airplaneScene || !airplaneCamera) return;

  if (isTransitioning) {
    const d = typeof deltaSec === "number" && deltaSec > 0 ? deltaSec : 1 / 60;
    nightSkyBackground?.update(d);
    airplaneProgress += PROGRESS_STEP;
    if (airplaneModel) {
      applyPlanePositionFromProgress();
    }
    if (airplaneProgress >= 1) {
      finishTransition();
      return;
    }
    airplaneRenderer.render(airplaneScene, airplaneCamera);
  }
}

/**
 * 창 크기 변경 시 호출
 */
export function resizeStage6LoadingTransition() {
  if (!airplaneRenderer || !airplaneCamera) return;
  const w = window.innerWidth;
  const h = window.innerHeight;
  airplaneRenderer.setPixelRatio(getPixelRatio());
  airplaneRenderer.setSize(w, h, false);
  airplaneCamera.aspect = w / h;
  airplaneCamera.updateProjectionMatrix();
}

/**
 * WebGL/씬 정리
 */
export function disposeStage6LoadingTransition() {
  clearScheduledTimeouts();
  isTransitioning = false;
  pendingComplete = null;
  airplaneProgress = 0;

  if (airplaneModel && airplaneScene) {
    airplaneScene.remove(airplaneModel);
  }
  airplaneModel = null;

  if (airplaneScene) {
    airplaneScene.background = null;
  }
  nightSkyBackground?.dispose();
  nightSkyBackground = null;

  try {
    airplaneRenderer?.dispose?.();
  } catch {
    /* noop */
  }
  airplaneRenderer = null;
  airplaneScene = null;
  airplaneCamera = null;

  resetLoadingOverlayDom();
}
