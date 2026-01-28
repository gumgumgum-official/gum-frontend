import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { STAGE_CONFIG } from "../config/stageConfig.js";

export function Stage2() {
  let objects = [];
  let controls = null;
  const config = STAGE_CONFIG.stage2;

  return {
    camera: null,

    setup(scene, renderer) {
      // Fog & Background (일단 끔 - 디버깅용)
      // scene.fog = new THREE.Fog(config.fog.color, config.fog.near, config.fog.far);
      scene.background = new THREE.Color(0x333333); // 어두운 배경으로 모델 잘 보이게

      // 바다 일단 끔 (디버깅용)
      // const seaGeometry = new THREE.PlaneGeometry(...);

      // 초기 카메라 (모델 로드 전)
      this.camera = new THREE.PerspectiveCamera(
        45,
        window.innerWidth / window.innerHeight,
        0.1,
        10000,
      );
      this.camera.position.set(100, 50, 100);
      this.camera.lookAt(0, 0, 0);

      // OrbitControls - 마우스로 카메라 조작!
      const canvas = renderer.domElement;
      controls = new OrbitControls(this.camera, canvas);
      controls.enableDamping = true;
      controls.target.set(0, 0, 0);

      // Background 모델 (GLB)
      const loader = new GLTFLoader();
      loader.load(
        config.model.path,
        (gltf) => {
          const model = gltf.scene;

          // 모델 바운딩 박스 확인
          const box = new THREE.Box3().setFromObject(model);
          const size = box.getSize(new THREE.Vector3());
          const center = box.getCenter(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z);

          console.log("📦 모델 크기:", size);
          console.log("📍 모델 중심:", center);

          // 카메라를 모델이 잘 보이는 위치로 자동 설정
          this.camera.position.set(
            center.x + maxDim * 1.5,
            center.y + maxDim * 0.8,
            center.z + maxDim * 1.5,
          );
          this.camera.far = maxDim * 10;
          this.camera.updateProjectionMatrix();

          // OrbitControls 타겟을 모델 중심으로
          controls.target.copy(center);
          controls.update();

          model.traverse((child) => {
            if (child.isMesh && child.material) {
              child.castShadow = true;
              child.receiveShadow = true;
            }
          });

          console.log("✅ Stage2: Background 로드 완료");
          console.log("🎮 마우스로 화면 조작 가능! (드래그: 회전, 휠: 줌)");
          console.log("💡 좋은 앵글 찾으면 콘솔에 카메라 위치 출력:");
          console.log("   camera.position:", this.camera.position);

          objects.push(model);
          scene.add(model);
        },
        (xhr) => {
          if (xhr.total > 0) {
            console.log(
              `Stage2: ${((xhr.loaded / xhr.total) * 100).toFixed(2)}% loaded`,
            );
          }
        },
        (error) => {
          console.error("❌ Stage2 로드 에러:", error);
        },
      );

      // 원점에 도우미 추가 (디버깅용)
      const axesHelper = new THREE.AxesHelper(50);
      scene.add(axesHelper);
      objects.push(axesHelper);

      // 카메라 위치 복사 단축키 (C 키)
      const camera = this.camera;
      this._onKeyDown = (e) => {
        if (e.key === "c" || e.key === "C") {
          const pos = camera.position;
          const rot = camera.rotation;
          console.log("📋 카메라 설정값 (stageConfig.js에 복사):");
          console.log(`camera: {
  fov: ${camera.fov.toFixed(1)},
  near: 0.1,
  far: ${camera.far.toFixed(0)},
  position: { x: ${pos.x.toFixed(1)}, y: ${pos.y.toFixed(1)}, z: ${pos.z.toFixed(1)} },
  lookAt: { x: ${controls.target.x.toFixed(1)}, y: ${controls.target.y.toFixed(1)}, z: ${controls.target.z.toFixed(1)} },
},`);
        }
      };
      window.addEventListener("keydown", this._onKeyDown);

      console.log("✅ Stage2 setup 완료");
      console.log("💡 C 키: 현재 카메라 설정값 출력");
    },

    update(_delta) {
      // OrbitControls 업데이트
      if (controls) {
        controls.update();
      }
    },

    cleanup(scene) {
      // 이벤트 리스너 정리
      if (this._onKeyDown) {
        window.removeEventListener("keydown", this._onKeyDown);
        this._onKeyDown = null;
      }

      // OrbitControls 정리
      if (controls) {
        controls.dispose();
        controls = null;
      }

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
