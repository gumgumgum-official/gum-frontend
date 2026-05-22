/**
 * 텐트 3D 뷰어(TentSceneViewer) 오픈 시 메인 스레드 스파이크 완화:
 * HDRI EXR 디코드·GLB clone을 idle/웜업 단계로 앞당긴다.
 */

import * as THREE from "three";
import { EXRLoader } from "three/examples/jsm/loaders/EXRLoader.js";
import {
  loadGltfTemplateCached,
  resolvePublicAssetUrl,
} from "./gltfTemplateCache.js";
export const TENT_SCENE_GLB_PATH = "/models/stage3/tent_gum_scene.glb";
export const TENT_SCENE_HDRI_PATH = "/hdri/sunny_rose_garden_1k.exr";

/** @type {Promise<THREE.Texture> | null} */
let environmentPromise = null;
/** @type {THREE.Object3D | null} */
let preparedModel = null;
/** @type {Promise<void> | null} */
let preparePromise = null;

function applyTentSceneLightScale(root) {
  root.traverse((obj) => {
    if (obj.isLight) obj.intensity *= 0.0005;
  });
}

/**
 * @returns {Promise<THREE.Texture>}
 */
export function getTentSceneEnvironmentTexture() {
  if (!environmentPromise) {
    const url = resolvePublicAssetUrl(TENT_SCENE_HDRI_PATH);
    environmentPromise = new Promise((resolve, reject) => {
      new EXRLoader().load(
        url,
        (tex) => {
          tex.mapping = THREE.EquirectangularReflectionMapping;
          resolve(tex);
        },
        undefined,
        (err) => {
          environmentPromise = null;
          reject(err instanceof Error ? err : new Error(String(err)));
        },
      );
    });
  }
  return environmentPromise;
}

function scheduleReplenishPreparedModel() {
  if (typeof globalThis.requestIdleCallback === "function") {
    globalThis.requestIdleCallback(
      () => {
        void warmTentSceneVisualAssets();
      },
      { timeout: 3_000 },
    );
  } else {
    globalThis.setTimeout(() => {
      void warmTentSceneVisualAssets();
    }, 400);
  }
}

/**
 * 클릭 직전에 쓸 수 있도록 clone된 모델을 idle에 준비한다.
 * @returns {Promise<void>}
 */
export function warmTentSceneVisualAssets() {
  if (preparePromise) return preparePromise;
  preparePromise = (async () => {
    void getTentSceneEnvironmentTexture().catch(() => {});
    if (preparedModel) return;
    const tentUrl = resolvePublicAssetUrl(TENT_SCENE_GLB_PATH);
    const gltf = await loadGltfTemplateCached(tentUrl);
    if (preparedModel) return;
    const model = gltf.scene.clone(true);
    applyTentSceneLightScale(model);
    preparedModel = model;
  })().finally(() => {
    preparePromise = null;
  });
  return preparePromise;
}

/**
 * 준비된 모델을 뷰어에 넘긴다. 없으면 null(뷰어에서 warm 후 clone).
 * @returns {THREE.Object3D | null}
 */
export function takePreparedTentModel() {
  if (!preparedModel) return null;
  const model = preparedModel;
  preparedModel = null;
  scheduleReplenishPreparedModel();
  return model;
}

export function resetTentScenePrewarmState() {
  if (preparedModel) {
    preparedModel.traverse((obj) => {
      const mesh = /** @type {any} */ (obj);
      if (mesh.geometry) mesh.geometry.dispose();
      const mats = mesh.material
        ? Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material]
        : [];
      mats.forEach((m) => m.dispose());
    });
    preparedModel = null;
  }
  preparePromise = null;
}
