/**
 * Stage3 글자 shatter용 삼각형 기하 유틸 (순수 함수)
 */
import * as THREE from "three";

const _v3 = new THREE.Vector3();
const _v3b = new THREE.Vector3();
const _v3c = new THREE.Vector3();
const _normal = new THREE.Vector3();
const CUT_NORMAL_LEFT = new THREE.Vector3(1, 0, 0);
const CUT_NORMAL_RIGHT = new THREE.Vector3(-1, 0, 0);

/** @param {THREE.Object3D} group */
export function collectTrianglesFromGroup(group) {
  group.updateMatrixWorld(true);
  const triangles = [];
  let meshIndex = 0;
  group.traverse((child) => {
    if (!child.isMesh || !child.geometry) return;
    const geom = child.geometry;
    const posAttr = geom.getAttribute("position");
    const normAttr = geom.getAttribute("normal");
    if (!posAttr) return;
    const index = geom.getIndex();
    const matrix = child.matrixWorld;
    const addTri = (i0, i1, i2) => {
      _v3.fromBufferAttribute(posAttr, i0);
      _v3b.fromBufferAttribute(posAttr, i1);
      _v3c.fromBufferAttribute(posAttr, i2);
      _v3.applyMatrix4(matrix);
      _v3b.applyMatrix4(matrix);
      _v3c.applyMatrix4(matrix);
      const p0 = _v3.clone();
      const p1 = _v3b.clone();
      const p2 = _v3c.clone();
      if (normAttr) {
        _normal.fromBufferAttribute(normAttr, i0);
        _normal.transformDirection(matrix);
        const n0 = _normal.clone();
        _normal.fromBufferAttribute(normAttr, i1);
        _normal.transformDirection(matrix);
        const n1 = _normal.clone();
        _normal.fromBufferAttribute(normAttr, i2);
        _normal.transformDirection(matrix);
        const n2 = _normal.clone();
        triangles.push({ p0, p1, p2, n0, n1, n2, meshIndex });
      } else {
        triangles.push({
          p0,
          p1,
          p2,
          n0: new THREE.Vector3(0, 1, 0),
          n1: new THREE.Vector3(0, 1, 0),
          n2: new THREE.Vector3(0, 1, 0),
          meshIndex,
        });
      }
    };
    meshIndex += 1;
    if (index) {
      for (let i = 0; i < index.count; i += 3) {
        addTri(index.getX(i), index.getX(i + 1), index.getX(i + 2));
      }
    } else {
      for (let i = 0; i < posAttr.count; i += 3) {
        addTri(i, i + 1, i + 2);
      }
    }
  });
  return triangles;
}

function clipTriangleByPlane(tri, cutX) {
  const d0 = tri.p0.x - cutX;
  const d1 = tri.p1.x - cutX;
  const d2 = tri.p2.x - cutX;
  const left = [];
  const right = [];
  const pushTri = (arr, q0, q1, q2, m0, m1, m2) => {
    arr.push({
      p0: q0.clone(),
      p1: q1.clone(),
      p2: q2.clone(),
      n0: m0.clone(),
      n1: m1.clone(),
      n2: m2.clone(),
    });
  };
  const onPlane = (pA, pB, t) => {
    const p = new THREE.Vector3().lerpVectors(pA, pB, t);
    p.x = cutX;
    return p;
  };
  if (d0 <= 0 && d1 <= 0 && d2 <= 0) {
    pushTri(left, tri.p0, tri.p1, tri.p2, tri.n0, tri.n1, tri.n2);
    return { left, right };
  }
  if (d0 >= 0 && d1 >= 0 && d2 >= 0) {
    pushTri(right, tri.p0, tri.p1, tri.p2, tri.n0, tri.n1, tri.n2);
    return { left, right };
  }
  const t01 = d0 - d1 !== 0 ? -d0 / (d1 - d0) : 0;
  const t12 = d1 - d2 !== 0 ? -d1 / (d2 - d1) : 0;
  const t20 = d2 - d0 !== 0 ? -d2 / (d0 - d2) : 0;
  if (d0 >= 0 && d1 < 0 && d2 < 0) {
    const A = onPlane(tri.p0, tri.p1, t01);
    const B = onPlane(tri.p0, tri.p2, t20);
    pushTri(right, tri.p0, A, B, tri.n0, CUT_NORMAL_RIGHT, CUT_NORMAL_RIGHT);
    pushTri(left, tri.p1, tri.p2, B, tri.n1, tri.n2, CUT_NORMAL_LEFT);
    pushTri(left, tri.p1, B, A, tri.n1, CUT_NORMAL_LEFT, CUT_NORMAL_LEFT);
  } else if (d0 < 0 && d1 >= 0 && d2 < 0) {
    const A = onPlane(tri.p0, tri.p1, t01);
    const B = onPlane(tri.p1, tri.p2, t12);
    pushTri(right, tri.p1, A, B, tri.n1, CUT_NORMAL_RIGHT, CUT_NORMAL_RIGHT);
    pushTri(left, tri.p0, A, tri.p2, tri.n0, CUT_NORMAL_LEFT, tri.n2);
    pushTri(left, A, B, tri.p2, CUT_NORMAL_LEFT, CUT_NORMAL_LEFT, tri.n2);
  } else if (d0 < 0 && d1 < 0 && d2 >= 0) {
    const A = onPlane(tri.p1, tri.p2, t12);
    const B = onPlane(tri.p0, tri.p2, t20);
    pushTri(right, tri.p2, B, A, tri.n2, CUT_NORMAL_RIGHT, CUT_NORMAL_RIGHT);
    pushTri(left, tri.p0, tri.p1, A, tri.n0, tri.n1, CUT_NORMAL_LEFT);
    pushTri(left, tri.p0, A, B, tri.n0, CUT_NORMAL_LEFT, CUT_NORMAL_LEFT);
  } else if (d0 < 0 && d1 >= 0 && d2 >= 0) {
    const A = onPlane(tri.p0, tri.p1, t01);
    const B = onPlane(tri.p0, tri.p2, t20);
    pushTri(left, tri.p0, A, B, tri.n0, CUT_NORMAL_LEFT, CUT_NORMAL_LEFT);
    pushTri(right, tri.p1, B, A, tri.n1, CUT_NORMAL_RIGHT, CUT_NORMAL_RIGHT);
    pushTri(right, tri.p1, tri.p2, B, tri.n1, tri.n2, CUT_NORMAL_RIGHT);
  } else if (d0 >= 0 && d1 < 0 && d2 >= 0) {
    const A = onPlane(tri.p0, tri.p1, t01);
    const B = onPlane(tri.p1, tri.p2, t12);
    pushTri(left, tri.p1, A, B, tri.n1, CUT_NORMAL_LEFT, CUT_NORMAL_LEFT);
    pushTri(right, tri.p0, A, tri.p2, tri.n0, CUT_NORMAL_RIGHT, tri.n2);
    pushTri(right, A, B, tri.p2, CUT_NORMAL_RIGHT, CUT_NORMAL_RIGHT, tri.n2);
  } else if (d0 >= 0 && d1 >= 0 && d2 < 0) {
    const A = onPlane(tri.p1, tri.p2, t12);
    const B = onPlane(tri.p0, tri.p2, t20);
    pushTri(left, tri.p2, B, A, tri.n2, CUT_NORMAL_LEFT, CUT_NORMAL_LEFT);
    pushTri(right, tri.p0, tri.p1, A, tri.n0, tri.n1, CUT_NORMAL_RIGHT);
    pushTri(right, tri.p0, A, B, tri.n0, CUT_NORMAL_RIGHT, CUT_NORMAL_RIGHT);
  }
  return { left, right };
}

/**
 * @param {Array<{p0:THREE.Vector3,p1:THREE.Vector3,p2:THREE.Vector3,n0:THREE.Vector3,n1:THREE.Vector3,n2:THREE.Vector3}>} triangles
 * @param {THREE.Object3D} group
 * @param {number} fraction
 */
export function partitionTrianglesOneSlice(triangles, group, fraction) {
  group.updateMatrixWorld(true);
  const invWorld = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const matrixWorld = group.matrixWorld;
  const toWorld = (p) => p.clone().applyMatrix4(matrixWorld);
  const _triLocal = {
    p0: new THREE.Vector3(),
    p1: new THREE.Vector3(),
    p2: new THREE.Vector3(),
    n0: new THREE.Vector3(),
    n1: new THREE.Vector3(),
    n2: new THREE.Vector3(),
  };
  let minX = Infinity;
  let maxX = -Infinity;
  const localTris = [];
  for (const tri of triangles) {
    _triLocal.p0.copy(tri.p0).applyMatrix4(invWorld);
    _triLocal.p1.copy(tri.p1).applyMatrix4(invWorld);
    _triLocal.p2.copy(tri.p2).applyMatrix4(invWorld);
    _triLocal.n0.copy(tri.n0).transformDirection(invWorld);
    _triLocal.n1.copy(tri.n1).transformDirection(invWorld);
    _triLocal.n2.copy(tri.n2).transformDirection(invWorld);
    const x = (_triLocal.p0.x + _triLocal.p1.x + _triLocal.p2.x) / 3;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    localTris.push({
      p0: _triLocal.p0.clone(),
      p1: _triLocal.p1.clone(),
      p2: _triLocal.p2.clone(),
      n0: _triLocal.n0.clone(),
      n1: _triLocal.n1.clone(),
      n2: _triLocal.n2.clone(),
    });
  }
  const range = maxX - minX;
  if (range < 1e-6) {
    return {
      remaining: triangles,
      fragments: [],
      cutX: null,
      fromLeft: false,
    };
  }
  const fromLeft = Math.random() < 0.5;
  const cutXLocal = fromLeft
    ? minX + range * fraction
    : maxX - range * fraction;
  const allLeft = [];
  const allRight = [];
  for (const tri of localTris) {
    const { left, right } = clipTriangleByPlane(tri, cutXLocal);
    allLeft.push(...left);
    allRight.push(...right);
  }
  const toWorldTri = (t) => ({
    p0: toWorld(t.p0),
    p1: toWorld(t.p1),
    p2: toWorld(t.p2),
    n0: t.n0.clone().transformDirection(matrixWorld),
    n1: t.n1.clone().transformDirection(matrixWorld),
    n2: t.n2.clone().transformDirection(matrixWorld),
  });
  const toFly = (fromLeft ? allLeft : allRight).map(toWorldTri);
  const remaining = (fromLeft ? allRight : allLeft).map(toWorldTri);
  if (toFly.length === 0) {
    return {
      remaining: triangles,
      fragments: [],
      cutX: null,
      fromLeft: false,
    };
  }
  return { remaining, fragments: [toFly], cutX: null, fromLeft };
}

/** @param {Array<{p0:THREE.Vector3,p1:THREE.Vector3,p2:THREE.Vector3,n0:THREE.Vector3,n1:THREE.Vector3,n2:THREE.Vector3}>} triangles */
export function trianglesToGeometry(triangles, centerWorld) {
  if (triangles.length === 0) return null;
  const positions = [];
  const normals = [];
  for (const tri of triangles) {
    positions.push(
      tri.p0.x - centerWorld.x,
      tri.p0.y - centerWorld.y,
      tri.p0.z - centerWorld.z,
      tri.p1.x - centerWorld.x,
      tri.p1.y - centerWorld.y,
      tri.p1.z - centerWorld.z,
      tri.p2.x - centerWorld.x,
      tri.p2.y - centerWorld.y,
      tri.p2.z - centerWorld.z,
    );
    normals.push(
      tri.n0.x,
      tri.n0.y,
      tri.n0.z,
      tri.n1.x,
      tri.n1.y,
      tri.n1.z,
      tri.n2.x,
      tri.n2.y,
      tri.n2.z,
    );
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geom.computeBoundingSphere();
  return geom;
}

/** @param {THREE.Object3D} object @param {THREE.Vector3} origin */
export function xzDistanceToObject(object, origin) {
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) return Infinity;
  const cx = THREE.MathUtils.clamp(origin.x, box.min.x, box.max.x);
  const cz = THREE.MathUtils.clamp(origin.z, box.min.z, box.max.z);
  const dx = origin.x - cx;
  const dz = origin.z - cz;
  return Math.sqrt(dx * dx + dz * dz);
}

/**
 * @param {Array<{p0:THREE.Vector3,p1:THREE.Vector3,p2:THREE.Vector3,n0:THREE.Vector3,n1:THREE.Vector3,n2:THREE.Vector3}>} triangles
 * @param {number} pieceCount
 */
export function splitTrianglesIntoPieces(triangles, pieceCount) {
  if (pieceCount <= 1 || triangles.length < pieceCount * 3) {
    return [triangles];
  }
  const box = new THREE.Box3();
  for (const t of triangles) {
    box.expandByPoint(t.p0);
    box.expandByPoint(t.p1);
    box.expandByPoint(t.p2);
  }
  const size = new THREE.Vector3();
  box.getSize(size);
  /** @type {"x"|"y"|"z"} */
  const axis =
    size.x >= size.y && size.x >= size.z ? "x" : size.y >= size.z ? "y" : "z";
  const withCentroid = triangles.map((t) => ({
    t,
    c: (t.p0[axis] + t.p1[axis] + t.p2[axis]) / 3,
  }));
  withCentroid.sort((a, b) => a.c - b.c);
  const groups = [];
  const per = Math.ceil(withCentroid.length / pieceCount);
  for (let i = 0; i < pieceCount; i++) {
    const start = i * per;
    const end = Math.min(withCentroid.length, (i + 1) * per);
    if (end > start) {
      groups.push(withCentroid.slice(start, end).map((o) => o.t));
    }
  }
  return groups;
}
