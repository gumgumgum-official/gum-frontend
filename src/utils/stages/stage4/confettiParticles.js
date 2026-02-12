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
 * @param {number} [options.maxParticles=200] - 최대 활성 파티클 수
 * @param {number} [options.poolSize=100] - 파티클 풀 크기 (미리 생성할 파티클 수)
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
    maxParticles = 200,
    poolSize = 100,
  } = options;

  let sceneRef = null;
  let cameraRef = null;
  /** 활성 파티클 목록 */
  let activeParticles = [];
  /** 비활성 파티클 풀 (재사용) */
  let particlePool = [];
  let lastMousePos = { x: 0, y: 0 };
  let lastSpawnTime = 0;

  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -spawnPlaneY);
  const intersect = new THREE.Vector3();

  /**
   * 파티클 풀 초기화 (미리 생성)
   */
  function initParticlePool() {
    for (let i = 0; i < poolSize; i++) {
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
      confetti.visible = false; // 초기에는 비활성
      confetti.userData.velocity = new THREE.Vector3();
      confetti.userData.rotationSpeed = new THREE.Vector3();
      confetti.userData.life = 0;
      confetti.userData.isActive = false;

      particlePool.push(confetti);
    }
  }

  /**
   * 풀에서 파티클 가져오기 (없으면 새로 생성)
   */
  function getParticleFromPool() {
    let confetti = particlePool.find((p) => !p.userData.isActive);
    if (!confetti) {
      // 풀이 부족하면 새로 생성 (최대 파티클 수 제한 내에서)
      const geometry = new THREE.PlaneGeometry(0.2, 0.2);
      const color =
        CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
      const material = new THREE.MeshBasicMaterial({
        color,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 1,
      });
      confetti = new THREE.Mesh(geometry, material);
      confetti.userData.velocity = new THREE.Vector3();
      confetti.userData.rotationSpeed = new THREE.Vector3();
      confetti.userData.life = 0;
      confetti.userData.isActive = false;
      particlePool.push(confetti);
    }
    return confetti;
  }

  /**
   * 파티클을 비활성화하고 풀로 반환
   */
  function recycleParticle(confetti) {
    confetti.userData.isActive = false;
    confetti.visible = false;
    if (sceneRef) {
      sceneRef.remove(confetti);
    }
  }

  /**
   * 파티클 활성화 및 초기화
   */
  function activateParticle(confetti, pos) {
    confetti.userData.isActive = true;
    confetti.visible = true;
    confetti.position.copy(pos);
    confetti.position.x += (Math.random() - 0.5) * 2;
    confetti.position.y += (Math.random() - 0.5) * 2;

    confetti.userData.velocity.set(
      (Math.random() - 0.5) * 0.2,
      Math.random() * 0.2 + 0.1,
      (Math.random() - 0.5) * 0.2,
    );
    confetti.userData.rotationSpeed.set(
      (Math.random() - 0.5) * 0.2,
      (Math.random() - 0.5) * 0.2,
      (Math.random() - 0.5) * 0.2,
    );
    confetti.userData.life = 3;

    // 색상 랜덤 변경
    confetti.material.color.setHex(
      CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
    );

    if (sceneRef) {
      sceneRef.add(confetti);
    }
  }

  function spawn(clientX, clientY, count = 5) {
    if (!sceneRef || !cameraRef) return;

    // 최대 파티클 수 제한 확인
    const currentActiveCount = activeParticles.length;
    if (currentActiveCount >= maxParticles) {
      return; // 최대치 도달 시 생성 중단
    }

    // 남은 슬롯만큼만 생성
    const availableSlots = maxParticles - currentActiveCount;
    const spawnCount = Math.min(count, availableSlots);

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

    for (let i = 0; i < spawnCount; i++) {
      const confetti = getParticleFromPool();
      activateParticle(confetti, pos);
      activeParticles.push(confetti);
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
      // 파티클 풀 초기화
      if (particlePool.length === 0) {
        initParticlePool();
      }
    },

    onMouseMove,

    /** @param {number} delta */
    update(delta) {
      // filter 대신 직접 순회로 성능 최적화 (풀링과 함께 사용)
      for (let i = activeParticles.length - 1; i >= 0; i--) {
        const confetti = activeParticles[i];
        confetti.userData.life -= delta;

        if (confetti.userData.life <= 0) {
          // 파티클을 풀로 반환 (dispose하지 않음)
          recycleParticle(confetti);
          activeParticles.splice(i, 1);
          continue;
        }

        // 물리 업데이트 (clone 없이 직접 계산으로 최적화)
        confetti.userData.velocity.y -= delta * 0.5;
        const speed = delta * 10;
        confetti.position.x += confetti.userData.velocity.x * speed;
        confetti.position.y += confetti.userData.velocity.y * speed;
        confetti.position.z += confetti.userData.velocity.z * speed;

        // 회전 업데이트
        confetti.rotation.x += confetti.userData.rotationSpeed.x;
        confetti.rotation.y += confetti.userData.rotationSpeed.y;
        confetti.rotation.z += confetti.userData.rotationSpeed.z;

        // 투명도 업데이트
        confetti.material.opacity = confetti.userData.life / 3;
      }
    },

    /** @param {THREE.Scene} scene */
    cleanup(scene) {
      // 활성 파티클 모두 비활성화
      activeParticles.forEach((p) => {
        recycleParticle(p);
      });
      activeParticles = [];

      // 풀의 모든 파티클 정리 (cleanup 시에만 dispose)
      particlePool.forEach((p) => {
        if (p.parent) {
          scene.remove(p);
        }
        if (p.geometry) p.geometry.dispose();
        if (p.material) p.material.dispose();
      });
      particlePool = [];
      sceneRef = null;
      cameraRef = null;
    },
  };
}
