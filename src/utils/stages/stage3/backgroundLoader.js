/**
 * Stage3 배경 GLB 로드 유틸리티
 * 배경 모델을 로드하고, island 바운딩 박스와 최대 Y값을 계산한 뒤 onReady 콜백을 호출합니다.
 * GLB 본문은 `stage3IslandTemplatePreload`에서 한 번만 디코드하고, 여기서는 깊은 복제본을 씬에 붙입니다.
 */
import * as THREE from "three";
import { inspectModel } from "../../common/modelInspector.js";
import {
  deepCloneSceneForStage3Instance,
  preloadStage3IslandTemplate,
} from "./stage3IslandTemplatePreload.js";

/**
 * @typedef {Object} BackgroundReadyPayload
 * @property {import("three").Object3D} model - 로드된 배경 씬
 * @property {import("three").Vector3} center - 배경 모델의 중심점
 * @property {number} backgroundMaxY - 배경 메시 전체의 최대 Y값
 * @property {import("three").Box3} backgroundBounds - 캐릭터 이동 범위용 바운딩 박스
 * @property {import("three").AnimationClip[]} animations - 배경 GLB 애니메이션 목록
 */

/**
 * @param {{
 *   scene: import("three").Scene,
 *   glbLoader: ReturnType<import("../../common/assetLoaders.js").getGLBLoader>,
 *   config: import("../../../types.js").Stage3Config,
 *   getIsActive?: () => boolean,
 *   onReady: (payload: BackgroundReadyPayload) => void,
 * }} params
 */
export function loadStage3Background({
  scene,
  glbLoader: _glbLoader,
  config,
  getIsActive,
  onReady,
}) {
  void _glbLoader;

  preloadStage3IslandTemplate(config.model.path)
    .then((gltf) => {
      const model = deepCloneSceneForStage3Instance(gltf.scene);

      model.position.set(
        config.model.position?.x ?? 0,
        config.model.position?.y ?? 0,
        config.model.position?.z ?? 0,
      );
      model.updateMatrixWorld(true);

      const box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());

      /** @type {import("three").Object3D | null} */
      let islandObject = null;
      model.traverse((obj) => {
        if (islandObject) return;
        const n = typeof obj.name === "string" ? obj.name.trim() : "";
        if (n && n.toLowerCase() === "island") islandObject = obj;
      });

      let backgroundBounds;
      if (islandObject) {
        islandObject.updateMatrixWorld(true);
        backgroundBounds = new THREE.Box3().setFromObject(islandObject);
      } else {
        if (import.meta.env.DEV) {
          console.warn(
            "⚠️ Island 객체를 찾을 수 없습니다. 전체 모델의 바운딩 박스를 사용합니다.",
          );
        }
        backgroundBounds = box.clone();
      }

      const boundsPad = config.character?.boundsPadding ?? 0.5;
      const spanX = backgroundBounds.max.x - backgroundBounds.min.x;
      const spanZ = backgroundBounds.max.z - backgroundBounds.min.z;
      if (spanX <= 2 * boundsPad + 1e-3 || spanZ <= 2 * boundsPad + 1e-3) {
        if (import.meta.env.DEV) {
          console.warn(
            "⚠️ Island XZ 바운딩이 이동 패딩 대비 너무 작습니다. 전체 모델 바운딩으로 대체합니다.",
          );
        }
        backgroundBounds = box.clone();
      }

      let backgroundMaxY = center.y;
      if (islandObject) {
        const t = THREE.MathUtils.clamp(
          config.model.groundYLerpFromIslandMinMax ?? 0.95,
          0,
          1,
        );
        const minY = backgroundBounds.min.y;
        const maxY = backgroundBounds.max.y;
        const h = maxY - minY;
        const lerpY = minY + h * t;
        const inset =
          config.model.groundYInsetFromIslandTop != null
            ? config.model.groundYInsetFromIslandTop
            : 0.5;
        const nearTopY = maxY - Math.max(0, inset);
        backgroundMaxY = Math.max(lerpY, nearTopY);
      }

      if (getIsActive && !getIsActive()) {
        return;
      }

      scene.add(model);
      inspectModel(model, null, "배경 모델");

      onReady({
        model,
        center,
        backgroundMaxY,
        backgroundBounds,
        animations: gltf.animations ?? [],
      });
    })
    .catch((err) =>
      console.error(
        "❌ Stage3 배경 로드 에러:",
        err instanceof Error ? err : new Error(String(err)),
      ),
    );
}

/**
 * 배경 메시 그림자·raycast 플래그 — onReady 직후가 아니라 idle 시점에 적용해 첫 프레임을 가볍게 한다.
 * @param {import("three").Object3D} model
 * @param {import("../../../types.js").Stage3Config} config
 */
export function applyStage3BackgroundMeshFlags(model, config) {
  /** @type {Set<import("three").Object3D>} */
  const intRoots = new Set();
  model.traverse((node) => {
    if (typeof node.name === "string" && node.name.startsWith("INT_")) {
      intRoots.add(node);
    }
  });

  const isUnderIntInteractive = (mesh) => {
    let p = mesh;
    while (p) {
      if (intRoots.has(p)) return true;
      p = p.parent;
    }
    return false;
  };

  model.traverse((child) => {
    if (child.isMesh) {
      if (config.model.castShadow !== undefined) {
        child.castShadow = config.model.castShadow;
      }
      if (config.model.receiveShadow !== undefined) {
        child.receiveShadow = config.model.receiveShadow;
      }
      if (!isUnderIntInteractive(child)) {
        child.raycast = () => {};
      }
    }
  });

  for (const name of config.model.frontRenderObjectNames ?? []) {
    const obj = model.getObjectByName(name);
    if (!obj) {
      if (import.meta.env.DEV) {
        console.warn(`[Stage3] frontRenderObjectNames: 노드 없음 — '${name}'`);
      }
      continue;
    }
    obj.traverse((child) => {
      if (!child.isMesh) return;
      child.renderOrder = 1;
      // 바다(transparent)가 opaque 패스 이후에 그려지는 것을 막으려면
      // 풍선도 transparent 패스에 참여시켜야 renderOrder=1이 효과를 발휘함
      const mats = Array.isArray(child.material)
        ? child.material
        : [child.material];
      for (const mat of mats) {
        if (mat && !mat.transparent) {
          mat.transparent = true;
          mat.needsUpdate = true;
        }
      }
    });
  }
}
