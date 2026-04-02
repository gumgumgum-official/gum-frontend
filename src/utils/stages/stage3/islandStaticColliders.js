/**
 * Stage3 섬 GLB: INT_ / OBJ_ 서브트리 메시에서 정적 충돌용 AABB 수집 (캐릭터 XZ 이동 차단)
 * 실제 Cannon 월드는 쓰지 않고, 바닥 이동만 원 vs AABB로 해석한다.
 */
import * as THREE from "three";

/** @typedef {{ minX: number, maxX: number, minZ: number, maxZ: number, minY: number, maxY: number }} IslandColliderAabb */

const PREFIXES_UPPER = ["INT_", "OBJ_"];

/** 포탈 메시는 논리 평면 통과와 겹치므로 충돌에서 제외 */
const PORTAL_NODE_RE = /^INT_Portal$/i;

/**
 * @param {string} name
 * @returns {boolean}
 */
function hasCollidablePrefix(name) {
  const n = typeof name === "string" ? name.trim() : "";
  if (!n) return false;
  const up = n.toUpperCase();
  return PREFIXES_UPPER.some((p) => up.startsWith(p));
}

/**
 * @param {import("three").Object3D} mesh
 * @returns {boolean}
 */
function isUnderCollidableSubtree(mesh) {
  let p = mesh;
  while (p) {
    if (hasCollidablePrefix(p.name)) return true;
    p = p.parent;
  }
  return false;
}

/**
 * @param {import("three").Object3D} mesh
 * @returns {boolean}
 */
function isUnderPortalRoot(mesh) {
  let p = mesh;
  while (p) {
    const n = typeof p.name === "string" ? p.name.trim() : "";
    if (PORTAL_NODE_RE.test(n)) return true;
    p = p.parent;
  }
  return false;
}

/**
 * island 루트 기준 월드 AABB 목록 (메시 단위, 얇은 조각은 그대로 포함)
 * @param {import("three").Object3D} islandRoot
 * @returns {IslandColliderAabb[]}
 */
export function collectIslandStaticColliderBoxes(islandRoot) {
  /** @type {IslandColliderAabb[]} */
  const out = [];
  const tmp = new THREE.Box3();
  islandRoot.updateMatrixWorld(true);

  islandRoot.traverse((obj) => {
    if (!obj.isMesh) return;
    if (!isUnderCollidableSubtree(obj)) return;
    if (isUnderPortalRoot(obj)) return;

    tmp.setFromObject(obj);
    if (tmp.isEmpty()) return;

    out.push({
      minX: tmp.min.x,
      maxX: tmp.max.x,
      minZ: tmp.min.z,
      maxZ: tmp.max.z,
      minY: tmp.min.y,
      maxY: tmp.max.y,
    });
  });

  return out;
}

/**
 * XZ 평면에서 원과 축정렬 박스 교차
 * @param {number} cx
 * @param {number} cz
 * @param {number} r
 * @param {IslandColliderAabb} box
 */
export function circleOverlapsAabbXZ(cx, cz, r, box) {
  const px = Math.max(box.minX, Math.min(cx, box.maxX));
  const pz = Math.max(box.minZ, Math.min(cz, box.maxZ));
  const dx = cx - px;
  const dz = cz - pz;
  return dx * dx + dz * dz < r * r;
}

/**
 * @param {number} cx
 * @param {number} cz
 * @param {number} r
 * @param {IslandColliderAabb[]} boxes
 */
export function circleOverlapsAny(cx, cz, r, boxes) {
  for (let i = 0; i < boxes.length; i++) {
    if (circleOverlapsAabbXZ(cx, cz, r, boxes[i])) return true;
  }
  return false;
}

/**
 * 축 분리 슬라이드 (전체 이동 → X만 → Z만)
 * @param {number} oldX
 * @param {number} oldZ
 * @param {number} newX
 * @param {number} newZ
 * @param {number} r
 * @param {IslandColliderAabb[]} boxes
 * @returns {{ x: number, z: number }}
 */
export function slideMoveXZAgainstAABBs(oldX, oldZ, newX, newZ, r, boxes) {
  if (!boxes.length) return { x: newX, z: newZ };

  let x = newX;
  let z = newZ;
  if (!circleOverlapsAny(x, z, r, boxes)) return { x, z };

  x = oldX + (newX - oldX);
  z = oldZ;
  if (!circleOverlapsAny(x, z, r, boxes)) return { x, z };

  x = oldX;
  z = oldZ + (newZ - oldZ);
  if (!circleOverlapsAny(x, z, r, boxes)) return { x, z };

  return { x: oldX, z: oldZ };
}
