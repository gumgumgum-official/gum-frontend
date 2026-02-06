/**
 * Stage6: 헤어짐 (공항 배경, 배웅)
 * @returns {import("../types.js").StageInstance}
 */
import * as THREE from "three";
import { STAGE6_CONFIG } from "../config/stages/stage6.js";

export function Stage6() {
  const objects = [];
  const config = STAGE6_CONFIG;

  return {
    camera: null,

    setup(scene, _renderer) {
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
      this.camera.lookAt(
        config.camera.lookAt.x,
        config.camera.lookAt.y,
        config.camera.lookAt.z,
      );

      scene.background = new THREE.Color(config.background.color);

      console.log("✅ Stage6 생성 완료");
    },

    update(_delta) {
      // TODO: 배웅 애니메이션, 말풍선 호버
    },

    cleanup(scene) {
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
