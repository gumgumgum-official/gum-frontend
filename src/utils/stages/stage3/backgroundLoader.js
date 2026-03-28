/**
 * Stage3 배경 GLB 로드 유틸리티
 * 배경 모델을 로드하고, island 바운딩 박스와 최대 Y값을 계산한 뒤 onReady 콜백을 호출합니다.
 */
import * as THREE from "three";
import { inspectModel } from "../../common/modelInspector.js";

/**
 * @typedef {Object} BackgroundReadyPayload
 * @property {import("three").Object3D} model - 로드된 배경 씬
 * @property {import("three").Vector3} center - 배경 모델의 중심점
 * @property {number} backgroundMaxY - 배경 메시 전체의 최대 Y값
 * @property {import("three").Box3} backgroundBounds - 캐릭터 이동 범위용 바운딩 박스
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
  glbLoader,
  config,
  getIsActive,
  onReady,
}) {
  glbLoader.load(config.model.path, {
    onLoad: (gltf) => {
      const model = gltf.scene;

      model.position.set(
        config.model.position?.x ?? 0,
        config.model.position?.y ?? 0,
        config.model.position?.z ?? 0,
      );
      model.updateMatrixWorld(true);

      const box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());

      // island 객체 탐색 (캐릭터 이동 범위 제한용) — 깊은 계층·대소문자 허용
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
        console.log(
          `🏝️ Island 바운딩 박스: min=(${backgroundBounds.min.x.toFixed(2)}, ${backgroundBounds.min.y.toFixed(2)}, ${backgroundBounds.min.z.toFixed(2)}), max=(${backgroundBounds.max.x.toFixed(2)}, ${backgroundBounds.max.y.toFixed(2)}, ${backgroundBounds.max.z.toFixed(2)})`,
        );
      } else {
        console.warn(
          "⚠️ Island 객체를 찾을 수 없습니다. 전체 모델의 바운딩 박스를 사용합니다.",
        );
        backgroundBounds = box.clone();
      }

      // 발 높이: 전체 씬 center.y는 물·배경에 끌려 낮게 잡히기 쉬움.
      // island의 min이 물/절벽 아래까지 포함되면 min+(max-min)*t 만으로는 지면보다 낮아질 수 있어
      // max.y 근처 후보와 둘 중 더 높은 쪽을 택한다.
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

      console.log(
        `📐 배경 모델 바운딩 박스: min=(${box.min.x.toFixed(2)}, ${box.min.y.toFixed(2)}, ${box.min.z.toFixed(2)}), max=(${box.max.x.toFixed(2)}, ${box.max.y.toFixed(2)}, ${box.max.z.toFixed(2)}), groundY(backgroundMaxY)=${backgroundMaxY.toFixed(2)}, sceneCenter.y=${center.y.toFixed(2)}`,
      );

      /** 클릭 타깃: 이름이 `INT_`로 시작하는 오브젝트 트리만 기본 raycast 유지 */
      const isUnderIntInteractive = (mesh) => {
        let p = mesh;
        while (p) {
          if (typeof p.name === "string" && p.name.startsWith("INT_")) {
            return true;
          }
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

      if (getIsActive && !getIsActive()) {
        model.traverse((child) => {
          if (child.isMesh) {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
              if (Array.isArray(child.material)) {
                child.material.forEach((m) => m.dispose());
              } else {
                child.material.dispose();
              }
            }
          }
        });
        return;
      }

      scene.add(model);
      console.log("✅ Stage3 배경 모델 로드 완료");
      inspectModel(model, null, "배경 모델");

      onReady({ model, center, backgroundMaxY, backgroundBounds });
    },
    onProgress: (xhr) => {
      if (xhr.total > 0) {
        console.log(
          `Stage3 배경: ${((xhr.loaded / xhr.total) * 100).toFixed(0)}%`,
        );
      }
    },
    onError: (err) => console.error("❌ Stage3 배경 로드 에러:", err),
  });
}
