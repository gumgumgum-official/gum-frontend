/**
 * Stage4: 털어버리자 (콘서트장/파티장, Confetti)
 * @returns {import("../types.js").StageInstance}
 */
import * as THREE from "three";
import { getGLBLoader } from "../utils/assetLoaders.js";
import { createStageDebugControls } from "../utils/stageDebugControls.js";
import { STAGE4_CONFIG } from "../config/stages/stage4.js";

export function Stage4() {
  const objects = [];
  const config = STAGE4_CONFIG;
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
        getPropRoots: () => [], // Stage4에는 props 없음
        getPropPath: () => "",
        options: {
          stageName: "stage4",
          getInitialCameraConfig: () => config.camera,
        },
      });

      // 배경 GLB 로드
      glbLoader.load(config.model.path, {
        onLoad: (gltf) => {
          const model = gltf.scene;
          const box = new THREE.Box3().setFromObject(model);
          const center = box.getCenter(new THREE.Vector3());

          model.position.set(
            config.model.position?.x ?? 0,
            config.model.position?.y ?? 0,
            config.model.position?.z ?? 0,
          );

          model.traverse((child) => {
            if (child.isMesh) {
              if (config.model.castShadow !== undefined) {
                child.castShadow = config.model.castShadow;
              }
              if (config.model.receiveShadow !== undefined) {
                child.receiveShadow = config.model.receiveShadow;
              }
              child.raycast = () => {}; // 배경은 클릭 제외
            }
          });

          objects.push(model);
          scene.add(model);
          debugControls.setOrbitTarget(center);
          console.log("✅ Stage4 모델 로드 완료");
        },
        onProgress: (xhr) => {
          if (xhr.total > 0) {
            console.log(
              `Stage4 배경: ${((xhr.loaded / xhr.total) * 100).toFixed(0)}%`,
            );
          }
        },
        onError: (err) => console.error("❌ Stage4 배경 로드 에러:", err),
      });

      console.log("✅ Stage4 생성 완료");
    },

    update(delta) {
      if (debugControls) debugControls.update(delta);
      // TODO: Confetti 파티클, 캐릭터 댄스
    },

    cleanup(scene) {
      if (debugControls) {
        debugControls.dispose();
        debugControls = null;
      }

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
      console.log("🧹 Stage4 정리 완료");
    },
  };
}
