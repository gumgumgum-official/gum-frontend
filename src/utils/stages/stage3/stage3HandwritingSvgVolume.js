/**
 * Stage3 only: handwriting SVG → single extruded mesh with solid matte material.
 *
 * ExtrudeGeometry는 **닫힌 fill** Shape에만 안정적이다. 태블릿/Edge 손글씨 SVG처럼
 * `fill="none"` + `stroke` 만 있는 경우에는 볼륨을 만들지 않고 `null`을 반환한다.
 * Stage3는 그때 `createHandwritingSvgPlaneGroup`으로 폴백해 글자가 깨지지 않게 한다.
 */

import * as THREE from "three";
import {
  fetchSVG,
  parseSVGToExtrudeShapesForVolume,
} from "../../../lib/svg-loader.js";

const DEFAULT_DEPTH_RATIO = 0.14;
const LETTER_COLOR = 0x2a2a2a;

/**
 * @param {THREE.Shape[]} shapes
 * @returns {{ width: number; height: number; box2: THREE.Box2 }}
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
  return {
    width: Math.max(size.x, 1e-6),
    height: Math.max(size.y, 1e-6),
    box2,
  };
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

  /** @type {THREE.BufferGeometry | null} */
  let geometry = null;
  try {
    const svgText = await fetchSVG(svgPublicUrl);
    const shapes = parseSVGToExtrudeShapesForVolume(svgText);
    if (shapes.length === 0) return null;

    const { width: shapeWidth, height: shapeHeight } =
      shapesPlaneBounds(shapes);
    const depth = shapeHeight * depthRatio;

    geometry = new THREE.ExtrudeGeometry(shapes, {
      depth,
      curveSegments: 24,
      bevelEnabled: false,
      steps: 1,
    });
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

    const material = new THREE.MeshStandardMaterial({
      color: LETTER_COLOR,
      roughness: 0.85,
      metalness: 0.05,
      side: THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(geometry, material);
    geometry = null;
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    const group = new THREE.Group();
    group.add(mesh);
    group.userData.isHandwritingSvgPlane = true;
    group.userData.isHandwritingSvgVolume = true;

    const aspect = shapeWidth / shapeHeight;
    const planeH = targetWorldHeight;
    const planeW = targetWorldHeight * aspect;

    return { group, planeW, planeH };
  } catch {
    if (geometry) geometry.dispose();
    return null;
  }
}
