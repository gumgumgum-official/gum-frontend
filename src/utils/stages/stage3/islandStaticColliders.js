/**
 * Stage3 섬 GLB: INT_ / OBJ_ 서브트리 메시에서 정적 충돌용 AABB 수집 (캐릭터 XZ 이동 차단)
 * 실제 Cannon 월드는 쓰지 않고, 바닥 이동만 원 vs AABB로 해석한다.
 */
import * as THREE from "three";

/** @typedef {{ minX: number, maxX: number, minZ: number, maxZ: number, minY: number, maxY: number }} IslandColliderAabb */

const PREFIXES_UPPER = ["INT_", "OBJ_"];
const EXTRA_COLLIDER_PREFIXES_UPPER = ["DECO_FT_ROCK"];
const WELL_NODE_RE = /^INT_Well$/i;

/** @typedef {{ centerX: number, centerZ: number, radius: number }} WellPassZone */

/**
 * @param {string} name
 * @returns {boolean}
 */
function hasCollidablePrefix(name) {
  const n = typeof name === "string" ? name.trim() : "";
  if (!n) return false;
  const up = n.toUpperCase();
  return (
    PREFIXES_UPPER.some((p) => up.startsWith(p)) ||
    EXTRA_COLLIDER_PREFIXES_UPPER.some((p) => up.startsWith(p))
  );
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
  const portalNodeRe = /^INT_Portal$/i;
  let p = mesh;
  while (p) {
    const n = typeof p.name === "string" ? p.name.trim() : "";
    if (portalNodeRe.test(n)) return true;
    p = p.parent;
  }
  return false;
}

const FENCE_NAME_RE = /fence|울타리/i;

/**
 * 울타리 서브트리 내 메시는 캐릭터 장애물 AABB에서 제외한다.
 * islandValidator 가 이미 울타리 안/밖을 처리하므로 이중 차단 불필요.
 * @param {import("three").Object3D} mesh
 * @returns {boolean}
 */
function isUnderFenceSubtree(mesh) {
  let p = mesh;
  while (p) {
    if (FENCE_NAME_RE.test(typeof p.name === "string" ? p.name : ""))
      return true;
    p = p.parent;
  }
  return false;
}

/**
 * 우물 주변의 "울타리 없는 안쪽" 진입을 허용하기 위한 통과 존 생성.
 * @param {import("three").Object3D} islandRoot
 * @returns {WellPassZone[]}
 */
function collectWellPassZones(islandRoot) {
  /** @type {WellPassZone[]} */
  const zones = [];
  const box = new THREE.Box3();
  islandRoot.traverse((obj) => {
    const n = typeof obj.name === "string" ? obj.name.trim() : "";
    if (!WELL_NODE_RE.test(n)) return;
    obj.updateMatrixWorld(true);
    box.setFromObject(obj);
    if (box.isEmpty()) return;
    const w = Math.max(0, box.max.x - box.min.x);
    const d = Math.max(0, box.max.z - box.min.z);
    const halfMax = Math.max(w, d) * 0.5;
    zones.push({
      centerX: (box.min.x + box.max.x) * 0.5,
      centerZ: (box.min.z + box.max.z) * 0.5,
      // 우물 bbox 기반 반경 + 소폭 여유를 둬 내부 진입만 확실히 허용
      radius: Math.max(2.2, halfMax + 0.9),
    });
  });
  return zones;
}

/**
 * @param {IslandColliderAabb} box
 * @param {WellPassZone[]} zones
 * @returns {boolean}
 */
function overlapsWellPassZone(box, zones) {
  if (!zones.length) return false;
  for (let i = 0; i < zones.length; i++) {
    const z = zones[i];
    const innerRadius = z.radius * 0.62;
    const px = Math.max(box.minX, Math.min(z.centerX, box.maxX));
    const pz = Math.max(box.minZ, Math.min(z.centerZ, box.maxZ));
    const dx = z.centerX - px;
    const dz = z.centerZ - pz;
    if (dx * dx + dz * dz > innerRadius * innerRadius) continue;

    const h = box.maxY - box.minY;
    // 울타리(세로 구조물)는 유지하고, 내부 진입을 막는 낮은/평평한 박스만 제거.
    if (h > 2.2) continue;
    return true;
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
  const wellPassZones = collectWellPassZones(islandRoot);

  islandRoot.traverse((obj) => {
    if (!obj.isMesh) return;
    if (!isUnderCollidableSubtree(obj)) return;
    if (isUnderPortalRoot(obj)) return;
    if (isUnderFenceSubtree(obj)) return;

    tmp.setFromObject(obj);
    if (tmp.isEmpty()) return;

    const candidate = {
      minX: tmp.min.x,
      maxX: tmp.max.x,
      minZ: tmp.min.z,
      maxZ: tmp.max.z,
      minY: tmp.min.y,
      maxY: tmp.max.y,
    };
    if (overlapsWellPassZone(candidate, wellPassZones)) return;
    out.push(candidate);
  });

  return out;
}

/**
 * XZ 면적이 배경 바운딩과 거의 같은 메시는 지형(바닥)로 보고 충돌에서 제외한다.
 * GLB에서 지형까지 OBJ_/INT_ 아래에 두면 거대 AABB가 생기고, 원·AABB 검사가
 * 항상 겹친다고 나와 이동이 전부 막히는 경우가 있다.
 * @param {IslandColliderAabb[]} boxes
 * @param {import("three").Box3} backgroundBounds
 * @param {number} [axisCoverRatio=0.58] - 박스 가로·세로 각각이 배경의 이 비율 이상이면 제외
 * @param {number} [footprintAreaRatio=0.42] - XZ 면적 비가 배경의 이 비율 이상이면 제외
 * @param {number} [maxSlabThicknessY=3.5] - 이 높이 이하이면서 넓은 판이면 지형으로 보고 제외
 * @returns {IslandColliderAabb[]}
 */
export function filterCollidersExcludingDominantTerrain(
  boxes,
  backgroundBounds,
  axisCoverRatio = 0.58,
  footprintAreaRatio = 0.42,
  maxSlabThicknessY = 3.5,
) {
  if (!backgroundBounds || backgroundBounds.isEmpty()) return boxes;
  const bgW = backgroundBounds.max.x - backgroundBounds.min.x;
  const bgD = backgroundBounds.max.z - backgroundBounds.min.z;
  if (bgW <= 1e-6 || bgD <= 1e-6) return boxes;

  const bgArea = bgW * bgD;

  return boxes.filter((b) => {
    const w = b.maxX - b.minX;
    const d = b.maxZ - b.minZ;
    const covX = w / bgW;
    const covZ = d / bgD;
    const footprint = w * d;
    const h = b.maxY - b.minY;

    if (covX >= axisCoverRatio && covZ >= axisCoverRatio) return false;
    if (footprint >= footprintAreaRatio * bgArea) return false;
    // 한 축은 거의 전체, 다른 축도 상당히 넓음 → 바닥/절벽 슬라브류
    const covMax = Math.max(covX, covZ);
    const covMin = Math.min(covX, covZ);
    if (covMax >= 0.82 && covMin >= 0.28) return false;

    if (h <= maxSlabThicknessY && covMin >= 0.2 && footprint >= 0.07 * bgArea) {
      return false;
    }

    return true;
  });
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

  // X만 이동 시도 (Z는 원래 값 유지)
  x = newX;
  z = oldZ;
  if (!circleOverlapsAny(x, z, r, boxes)) return { x, z };

  x = oldX;
  // Z만 이동 시도 (X는 원래 값 유지)
  z = newZ;
  if (!circleOverlapsAny(x, z, r, boxes)) return { x, z };

  return { x: oldX, z: oldZ };
}
