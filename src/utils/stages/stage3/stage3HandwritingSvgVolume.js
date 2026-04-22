/**
 * Stage3 only: handwriting SVG → group of extruded meshes (one per SVG shape) with solid matte material.
 *
 * Shape별 Mesh로 분리해 두면 collectTrianglesFromGroup이 meshIndex를 shape별로 할당하므로,
 * 후속 로직이 자음/모음(획) 단위로 구분된 정보를 필요로 할 때 활용할 수 있다.
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

  /** @type {THREE.BufferGeometry[]} */
  const geoms = [];
  try {
    const svgText = await fetchSVG(svgPublicUrl);
    const shapes = parseSVGToExtrudeShapesForVolume(svgText);
    if (shapes.length === 0) return null;

    const { width: shapeWidth, height: shapeHeight } =
      shapesPlaneBounds(shapes);
    const depth = shapeHeight * depthRatio;
    const scale = targetWorldHeight / shapeHeight;

    const extrudeSettings = {
      depth,
      curveSegments: 24,
      bevelEnabled: false,
      steps: 1,
    };

    for (const shape of shapes) {
      const g = new THREE.ExtrudeGeometry(shape, extrudeSettings);
      g.scale(scale, scale, scale);
      g.scale(1, -1, 1);
      geoms.push(g);
    }

    // 모든 shape 공통 변환: union bbox 기준으로 중앙/바닥 정렬
    const unionBox = new THREE.Box3();
    for (const g of geoms) {
      g.computeBoundingBox();
      if (g.boundingBox) unionBox.union(g.boundingBox);
    }
    const cx = (unionBox.min.x + unionBox.max.x) * 0.5;
    const cz = (unionBox.min.z + unionBox.max.z) * 0.5;
    const ty = -unionBox.min.y;
    for (const g of geoms) {
      g.translate(-cx, ty, -cz);
      g.computeVertexNormals();
    }

    const material = new THREE.MeshStandardMaterial({
      color: LETTER_COLOR,
      roughness: 0.85,
      metalness: 0.05,
      side: THREE.DoubleSide,
    });

    const group = new THREE.Group();
    for (const g of geoms) {
      const mesh = new THREE.Mesh(g, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    geoms.length = 0;
    group.userData.isHandwritingSvgPlane = true;
    group.userData.isHandwritingSvgVolume = true;

    const unionWidth = Math.max(unionBox.max.x - unionBox.min.x, 1e-6);
    const unionHeight = Math.max(unionBox.max.y - unionBox.min.y, 1e-6);
    const aspect =
      unionWidth > 1e-6 && unionHeight > 1e-6
        ? unionWidth / unionHeight
        : shapeWidth / shapeHeight;
    const planeH = targetWorldHeight;
    const planeW = targetWorldHeight * aspect;

    return { group, planeW, planeH };
  } catch {
    for (const g of geoms) g.dispose();
    return null;
  }
}
