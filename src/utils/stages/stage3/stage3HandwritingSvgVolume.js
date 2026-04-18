/**
 * Stage3 only: handwriting SVG → single extruded mesh (caps textured, sides matte).
 * Keeps one Mesh so Stage3 slice/shatter logic uses partitionTrianglesOneSlice.
 */

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { fetchSVG, parseSVGToExtrudeShapes } from "../../../lib/svg-loader.js";
import { rasterizeSvgToTexture } from "../../handwritingSvgPlane.js";

const DEFAULT_DEPTH_RATIO = 0.14;
const CAP_NORMAL_Z_THRESH = 0.78;

/**
 * @param {THREE.BufferGeometry} geometry
 * @returns {THREE.BufferGeometry | null}
 */
function splitCapsAndSidesGeometry(geometry) {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (!box) return null;
  const rx = Math.max(box.max.x - box.min.x, 1e-6);
  const ry = Math.max(box.max.y - box.min.y, 1e-6);

  const pos = geometry.attributes.position;
  const norm = geometry.attributes.normal;
  const uvAttr = geometry.attributes.uv;
  if (!pos || !norm || !uvAttr) return null;

  const capPos = [];
  const capNorm = [];
  const capUv = [];
  const sidePos = [];
  const sideNorm = [];
  const sideUv = [];

  const p0 = new THREE.Vector3();
  const p1 = new THREE.Vector3();
  const p2 = new THREE.Vector3();
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const fn = new THREE.Vector3();

  for (let i = 0; i < pos.count; i += 3) {
    p0.fromBufferAttribute(pos, i);
    p1.fromBufferAttribute(pos, i + 1);
    p2.fromBufferAttribute(pos, i + 2);
    e1.subVectors(p1, p0);
    e2.subVectors(p2, p0);
    fn.crossVectors(e1, e2).normalize();

    const isCap = Math.abs(fn.z) > CAP_NORMAL_Z_THRESH;
    const dstPos = isCap ? capPos : sidePos;
    const dstNorm = isCap ? capNorm : sideNorm;
    const dstUv = isCap ? capUv : sideUv;

    for (let k = 0; k < 3; k++) {
      const idx = i + k;
      dstPos.push(pos.getX(idx), pos.getY(idx), pos.getZ(idx));
      dstNorm.push(norm.getX(idx), norm.getY(idx), norm.getZ(idx));
      if (isCap) {
        const x = pos.getX(idx);
        const y = pos.getY(idx);
        const u = (x - box.min.x) / rx;
        const v = 1 - (y - box.min.y) / ry;
        dstUv.push(u, v);
      } else {
        dstUv.push(uvAttr.getX(idx), uvAttr.getY(idx));
      }
    }
  }

  if (capPos.length === 0 || sidePos.length === 0) return null;

  const capGeom = new THREE.BufferGeometry();
  capGeom.setAttribute("position", new THREE.Float32BufferAttribute(capPos, 3));
  capGeom.setAttribute("normal", new THREE.Float32BufferAttribute(capNorm, 3));
  capGeom.setAttribute("uv", new THREE.Float32BufferAttribute(capUv, 2));

  const sideGeom = new THREE.BufferGeometry();
  sideGeom.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(sidePos, 3),
  );
  sideGeom.setAttribute(
    "normal",
    new THREE.Float32BufferAttribute(sideNorm, 3),
  );
  sideGeom.setAttribute("uv", new THREE.Float32BufferAttribute(sideUv, 2));

  const merged = mergeGeometries([capGeom, sideGeom], { useGroups: true });
  capGeom.dispose();
  sideGeom.dispose();
  return merged ?? null;
}

/**
 * @param {THREE.Shape[]} shapes
 * @returns {{ height: number; box2: THREE.Box2 }}
 */
function shapesPlaneBounds(shapes) {
  const box2 = new THREE.Box2();
  const div = 48;
  for (const sh of shapes) {
    const sp = sh.extractPoints(div);
    for (const p of sp.shape) box2.expandByPoint(p);
    for (const hole of sp.holes) {
      for (const p of hole) box2.expandByPoint(p);
    }
  }
  const size = box2.getSize(new THREE.Vector2());
  return { height: Math.max(size.y, 1e-6), box2 };
}

/**
 * @param {string} svgPublicUrl
 * @param {{ targetWorldHeight: number; depthRatio?: number }} options
 * @returns {Promise<{ group: THREE.Group; planeW: number; planeH: number } | null>}
 */
export async function createHandwritingSvgVolumeGroup(svgPublicUrl, options) {
  const { targetWorldHeight, depthRatio = DEFAULT_DEPTH_RATIO } = options;
  if (!svgPublicUrl || typeof svgPublicUrl !== "string") return null;
  if (!Number.isFinite(targetWorldHeight) || targetWorldHeight <= 0)
    return null;

  let texture = null;
  /** @type {THREE.BufferGeometry | null} */
  let mergedGeom = null;
  try {
    const svgText = await fetchSVG(svgPublicUrl);
    const shapes = parseSVGToExtrudeShapes(svgText);
    if (shapes.length === 0) return null;

    const { height: shapeHeight } = shapesPlaneBounds(shapes);
    const depth = shapeHeight * depthRatio;
    const bevelThickness = Math.min(depth * 0.25, shapeHeight * 0.04);
    const bevelSize = Math.min(depth * 0.2, shapeHeight * 0.035);

    const extrudeSettings = {
      depth,
      curveSegments: 32,
      bevelEnabled: true,
      bevelThickness,
      bevelSize,
      bevelOffset: 0,
      bevelSegments: 5,
      steps: 1,
    };

    const geometry = new THREE.ExtrudeGeometry(shapes, extrudeSettings);
    const scale = targetWorldHeight / shapeHeight;
    geometry.scale(scale, scale, scale);
    geometry.scale(1, -1, 1);

    geometry.computeBoundingBox();
    const bb = geometry.boundingBox;
    if (bb) {
      const cx = (bb.min.x + bb.max.x) * 0.5;
      const cz = (bb.min.z + bb.max.z) * 0.5;
      geometry.translate(-cx, -bb.min.y, -cz);
    }

    geometry.computeVertexNormals();

    mergedGeom = splitCapsAndSidesGeometry(geometry);
    geometry.dispose();
    if (!mergedGeom) return null;
    mergedGeom.computeVertexNormals();

    const raster = await rasterizeSvgToTexture(svgText);
    texture = raster.texture;
    const { widthPx, heightPx } = raster;
    if (widthPx <= 1e-6 || heightPx <= 1e-6) {
      texture.dispose();
      mergedGeom.dispose();
      mergedGeom = null;
      return null;
    }

    const capMaterial = new THREE.MeshStandardMaterial({
      map: texture,
      transparent: true,
      roughness: 0.72,
      metalness: 0.06,
      side: THREE.DoubleSide,
      depthWrite: true,
    });
    const sideMaterial = new THREE.MeshStandardMaterial({
      color: 0x3a3a3a,
      roughness: 0.9,
      metalness: 0.08,
      side: THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(mergedGeom, [capMaterial, sideMaterial]);
    mergedGeom = null;
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    const group = new THREE.Group();
    group.add(mesh);
    group.userData.isHandwritingSvgPlane = true;
    group.userData.isHandwritingSvgVolume = true;

    const aspect = widthPx / heightPx;
    const planeH = targetWorldHeight;
    const planeW = targetWorldHeight * aspect;

    return { group, planeW, planeH };
  } catch {
    if (texture) texture.dispose();
    if (mergedGeom) mergedGeom.dispose();
    return null;
  }
}
