/**
 * Stage3 섬 GLB: INT_ / OBJ_ 서브트리 메시에서 정적 충돌용 AABB 수집 (캐릭터 XZ 이동 차단)
 * v4 GLB: 거대 OBJ_ 루트 아래 지형 슬라브만 제외하고, 개별 OBJ_ prop은 유지한다.
 * 실제 Cannon 월드는 쓰지 않고, 바닥 이동만 원 vs AABB로 해석한다.
 */
import * as THREE from "three";

/** @typedef {{ minX: number, maxX: number, minZ: number, maxZ: number, minY: number, maxY: number, src?: string }} IslandColliderAabb */

const INT_PREFIX_UPPER = "INT_";
const OBJ_PREFIX_UPPER = "OBJ_";
const WELL_NODE_RE = /^INT_Well$/i;
/** 거대 OBJ_ 루트·지형 메시 이름 — prop 충돌은 유지 */
const OBJ_TERRAIN_NAME_RE =
  /^OBJ_(Island|Terrain|Ground|Floor|Walk|Path|Grass|Brick|Sea|Water|Land|Base|Mesh)/i;
/** 껌 리그 — 통로 막힘 방지 (island15: OBJ_Sunbed1/2는 개별 메시라 콜라이더 유지) */
const OBJ_SKIP_COLLISION_RE = /^$/; // 현재 스킵 대상 없음
/** GLB 메시 AABB가 비정상적으로 큰 피크닉 소품만 제거 (등대·울타리·구조물은 유지) */
const INFLATED_MESH_SRC_RE =
  /Apple|PicnicBasket|Bush|Sandwhich|Sandwich|Strawberry|Fork|Plate|Cake|PicnicTable|Parasol/i;
/** 과대 AABB여도 충돌 유지·필요 시 XZ만 축소 */
const STRUCTURE_COLLIDER_SRC_RE =
  /LightHouse|Lighthouse|Statue|Boat|Stair|Rock/i;
const FENCE_COLLISION_SKIP_RE = /Fence|울타리/i;
/** @type {readonly { re: RegExp, scale: number }[]} */
const PROP_TIGHT_XZ_RULES = [
  { re: /Parasol/i, scale: 0.76 },
  { re: /PicnicTable|PicnicBasket/i, scale: 0.72 },
  { re: /^INT_Bench$/i, scale: 0.8 },
  { re: /^INT_Tent$/i, scale: 0.82 },
];

/** @typedef {{ centerX: number, centerZ: number, radius: number }} WellPassZone */
/** @typedef {{
 *   centerX: number,
 *   centerZ: number,
 *   passRadius: number,
 *   approachMinZ: number,
 *   approachMaxZ: number,
 *   approachMinX: number,
 *   approachMaxX: number,
 * }} PortalPassZone */

const PORTAL_NODE_RE = /^INT_Portal$/i;
const PORTAL_VORTEX_MESH_RE = /^Portal_Vortex$/i;
const PORTAL_RELATED_SRC_RE = /Portal|Vortex/i;

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
 * @param {import("three").Object3D} mesh
 * @returns {boolean}
 */
function isUnderIntSubtree(mesh) {
  let p = mesh;
  while (p) {
    const n = typeof p.name === "string" ? p.name.trim() : "";
    if (n.toUpperCase().startsWith(INT_PREFIX_UPPER)) return true;
    p = p.parent;
  }
  return false;
}

/**
 * @param {THREE.Box3} box
 * @param {THREE.Box3} backgroundBounds
 * @returns {boolean}
 */
function isDominantTerrainBox(box, backgroundBounds) {
  if (!backgroundBounds || backgroundBounds.isEmpty() || box.isEmpty())
    return false;
  const bgW = backgroundBounds.max.x - backgroundBounds.min.x;
  const bgD = backgroundBounds.max.z - backgroundBounds.min.z;
  if (bgW <= 1e-6 || bgD <= 1e-6) return false;
  const w = box.max.x - box.min.x;
  const d = box.max.z - box.min.z;
  const covX = w / bgW;
  const covZ = d / bgD;
  const footprint = w * d;
  const bgArea = bgW * bgD;
  const h = box.max.y - box.min.y;
  if (covX >= 0.45 && covZ >= 0.45) return true;
  if (footprint >= 0.28 * bgArea) return true;
  const covMax = Math.max(covX, covZ);
  const covMin = Math.min(covX, covZ);
  if (covMax >= 0.72 && covMin >= 0.22) return true;
  if (h <= 3.5 && covMin >= 0.16 && footprint >= 0.06 * bgArea) return true;
  return false;
}

/**
 * @param {import("three").Object3D} obj
 * @returns {boolean}
 */
function hasObjNamedChild(obj) {
  for (let i = 0; i < obj.children.length; i++) {
    const n =
      typeof obj.children[i].name === "string"
        ? obj.children[i].name.trim()
        : "";
    if (n.toUpperCase().startsWith(OBJ_PREFIX_UPPER)) return true;
  }
  return false;
}

/**
 * @param {THREE.Box3} box
 * @param {number} feetY
 * @param {number} [bodyHeight=1.65]
 * @returns {boolean}
 */
export function aabbOverlapsCharacterBodyY(box, feetY, bodyHeight = 1.65) {
  if (!Number.isFinite(feetY)) return true;
  const bodyMinY = feetY;
  const bodyMaxY = feetY + bodyHeight;
  return bodyMaxY >= box.minY - 0.2 && bodyMinY <= box.maxY + 0.12;
}

/**
 * @param {IslandColliderAabb} candidate
 * @param {number} scale
 * @returns {IslandColliderAabb}
 */
function tightenColliderXZ(candidate, scale) {
  const cx = (candidate.minX + candidate.maxX) * 0.5;
  const cz = (candidate.minZ + candidate.maxZ) * 0.5;
  const hx = Math.max(0.14, (candidate.maxX - candidate.minX) * 0.5 * scale);
  const hz = Math.max(0.14, (candidate.maxZ - candidate.minZ) * 0.5 * scale);
  return {
    minX: cx - hx,
    maxX: cx + hx,
    minZ: cz - hz,
    maxZ: cz + hz,
    minY: candidate.minY,
    maxY: candidate.maxY,
  };
}

/**
 * @param {import("three").Object3D} mesh
 * @returns {string}
 */
function getCollidableSourceName(mesh) {
  /** @type {string} */
  let deepest = "";
  let p = mesh;
  while (p) {
    const n = typeof p.name === "string" ? p.name.trim() : "";
    if (
      n.toUpperCase().startsWith(INT_PREFIX_UPPER) ||
      n.toUpperCase().startsWith(OBJ_PREFIX_UPPER) ||
      /^DECO_FT_ROCK/i.test(n)
    ) {
      deepest = n;
    }
    p = p.parent;
  }
  return deepest;
}

/**
 * @param {IslandColliderAabb} candidate
 * @param {string} sourceName
 * @returns {IslandColliderAabb | null}
 */
function applyPropColliderTuning(candidate, sourceName) {
  if (!sourceName) return candidate;
  if (OBJ_SKIP_COLLISION_RE.test(sourceName)) {
    return null;
  }
  for (let i = 0; i < PROP_TIGHT_XZ_RULES.length; i++) {
    const { re, scale } = PROP_TIGHT_XZ_RULES[i];
    if (re.test(sourceName)) return tightenColliderXZ(candidate, scale);
  }
  return candidate;
}

/**
 * @param {THREE.Box3} box
 * @param {THREE.Box3 | null} backgroundBounds
 * @param {WellPassZone[]} wellPassZones
 * @param {PortalPassZone[]} portalPassZones
 * @param {string} [sourceName]
 * @returns {IslandColliderAabb | null}
 */
function boxToColliderCandidate(
  box,
  backgroundBounds,
  wellPassZones,
  portalPassZones,
  sourceName = "",
) {
  if (FENCE_COLLISION_SKIP_RE.test(sourceName)) return null;
  if (box.isEmpty()) return null;
  let candidate = {
    minX: box.min.x,
    maxX: box.max.x,
    minZ: box.min.z,
    maxZ: box.max.z,
    minY: box.min.y,
    maxY: box.max.y,
  };
  if (overlapsWellPassZone(candidate, wellPassZones)) return null;
  if (overlapsPortalInnerPassZone(candidate, portalPassZones, sourceName))
    return null;
  if (backgroundBounds && isDominantTerrainBox(box, backgroundBounds))
    return null;
  candidate = applyPropColliderTuning(candidate, sourceName);
  return candidate;
}

/**
 * OBJ_ prop은 메시 단위가 아니라 leaf OBJ_ 노드당 1개 AABB (지면 메시 다중 AABB로 통로 막힘 방지).
 * @param {import("three").Object3D} islandRoot
 * @param {THREE.Box3} backgroundBounds
 * @param {WellPassZone[]} wellPassZones
 * @param {PortalPassZone[]} portalPassZones
 * @param {IslandColliderAabb[]} out
 * @param {THREE.Box3} tmp
 */
function collectLeafObjRootColliderBoxes(
  islandRoot,
  backgroundBounds,
  wellPassZones,
  portalPassZones,
  out,
  tmp,
) {
  islandRoot.traverse((obj) => {
    const n = typeof obj.name === "string" ? obj.name.trim() : "";
    if (!n.toUpperCase().startsWith(OBJ_PREFIX_UPPER)) return;
    if (OBJ_TERRAIN_NAME_RE.test(n)) return;
    if (hasObjNamedChild(obj)) return;

    tmp.setFromObject(obj);
    const candidate = boxToColliderCandidate(
      tmp,
      backgroundBounds,
      wellPassZones,
      portalPassZones,
      n,
    );
    if (candidate) {
      candidate.src = n;
      out.push(candidate);
    }
  });
}

/**
 * @param {number} cx
 * @param {number} cz
 * @param {number} r
 * @param {IslandColliderAabb[]} boxes
 * @param {number | null} [feetY]
 * @returns {{ i: number, src: string, minX: number, maxX: number, minZ: number, maxZ: number }[]}
 */
export function debugOverlappingCollidersAt(cx, cz, r, boxes, feetY = null) {
  /** @type {{ i: number, src: string, minX: number, maxX: number, minZ: number, maxZ: number }[]} */
  const hits = [];
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (!circleOverlapsAabbXZ(cx, cz, r, b, feetY)) continue;
    hits.push({
      i,
      src: b.src ?? "?",
      minX: b.minX,
      maxX: b.maxX,
      minZ: b.minZ,
      maxZ: b.maxZ,
    });
  }
  return hits;
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
 * Portal_Vortex(울렁거리는 면) 월드 bbox 기준 통과 원 + 남쪽 접근 통로.
 * @param {import("three").Object3D} islandRoot
 * @returns {PortalPassZone[]}
 */
function collectPortalPassZones(islandRoot) {
  /** @type {PortalPassZone[]} */
  const zones = [];
  const box = new THREE.Box3();
  const portalRoot = islandRoot.getObjectByName("INT_Portal");
  if (!portalRoot) return zones;

  portalRoot.updateMatrixWorld(true);

  /** @type {import("three").Mesh | null} */
  let vortexMesh = null;
  portalRoot.traverse((child) => {
    if (vortexMesh) return;
    if (!child.isMesh) return;
    if (PORTAL_VORTEX_MESH_RE.test(child.name)) vortexMesh = child;
  });

  if (vortexMesh) {
    box.setFromObject(vortexMesh);
  } else {
    box.setFromObject(portalRoot);
  }
  if (box.isEmpty()) return zones;

  const centerX = (box.min.x + box.max.x) * 0.5;
  const centerZ = (box.min.z + box.max.z) * 0.5;
  const spanX = Math.max(0, box.max.x - box.min.x);
  const spanZ = Math.max(0, box.max.z - box.min.z);
  const ext = Math.max(spanX, spanZ);
  const passRadius = THREE.MathUtils.clamp(ext * 0.5 * 0.96, 2.2, 4.2);
  const approachHalfX = passRadius + 3.5;

  zones.push({
    centerX,
    centerZ,
    passRadius,
    approachMinZ: centerZ - 8,
    approachMaxZ: centerZ + 1.2,
    approachMinX: centerX - approachHalfX,
    approachMaxX: centerX + approachHalfX,
  });
  return zones;
}

/**
 * @param {IslandColliderAabb} box
 * @param {PortalPassZone} zone
 * @returns {boolean}
 */
function aabbIntersectsPortalPassCylinder(box, zone) {
  return circleOverlapsAabbXZ(zone.centerX, zone.centerZ, zone.passRadius, box);
}

/**
 * @param {IslandColliderAabb} box
 * @param {PortalPassZone} zone
 * @returns {boolean}
 */
function aabbOverlapsPortalApproachCorridor(box, zone) {
  if (box.maxX < zone.approachMinX || box.minX > zone.approachMaxX)
    return false;
  if (box.maxZ < zone.approachMinZ || box.minZ > zone.approachMaxZ)
    return false;
  return true;
}

/**
 * @param {IslandColliderAabb} box
 * @param {PortalPassZone[]} zones
 * @param {string} sourceName
 * @returns {boolean}
 */
function overlapsPortalInnerPassZone(box, zones, sourceName = "") {
  if (!zones.length) return false;
  const isPortalRelated =
    PORTAL_NODE_RE.test(sourceName) || PORTAL_RELATED_SRC_RE.test(sourceName);

  for (let i = 0; i < zones.length; i++) {
    const z = zones[i];
    const inVortex = aabbIntersectsPortalPassCylinder(box, z);

    const h = box.maxY - box.minY;
    if (isPortalRelated && inVortex && h <= 3.2) return true;

    if (inVortex && h <= 5.5) return true;

    if (aabbOverlapsPortalApproachCorridor(box, z) && (inVortex || h <= 5.5)) {
      return true;
    }
  }
  return false;
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
 * @param {THREE.Box3} [backgroundBounds] - OBJ_ 지형 슬라브 필터용
 * @returns {IslandColliderAabb[]}
 */
export function collectIslandStaticColliderBoxes(
  islandRoot,
  backgroundBounds = null,
) {
  /** @type {IslandColliderAabb[]} */
  const out = [];
  const tmp = new THREE.Box3();
  islandRoot.updateMatrixWorld(true);
  const wellPassZones = collectWellPassZones(islandRoot);
  const portalPassZones = collectPortalPassZones(islandRoot);

  islandRoot.traverse((obj) => {
    if (!obj.isMesh) return;
    if (!isUnderIntSubtree(obj)) return;
    if (isUnderFenceSubtree(obj)) return;

    tmp.setFromObject(obj);
    const candidate = boxToColliderCandidate(
      tmp,
      backgroundBounds,
      wellPassZones,
      portalPassZones,
      getCollidableSourceName(obj),
    );
    if (candidate) {
      candidate.src = getCollidableSourceName(obj);
      out.push(candidate);
    }
  });

  collectLeafObjRootColliderBoxes(
    islandRoot,
    backgroundBounds,
    wellPassZones,
    portalPassZones,
    out,
    tmp,
  );

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
    if (STRUCTURE_COLLIDER_SRC_RE.test(b.src ?? "")) return true;

    const w = b.maxX - b.minX;
    const d = b.maxZ - b.minZ;
    const covX = w / bgW;
    const covZ = d / bgD;
    const footprint = w * d;
    const h = b.maxY - b.minY;

    if (covX >= axisCoverRatio && covZ >= axisCoverRatio) return false;
    if (footprint >= footprintAreaRatio * bgArea) return false;
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
 * 스폰 원이 XZ에서 박스와 겹치면 slide가 전 방향 막힘 — 해당 박스만 제외(나머지 오브젝트 충돌 유지).
 * @param {IslandColliderAabb[]} boxes
 * @param {number} spawnX
 * @param {number} spawnZ
 * @param {number} spawnRadius - 캐릭터 collisionRadius + 여유
 * @returns {IslandColliderAabb[]}
 */
/**
 * 메시 바운딩이 실제 크기보다 과대한 OBJ_ 소품 제거 (로그: OBJ_Apple·PicnicBasket·PicnicTable 등).
 * INT_Fountain은 유지.
 * @param {IslandColliderAabb[]} boxes
 * @param {number} [maxObjAxisLen=7]
 * @returns {IslandColliderAabb[]}
 */
export function filterCollidersExcludingInflatedMeshBounds(
  boxes,
  maxObjAxisLen = 7,
) {
  /** @type {string[]} */
  const removed = [];
  /** @type {string[]} */
  const tightened = [];
  const filtered = boxes
    .filter((b) => {
      const src = b.src ?? "";
      if (/^INT_Fountain$/i.test(src)) return true;
      const w = b.maxX - b.minX;
      const d = b.maxZ - b.minZ;
      const maxAxis = Math.max(w, d);
      const isObj = /^OBJ_/i.test(src);
      if (!isObj) return true;
      if (STRUCTURE_COLLIDER_SRC_RE.test(src)) return true;
      if (maxAxis <= maxObjAxisLen) return true;
      if (INFLATED_MESH_SRC_RE.test(src)) {
        removed.push(`${src}(${maxAxis.toFixed(1)}m)`);
        return false;
      }
      return true;
    })
    .map((b) => {
      const src = b.src ?? "";
      if (!STRUCTURE_COLLIDER_SRC_RE.test(src)) return b;
      const maxAxis = Math.max(b.maxX - b.minX, b.maxZ - b.minZ);
      if (maxAxis <= maxObjAxisLen) return b;
      const scale = /Fence/i.test(src) ? 0.9 : 0.82;
      tightened.push(`${src}(${maxAxis.toFixed(1)}m→${scale})`);
      const t = tightenColliderXZ(b, scale);
      t.src = src;
      return t;
    });
  return filtered;
}

export function filterCollidersExcludingSpawnOverlap(
  boxes,
  spawnX,
  spawnZ,
  spawnRadius,
) {
  if (
    !boxes.length ||
    !Number.isFinite(spawnX) ||
    !Number.isFinite(spawnZ) ||
    !Number.isFinite(spawnRadius) ||
    spawnRadius <= 0
  ) {
    return boxes;
  }
  return boxes.filter(
    (b) => !circleOverlapsAabbXZ(spawnX, spawnZ, spawnRadius, b),
  );
}

/**
 * XZ 평면에서 원과 축정렬 박스 교차 (feetY 지정 시 지면·낮은 슬라브는 무시)
 * @param {number} cx
 * @param {number} cz
 * @param {number} r
 * @param {IslandColliderAabb} box
 * @param {number | null} [feetY]
 * @param {number} [bodyHeight=1.65]
 */
export function circleOverlapsAabbXZ(
  cx,
  cz,
  r,
  box,
  feetY = null,
  bodyHeight = 1.65,
) {
  if (feetY != null && !aabbOverlapsCharacterBodyY(box, feetY, bodyHeight)) {
    return false;
  }
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
 * @param {number | null} [feetY]
 * @param {number} [bodyHeight=1.65]
 */
export function circleOverlapsAny(
  cx,
  cz,
  r,
  boxes,
  feetY = null,
  bodyHeight = 1.65,
) {
  for (let i = 0; i < boxes.length; i++) {
    if (circleOverlapsAabbXZ(cx, cz, r, boxes[i], feetY, bodyHeight))
      return true;
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
 * @param {number | null} [feetY]
 * @param {number} [bodyHeight=1.65]
 * @returns {{ x: number, z: number }}
 */
export function slideMoveXZAgainstAABBs(
  oldX,
  oldZ,
  newX,
  newZ,
  r,
  boxes,
  feetY = null,
  bodyHeight = 1.65,
) {
  if (!boxes.length) return { x: newX, z: newZ };

  let x = newX;
  let z = newZ;
  if (!circleOverlapsAny(x, z, r, boxes, feetY, bodyHeight)) return { x, z };

  x = newX;
  z = oldZ;
  if (!circleOverlapsAny(x, z, r, boxes, feetY, bodyHeight)) return { x, z };

  x = oldX;
  z = newZ;
  if (!circleOverlapsAny(x, z, r, boxes, feetY, bodyHeight)) return { x, z };

  return { x: oldX, z: oldZ };
}
