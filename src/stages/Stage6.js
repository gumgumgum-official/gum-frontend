/**
 * Stage6: 헤어짐 (공항 배경, 배웅)
 * @returns {import("../types.js").StageInstance}
 */
import * as THREE from "three";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { getGLBLoader } from "../utils/common/assetLoaders.js";
import { createSpeechBubbleHover } from "../utils/stages/stage6/speechBubbleHover.js";
import { STAGE6_CONFIG } from "../config/stages/stage6.js";

const DEFAULT_CHARACTER_PATH = "/models/common/user_walking2.glb";

export function Stage6() {
  const objects = [];
  const characterModels = [];
  const config = STAGE6_CONFIG;
  const glbLoader = getGLBLoader();
  let speechBubbleHover = null;
  let orbitControls = null;

  return {
    camera: null,

    setup(scene, renderer) {
      const stage = this;
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

      orbitControls = new OrbitControls(this.camera, renderer.domElement);
      orbitControls.target.set(
        config.camera.lookAt?.x ?? 0,
        config.camera.lookAt?.y ?? 0,
        config.camera.lookAt?.z ?? 0,
      );

      scene.background = new THREE.Color(config.background.color);

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

          model.traverse((child) => {
            if (child.isMesh) {
              if (config.model.castShadow !== undefined) {
                child.castShadow = config.model.castShadow;
              }
              if (config.model.receiveShadow !== undefined) {
                child.receiveShadow = config.model.receiveShadow;
              }
            }
          });

          objects.push(model);
          scene.add(model);

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

      // 캐릭터 5명 GLB 로드 (config.characters 위치 적용)
      const characterPositions = config.characters ?? [
        { position: { x: 0, y: 0, z: 0 } },
        { position: { x: 1.2, y: 0, z: 0 } },
        { position: { x: 2.4, y: 0, z: 0 } },
        { position: { x: 3.6, y: 0, z: 0 } },
        { position: { x: 4.8, y: 0, z: 0 } },
      ];
      const characterPath = config.characterModelPath ?? DEFAULT_CHARACTER_PATH;
      glbLoader.load(characterPath, {
        onLoad: (gltf) => {
          const source = gltf.scene;
          const scale = config.characterScale ?? 1;
          for (let i = 0; i < 5; i++) {
            const model = i === 0 ? source : SkeletonUtils.clone(source);
            model.scale.setScalar(scale);
            const pos = characterPositions[i]?.position ?? {};
            model.position.set(pos.x ?? 0, pos.y ?? 0, pos.z ?? 0);
            model.traverse((child) => {
              if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
              }
            });
            objects.push(model);
            const messages = config.speechBubbleMessages ?? [];
            characterModels.push({
              model,
              message: messages[i % messages.length],
            });
            scene.add(model);
          }
          speechBubbleHover = createSpeechBubbleHover({
            camera: stage.camera,
            renderer,
            characterModels,
            options: {
              cheerSoundPath: config.cheerSoundPath,
              bubbleOffsetY: 0.7,
            },
          });
          console.log("✅ Stage6 캐릭터 5명 로드 완료");
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

      // 벤치 로드 (config.bench 있을 때)
      const benchConfig = config.bench;
      if (benchConfig) {
        glbLoader.load(benchConfig.path, {
          onLoad: (gltf) => {
            const model = gltf.scene;
            model.position.set(
              benchConfig.position?.x ?? 0,
              benchConfig.position?.y ?? 0,
              benchConfig.position?.z ?? 0,
            );
            model.rotation.set(
              ((benchConfig.rotation?.x ?? 0) * Math.PI) / 180,
              ((benchConfig.rotation?.y ?? 0) * Math.PI) / 180,
              ((benchConfig.rotation?.z ?? 0) * Math.PI) / 180,
            );
            model.scale.setScalar(benchConfig.scale ?? 1);
            model.traverse((child) => {
              if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
              }
            });
            objects.push(model);
            scene.add(model);
            console.log("✅ Stage6 bench 로드 완료");
          },
          onError: (err) =>
            console.warn("❌ Stage6 bench 로드 실패:", benchConfig.path, err),
        });
      }

      console.log("✅ Stage6 생성 완료");
    },

    update(delta) {
      if (orbitControls) orbitControls.update(delta);
    },

    cleanup(scene) {
      if (orbitControls) {
        orbitControls.dispose();
        orbitControls = null;
      }
      if (speechBubbleHover) {
        speechBubbleHover.cleanup();
        speechBubbleHover = null;
      }
      characterModels.length = 0;

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
