import * as THREE from "three";
import { STAGE6_CONFIG } from "../config/stages/stage6.js";

export function Stage6() {
  const objects = [];
  const config = STAGE6_CONFIG;

  return {
    camera: null,

    setup(scene) {
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
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) obj.material.dispose();
      });
      objects.length = 0;
      scene.background = null;
      console.log("🧹 Stage6 정리 완료");
    },
  };
}
