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
 *   onReady: (payload: BackgroundReadyPayload) => void,
 * }} params
 */
export function loadStage3Background({ scene, glbLoader, config, onReady }) {
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

      // island 객체 탐색 (캐릭터 이동 범위 제한용)
      const islandObject =
        model.children.find((child) => child.name === "island") ||
        model.children[1];

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

      // 모든 메시를 순회하여 실제 최대 Y값 계산
      let backgroundMaxY = box.max.y;
      model.traverse((child) => {
        if (child.isMesh && child.geometry) {
          const meshBox = new THREE.Box3().setFromObject(child);
          if (meshBox.max.y > backgroundMaxY) {
            backgroundMaxY = meshBox.max.y;
          }
        }
      });

      console.log(
        `📐 배경 모델 바운딩 박스: min=(${box.min.x.toFixed(2)}, ${box.min.y.toFixed(2)}, ${box.min.z.toFixed(2)}), max=(${box.max.x.toFixed(2)}, ${box.max.y.toFixed(2)}, ${box.max.z.toFixed(2)}), actualMaxY=${backgroundMaxY.toFixed(2)}, center=${center.y.toFixed(2)}`,
      );

      model.traverse((child) => {
        if (child.isMesh) {
          if (config.model.castShadow !== undefined) {
            child.castShadow = config.model.castShadow;
          }
          if (config.model.receiveShadow !== undefined) {
            child.receiveShadow = config.model.receiveShadow;
          }
          child.raycast = () => {};
        }
      });

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
