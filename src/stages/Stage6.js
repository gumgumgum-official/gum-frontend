/**
 * Stage6: 헤어짐 (공항 배경, 배웅)
 * @returns {import("../types.js").StageInstance}
 */
import * as THREE from "three";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import { getGLBLoader } from "../utils/common/assetLoaders.js";
import { createStageDebugControls } from "../utils/common/stageDebugControls.js";
import { STAGE6_CONFIG } from "../config/stages/stage6.js";

const CHARACTER_GLB_PATH = "/models/common/user_walking2.glb";

export function Stage6() {
  const objects = [];
  const propRoots = [];
  const config = STAGE6_CONFIG;
  const glbLoader = getGLBLoader();
  let debugControls = null;

  return {
    camera: null,

    setup(scene, renderer) {
      const canvas = renderer.domElement;
      this.camera = new THREE.PerspectiveCamera(
        config.camera.fov,
        window.innerWidth / window.innerHeight,
        config.camera.near,
        config.camera.far,
      );
      this.camera.position.set(
        config.camera.position.x,
        config.camera.position.y,
        config.camera.position.z,
      );
      if (config.camera.lookAt) {
        this.camera.lookAt(
          config.camera.lookAt.x,
          config.camera.lookAt.y,
          config.camera.lookAt.z,
        );
      } else {
        this.camera.lookAt(0, 0, 0);
      }

      scene.background = new THREE.Color(config.background.color);

      debugControls = createStageDebugControls({
        scene,
        camera: this.camera,
        domElement: canvas,
        getPropRoots: () => propRoots,
        getPropPath: (index) => `${CHARACTER_GLB_PATH}#${index}`,
        options: {
          stageName: "stage6",
          getInitialCameraConfig: () => config.camera,
        },
      });

      // 배경 GLB 로드
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

          model.traverse((child) => {
            if (child.isMesh) {
              if (config.model.castShadow !== undefined) {
                child.castShadow = config.model.castShadow;
              }
              if (config.model.receiveShadow !== undefined) {
                child.receiveShadow = config.model.receiveShadow;
              }
              child.raycast = () => {}; // 배경은 클릭 제외 (디버그 선택 불가)
            }
          });

          objects.push(model);
          scene.add(model);
          debugControls.setOrbitTarget(center);

          console.log("✅ Stage6 배경 로드 완료");
        },
        onProgress: (xhr) => {
          if (xhr.total > 0) {
            console.log(
              `Stage6 배경: ${((xhr.loaded / xhr.total) * 100).toFixed(0)}%`,
            );
          }
        },
        onError: (err) => console.error("❌ Stage6 배경 로드 에러:", err),
      });

      // 캐릭터 5명 GLB 로드 (config.characters 위치 적용, 드래그로 조정 가능)
      const characterPositions = config.characters ?? [
        { position: { x: 0, y: 0, z: 0 } },
        { position: { x: 1.2, y: 0, z: 0 } },
        { position: { x: 2.4, y: 0, z: 0 } },
        { position: { x: 3.6, y: 0, z: 0 } },
        { position: { x: 4.8, y: 0, z: 0 } },
      ];
      glbLoader.load(CHARACTER_GLB_PATH, {
        onLoad: (gltf) => {
          const source = gltf.scene;
          for (let i = 0; i < 5; i++) {
            const model = i === 0 ? source : SkeletonUtils.clone(source);
            const pos = characterPositions[i]?.position ?? {};
            model.position.set(pos.x ?? 0, pos.y ?? 0, pos.z ?? 0);
            model.traverse((child) => {
              if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
              }
            });
            objects.push(model);
            propRoots.push(model);
            scene.add(model);
          }
          debugControls.setDraggableObjects(propRoots);
          console.log(
            "✅ Stage6 캐릭터 5명 로드 완료 (마우스로 드래그하여 이동, 클릭 후 T/R/E 키로 위치·회전·크기 조정)",
          );
        },
        onProgress: (xhr) => {
          if (xhr.total > 0) {
            console.log(
              `Stage6 캐릭터: ${((xhr.loaded / xhr.total) * 100).toFixed(0)}%`,
            );
          }
        },
        onError: (err) => console.error("❌ Stage6 캐릭터 로드 에러:", err),
      });

      console.log("✅ Stage6 생성 완료");
    },

    update(delta) {
      if (debugControls) debugControls.update(delta);
      // TODO: 배웅 애니메이션, 말풍선 호버
    },

    cleanup(scene) {
      if (debugControls) {
        debugControls.dispose();
        debugControls = null;
      }
      propRoots.length = 0;

      objects.forEach((obj) => {
        scene.remove(obj);
        obj.traverse((child) => {
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
      });
      objects.length = 0;
      scene.background = null;
      console.log("🧹 Stage6 정리 완료");
    },
  };
}
