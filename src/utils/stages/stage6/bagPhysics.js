import * as THREE from "three";
import { slideMoveXZAgainstAABBs } from "../stage3/islandStaticColliders.js";
import { resolvePublicAssetUrl } from "../../common/gltfTemplateCache.js";

export const BAG_OBJECT_NAME = "OBJ_Bag1";

const _frustumVec = new THREE.Vector3();

/**
 * 주어진 월드 XZ 좌표(Y 고정)가 카메라 화면 안에 있는지 확인한다.
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @param {THREE.Camera} camera
 */
function isInCameraView(x, y, z, camera) {
  _frustumVec.set(x, y, z).project(camera);
  return (
    _frustumVec.x >= -1 &&
    _frustumVec.x <= 1 &&
    _frustumVec.y >= -1 &&
    _frustumVec.y <= 1
  );
}

const BAG_IMPULSE_STRENGTH = 5.5;
const BAG_FRICTION = 3.5;
const BAG_NUDGE_COOLDOWN_SEC = 0.22;
const BAG_MAX_DRIFT = 3.5;
const BAG_MAX_SPEED = 7.0;
const BAG_TOUCH_SOUNDS = [
  "/static/sounds/airport/bag_touch1.mp3",
  "/static/sounds/airport/bag_touch2.mp3",
];
const BAG_TOUCH_SOUND_VOLUME = 0.55;

/** @param {THREE.Object3D} obj */
function collectMeshAabbsXZ(obj) {
  const out = [];
  const tmp = new THREE.Box3();
  obj.updateMatrixWorld(true);
  obj.traverse((child) => {
    if (!child.isMesh) return;
    tmp.setFromObject(child);
    if (tmp.isEmpty()) return;
    out.push({
      minX: tmp.min.x,
      maxX: tmp.max.x,
      minZ: tmp.min.z,
      maxZ: tmp.max.z,
    });
  });
  return out;
}

/**
 * OBJ_Bag1 동적 넛지 물리 시스템.
 *
 * 사용법:
 *   const bagPhysics = createBagPhysics();
 *   const colliders = bagPhysics.setup(model.getObjectByName(BAG_OBJECT_NAME), allColliders);
 *   bagPhysics.addBenchColliders(benchModel);   // bench GLB 로드 후
 *   bagPhysics.update(charPos, charR, delta);   // update 루프
 *   bagPhysics.cleanup();                        // cleanup
 *
 * @returns {{
 *   setup: (
 *     bagObj: THREE.Object3D | null,
 *     allColliders: import("../stage3/islandStaticColliders.js").IslandColliderAabb[],
 *   ) => import("../stage3/islandStaticColliders.js").IslandColliderAabb[],
 *   addBenchColliders: (benchModel: THREE.Object3D) => void,
 *   update: (charPos: THREE.Vector3 | null, charR: number, delta: number, camera?: THREE.Camera | null) => void,
 *   cleanup: () => void,
 * }}
 */
export function createBagPhysics() {
  /** @type {THREE.Object3D | null} */
  let bagObject = null;
  let bagVelocityX = 0;
  let bagVelocityZ = 0;
  let bagNudgeCooldown = 0;
  const _bagInitialWorldPos = new THREE.Vector3();
  const _bagWorldPos = new THREE.Vector3();
  const _bagInitialAabb = { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
  const _bagCurrentAabb = { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
  let bagAabbCenterInitX = 0;
  let bagAabbCenterInitZ = 0;
  let bagAabbOffsetX = 0;
  let bagAabbOffsetZ = 0;
  /** @type {import("../stage3/islandStaticColliders.js").IslandColliderAabb[]} */
  let bagStaticColliders = [];
  let bagCollisionRadius = 0.3;
  /** @type {[HTMLAudioElement | null, HTMLAudioElement | null]} */
  const bagTouchAudios = [null, null];
  let bagTouchSoundIndex = 0;

  return {
    /**
     * bagObj를 dynamic 물체로 초기화하고, 자신을 제외한 충돌체 목록을 반환한다.
     * @param {THREE.Object3D | null} bagObj
     * @param {import("../stage3/islandStaticColliders.js").IslandColliderAabb[]} allColliders
     */
    setup(bagObj, allColliders) {
      bagObject = bagObj;
      bagVelocityX = 0;
      bagVelocityZ = 0;
      bagNudgeCooldown = 0;
      bagTouchSoundIndex = 0;

      if (bagObject) {
        bagObject.updateMatrixWorld(true);
        bagObject.getWorldPosition(_bagInitialWorldPos);
        const bagWorldBox = new THREE.Box3().setFromObject(bagObject);
        _bagInitialAabb.minX = bagWorldBox.min.x;
        _bagInitialAabb.maxX = bagWorldBox.max.x;
        _bagInitialAabb.minZ = bagWorldBox.min.z;
        _bagInitialAabb.maxZ = bagWorldBox.max.z;
        Object.assign(_bagCurrentAabb, _bagInitialAabb);

        const halfW = (_bagInitialAabb.maxX - _bagInitialAabb.minX) * 0.5;
        const halfD = (_bagInitialAabb.maxZ - _bagInitialAabb.minZ) * 0.5;
        bagAabbCenterInitX =
          (_bagInitialAabb.minX + _bagInitialAabb.maxX) * 0.5;
        bagAabbCenterInitZ =
          (_bagInitialAabb.minZ + _bagInitialAabb.maxZ) * 0.5;
        bagAabbOffsetX = bagAabbCenterInitX - _bagInitialWorldPos.x;
        bagAabbOffsetZ = bagAabbCenterInitZ - _bagInitialWorldPos.z;
        bagCollisionRadius = Math.max(halfW, halfD);
      }

      const bagMeshBoxes = bagObject ? collectMeshAabbsXZ(bagObject) : [];
      const filtered =
        bagMeshBoxes.length > 0
          ? allColliders.filter(
              (box) =>
                !bagMeshBoxes.some(
                  (b) =>
                    Math.abs(box.minX - b.minX) < 0.01 &&
                    Math.abs(box.maxX - b.maxX) < 0.01 &&
                    Math.abs(box.minZ - b.minZ) < 0.01 &&
                    Math.abs(box.maxZ - b.maxZ) < 0.01,
                ),
            )
          : allColliders;
      bagStaticColliders = filtered;
      return filtered;
    },

    /** 별도 GLB로 로드된 bench의 메쉬별 AABB를 충돌체에 추가 */
    addBenchColliders(benchModel) {
      benchModel.updateMatrixWorld(true);
      const tmp = new THREE.Box3();
      benchModel.traverse((child) => {
        if (!child.isMesh) return;
        tmp.setFromObject(child);
        if (tmp.isEmpty()) return;
        bagStaticColliders.push({
          minX: tmp.min.x,
          maxX: tmp.max.x,
          minZ: tmp.min.z,
          maxZ: tmp.max.z,
          minY: tmp.min.y,
          maxY: tmp.max.y,
        });
      });
    },

    /**
     * @param {THREE.Vector3 | null} charPos
     * @param {number} charR
     * @param {number} delta
     * @param {THREE.Camera | null} [camera]
     */
    update(charPos, charR, delta, camera) {
      if (!bagObject) return;

      bagNudgeCooldown = Math.max(0, bagNudgeCooldown - delta);

      if (charPos) {
        const px = Math.max(
          _bagCurrentAabb.minX,
          Math.min(charPos.x, _bagCurrentAabb.maxX),
        );
        const pz = Math.max(
          _bagCurrentAabb.minZ,
          Math.min(charPos.z, _bagCurrentAabb.maxZ),
        );
        const dx = charPos.x - px;
        const dz = charPos.z - pz;
        if (dx * dx + dz * dz < charR * charR && bagNudgeCooldown <= 0) {
          const bagCx = (_bagCurrentAabb.minX + _bagCurrentAabb.maxX) * 0.5;
          const bagCz = (_bagCurrentAabb.minZ + _bagCurrentAabb.maxZ) * 0.5;
          let pushX = bagCx - charPos.x;
          let pushZ = bagCz - charPos.z;
          const len = Math.sqrt(pushX * pushX + pushZ * pushZ);
          if (len > 1e-6) {
            pushX /= len;
            pushZ /= len;
          } else {
            pushX = 0;
            pushZ = 1;
          }
          bagVelocityX += pushX * BAG_IMPULSE_STRENGTH;
          bagVelocityZ += pushZ * BAG_IMPULSE_STRENGTH;
          const spd = Math.sqrt(
            bagVelocityX * bagVelocityX + bagVelocityZ * bagVelocityZ,
          );
          if (spd > BAG_MAX_SPEED) {
            const inv = BAG_MAX_SPEED / spd;
            bagVelocityX *= inv;
            bagVelocityZ *= inv;
          }
          const sndIdx = bagTouchSoundIndex % 2;
          bagTouchSoundIndex++;
          if (!bagTouchAudios[sndIdx]) {
            bagTouchAudios[sndIdx] = new window.Audio();
            bagTouchAudios[sndIdx].preload = "auto";
            bagTouchAudios[sndIdx].src = resolvePublicAssetUrl(
              BAG_TOUCH_SOUNDS[sndIdx],
            );
          }
          const snd = bagTouchAudios[sndIdx];
          snd.volume = BAG_TOUCH_SOUND_VOLUME;
          snd.currentTime = 0;
          snd.play().catch(() => {});
          bagNudgeCooldown = BAG_NUDGE_COOLDOWN_SEC;
        }
      }

      const frictionFactor = Math.exp(-BAG_FRICTION * delta);
      bagVelocityX *= frictionFactor;
      bagVelocityZ *= frictionFactor;

      const spd = Math.sqrt(
        bagVelocityX * bagVelocityX + bagVelocityZ * bagVelocityZ,
      );
      if (spd <= 1e-4) return;

      // 충돌 원 중심 = AABB 센터 (origin ≠ AABB center 인 경우에도 정확한 충돌 보장)
      const circleCX = (_bagCurrentAabb.minX + _bagCurrentAabb.maxX) * 0.5;
      const circleCZ = (_bagCurrentAabb.minZ + _bagCurrentAabb.maxZ) * 0.5;
      let targetCX = circleCX + bagVelocityX * delta;
      let targetCZ = circleCZ + bagVelocityZ * delta;

      const driftX = targetCX - bagAabbCenterInitX;
      const driftZ = targetCZ - bagAabbCenterInitZ;
      const drift = Math.sqrt(driftX * driftX + driftZ * driftZ);
      if (drift > BAG_MAX_DRIFT) {
        const s = BAG_MAX_DRIFT / drift;
        targetCX = bagAabbCenterInitX + driftX * s;
        targetCZ = bagAabbCenterInitZ + driftZ * s;
        bagVelocityX *= -0.3;
        bagVelocityZ *= -0.3;
      }

      const slid = slideMoveXZAgainstAABBs(
        circleCX,
        circleCZ,
        targetCX,
        targetCZ,
        bagCollisionRadius,
        bagStaticColliders,
      );
      if (Math.abs(slid.x - targetCX) > 1e-6) bagVelocityX *= -0.15;
      if (Math.abs(slid.z - targetCZ) > 1e-6) bagVelocityZ *= -0.15;

      // 카메라 프러스텀 경계 제약 — 화면 밖으로 나가는 이동을 차단한다
      bagObject.getWorldPosition(_bagWorldPos);
      const bagY = _bagWorldPos.y;
      if (camera && !isInCameraView(slid.x, bagY, slid.z, camera)) {
        const canX = isInCameraView(slid.x, bagY, circleCZ, camera);
        const canZ = isInCameraView(circleCX, bagY, slid.z, camera);
        if (canX) {
          if (Math.abs(slid.z - circleCZ) > 1e-6) bagVelocityZ *= -0.15;
          slid.z = circleCZ;
        } else if (canZ) {
          if (Math.abs(slid.x - circleCX) > 1e-6) bagVelocityX *= -0.15;
          slid.x = circleCX;
        } else {
          if (Math.abs(slid.x - circleCX) > 1e-6) bagVelocityX *= -0.15;
          if (Math.abs(slid.z - circleCZ) > 1e-6) bagVelocityZ *= -0.15;
          slid.x = circleCX;
          slid.z = circleCZ;
        }
      }

      // slid = 새 AABB 센터 → origin = 센터 - offset → 월드→로컬 변환 후 적용
      // (bagY 취득을 위해 위에서 이미 getWorldPosition 호출함)
      _bagWorldPos.x = slid.x - bagAabbOffsetX;
      _bagWorldPos.z = slid.z - bagAabbOffsetZ;
      if (bagObject.parent) bagObject.parent.worldToLocal(_bagWorldPos);
      bagObject.position.x = _bagWorldPos.x;
      bagObject.position.z = _bagWorldPos.z;

      const halfW2 = (_bagInitialAabb.maxX - _bagInitialAabb.minX) * 0.5;
      const halfD2 = (_bagInitialAabb.maxZ - _bagInitialAabb.minZ) * 0.5;
      _bagCurrentAabb.minX = slid.x - halfW2;
      _bagCurrentAabb.maxX = slid.x + halfW2;
      _bagCurrentAabb.minZ = slid.z - halfD2;
      _bagCurrentAabb.maxZ = slid.z + halfD2;
    },

    cleanup() {
      bagObject = null;
      bagVelocityX = 0;
      bagVelocityZ = 0;
      bagNudgeCooldown = 0;
      bagStaticColliders = [];
      bagCollisionRadius = 0.3;
      bagAabbCenterInitX = 0;
      bagAabbCenterInitZ = 0;
      bagAabbOffsetX = 0;
      bagAabbOffsetZ = 0;
      for (let i = 0; i < bagTouchAudios.length; i++) {
        if (bagTouchAudios[i]) {
          bagTouchAudios[i].pause();
          bagTouchAudios[i].src = "";
          bagTouchAudios[i] = null;
        }
      }
      bagTouchSoundIndex = 0;
    },
  };
}
