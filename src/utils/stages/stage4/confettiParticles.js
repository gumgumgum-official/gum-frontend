/**
 * Stage4 전용: 색종이 파티클 시스템
 * 마우스 흔들기(빠른 이동) 시 화면 좌표 기준으로 색종이 파티클 생성
 */

import * as THREE from "three";

/** 색종이 파티클 색상 */
const CONFETTI_COLORS = [
  0xff6b6b, 0x4ecdc4, 0xffe66d, 0xa8e6cf, 0xff8b94, 0xffa07a,
];

/**
 * 색종이 파티클 시스템 생성
 * @param {Object} [options]
 * @param {number} [options.speedThreshold=20] - 마우스 속도 임계값 (px/frame)
 * @param {number} [options.cooldownMs=120] - 생성 쿨다운 (ms)
 * @param {number} [options.spawnPlaneY=6] - 스폰 위치용 평면 y 높이
 * @param {number} [options.spawnOffsetBack=3] - 카메라에서 멀리 스폰 (시선 방향으로 추가 거리)
 * @returns {{
 *   setup: (scene: import("three").Scene, camera: import("three").Camera) => void,
 *   onMouseMove: (e: MouseEvent) => void,
 *   update: (delta: number) => void,
 *   cleanup: (scene: import("three").Scene) => void
 * }}
 */
export function createConfettiParticleSystem(options = {}) {
  const {
    speedThreshold = 20,
    cooldownMs = 120,
    spawnPlaneY = 6,
    spawnOffsetBack = 3,
  } = options;

  let sceneRef = null;
  let cameraRef = null;
  let particles = [];
  let lastMousePos = { x: 0, y: 0 };
  let lastSpawnTime = 0;

  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -spawnPlaneY);
  const intersect = new THREE.Vector3();

  function spawn(clientX, clientY, count = 5) {
    if (!sceneRef || !cameraRef) return;

    mouse.x = (clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, cameraRef);

    const hit = raycaster.ray.intersectPlane(plane, intersect);
    const baseDist = hit ? cameraRef.position.distanceTo(hit) : 5;
    const pos = hit
      ? hit.clone()
      : cameraRef.position
          .clone()
          .add(raycaster.ray.direction.clone().multiplyScalar(baseDist));
    // 카메라 기준 시선 방향으로 더 뒤에서 스폰
    pos.add(raycaster.ray.direction.clone().multiplyScalar(spawnOffsetBack));

    for (let i = 0; i < count; i++) {
      const geometry = new THREE.PlaneGeometry(0.2, 0.2);
      const color =
        CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
      const material = new THREE.MeshBasicMaterial({
        color,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 1,
      });

      const confetti = new THREE.Mesh(geometry, material);
      confetti.position.copy(pos);
      confetti.position.x += (Math.random() - 0.5) * 2;
      confetti.position.y += (Math.random() - 0.5) * 2;

      confetti.userData.velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 0.2,
        Math.random() * 0.2 + 0.1,
        (Math.random() - 0.5) * 0.2,
      );
      confetti.userData.rotationSpeed = new THREE.Vector3(
        (Math.random() - 0.5) * 0.2,
        (Math.random() - 0.5) * 0.2,
        (Math.random() - 0.5) * 0.2,
      );
      confetti.userData.life = 3;

      sceneRef.add(confetti);
      particles.push(confetti);
    }
  }

  const onMouseMove = (e) => {
    const dx = e.clientX - lastMousePos.x;
    const dy = e.clientY - lastMousePos.y;
    lastMousePos.x = e.clientX;
    lastMousePos.y = e.clientY;

    const speed = Math.sqrt(dx * dx + dy * dy);
    const now = Date.now();
    if (speed > speedThreshold && now - lastSpawnTime > cooldownMs) {
      lastSpawnTime = now;
      spawn(e.clientX, e.clientY, 5);
    }
  };

  return {
    /** @param {THREE.Scene} scene @param {THREE.Camera} camera */
    setup(scene, camera) {
      sceneRef = scene;
      cameraRef = camera;
    },

    onMouseMove,

    /** @param {number} delta */
    update(delta) {
      particles = particles.filter((confetti) => {
        confetti.userData.life -= delta;

        if (confetti.userData.life <= 0) {
          sceneRef?.remove(confetti);
          confetti.geometry?.dispose();
          confetti.material?.dispose();
          return false;
        }

        confetti.userData.velocity.y -= delta * 0.5;
        confetti.position.add(
          confetti.userData.velocity.clone().multiplyScalar(delta * 10),
        );

        confetti.rotation.x += confetti.userData.rotationSpeed.x;
        confetti.rotation.y += confetti.userData.rotationSpeed.y;
        confetti.rotation.z += confetti.userData.rotationSpeed.z;

        confetti.material.transparent = true;
        confetti.material.opacity = confetti.userData.life / 3;

        return true;
      });
    },

    /** @param {THREE.Scene} scene */
    cleanup(scene) {
      particles.forEach((p) => {
        scene.remove(p);
        if (p.geometry) p.geometry.dispose();
        if (p.material) p.material.dispose();
      });
      particles = [];
      sceneRef = null;
      cameraRef = null;
    },
  };
}
