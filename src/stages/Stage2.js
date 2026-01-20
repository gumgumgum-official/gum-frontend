import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { STAGE_CONFIG } from "../config/stageConfig.js";

export function Stage2() {
  let objects = [];
  const config = STAGE_CONFIG.stage2;

  return {
    camera: null,

    setup(scene) {
      // 카메라
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
      this.camera.rotation.x = THREE.MathUtils.degToRad(
        config.camera.rotation.x,
      );
      this.camera.rotation.y = THREE.MathUtils.degToRad(
        config.camera.rotation.y,
      );
      this.camera.rotation.z = THREE.MathUtils.degToRad(
        config.camera.rotation.z,
      );

      // Fog & Background
      scene.fog = new THREE.Fog(
        config.fog.color,
        config.fog.near,
        config.fog.far,
      );
      scene.background = new THREE.Color(config.background.color);

      //todo: 디자이너랑 이야기 해보고 개념 정립.. 후 수정
      // 바다..인데 화면상에서는 하늘로 보임..
      const seaGeometry = new THREE.PlaneGeometry(
        config.sea.size.width,
        config.sea.size.height,
        1,
        1,
      );
      const seaMaterial = new THREE.MeshStandardMaterial({
        color: config.sea.color,
        roughness: config.sea.roughness,
        metalness: config.sea.metalness,
      });
      const sea = new THREE.Mesh(seaGeometry, seaMaterial);
      sea.rotation.x = -Math.PI / 2;
      sea.position.y = config.sea.position.y;
      objects.push(sea);
      scene.add(sea);

      // Background 모델
      const fbxLoader = new FBXLoader();
      fbxLoader.load(
        config.model.path,
        (fbx) => {
          fbx.position.set(
            config.model.position.x,
            config.model.position.y,
            config.model.position.z,
          );
          console.log("✅ Stage2: Background 로드 완료");

          fbx.traverse((child) => {
            if (child.isMesh && child.material) {
              // 조명이 main에서 오기 때문에 재질이 빛에 반응하도록 설정
              child.material.envMapIntensity = config.model.envMapIntensity;
              child.castShadow = config.model.castShadow;
              child.receiveShadow = config.model.receiveShadow;
            }
          });

          objects.push(fbx);
          scene.add(fbx);
        },
        (xhr) => {
          console.log(
            `Stage2: ${((xhr.loaded / xhr.total) * 100).toFixed(2)}% loaded`,
          );
        },
        (error) => {
          console.error("❌ Stage2 로드 에러:", error);

          // 1. 사용자에게 알림
          alert("3D 모델 로딩 실패. 기본 배경으로 표시됩니다.");

          // 2. fallback 객체 생성
          const fallbackBox = new THREE.Mesh(
            new THREE.BoxGeometry(100, 100, 100),
            new THREE.MeshStandardMaterial({ color: 0x888888 }),
          );
          fallbackBox.position.set(0, 50, 0);
          objects.push(fallbackBox);
          scene.add(fallbackBox);
        },
      );

      console.log("✅ Stage2 setup 완료");
    },

    update(_delta) {
      // 애니메이션 필요시
      // delta를 사용하지 않지만 StageManager 인터페이스 준수를 위해 유지
    },

    cleanup(scene) {
      objects.forEach((obj) => {
        scene.remove(obj);
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) {
            obj.material.forEach((mat) => mat.dispose());
          } else {
            obj.material.dispose();
          }
        }
      });
      objects = [];
      scene.fog = null;
      scene.background = null;
      console.log("🧹 Stage2 정리 완료");
    },
  };
}
