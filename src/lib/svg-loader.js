/**
 * SVG 로더 및 파서
 * SVG URL을 다운로드하고 Three.js Shape로 변환
 */

import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";
import * as THREE from "three";

/**
 * SVG URL에서 SVG 문자열 다운로드
 * @param {string} url
 * @returns {Promise<string>}
 */
export async function fetchSVG(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch SVG: ${response.statusText}`);
  }
  return response.text();
}

/**
 * SVG 문자열을 Three.js Shape로 변환
 * @param {string} svgString
 * @returns {THREE.Shape[]}
 */
/**
 * SVG Y축은 보통 아래가 +. Three.js는 위가 +. Y 뒤집어서 똑바로 읽히게.
 */
export function parseSVGToShapes(svgString) {
  const loader = new SVGLoader();
  const svgData = loader.parse(svgString);
  const shapes = [];

  svgData.paths.forEach((path) => {
    path.subPaths.forEach((subPath) => {
      const points = subPath.getPoints();
      const flipped = points.map((p) => new THREE.Vector2(p.x, -p.y));
      const shape = new THREE.Shape(flipped);
      shapes.push(shape);
    });
  });

  return shapes;
}

/**
 * SVG → Shapes for ExtrudeGeometry (holes / compound paths via ShapePath.toShapes).
 * Shapes keep SVGLoader curves (no getPoints polygonization) so extrusion stays smooth;
 * Stage3 flips Y on the extruded geometry after scaling.
 * @param {string} svgString
 * @returns {THREE.Shape[]}
 */
/** @param {object} style */
function hasRenderableFill(style) {
  if (!style || style.fill === undefined || style.fill === false) return false;
  const s = String(style.fill).toLowerCase().trim();
  return s !== "none" && s !== "";
}

/**
 * ExtrudeGeometry용: **fill이 있는 path만** `toShapes`로 Shape를 만든다.
 * 태블릿 Edge가 `data-handwriting-extrude="true"` 그룹에 3D 전용 닫힌 fill을 넣는 경우,
 * 그 그룹 안의 path/circle만 Extrude에 사용한다(래스터용 stroke-only와 분리).
 * 마커가 없는 구 SVG는 기존처럼 fill이 있는 모든 path를 사용한다.
 *
 * @param {string} svgString
 * @returns {THREE.Shape[]}
 */
export function parseSVGToExtrudeShapesForVolume(svgString) {
  const strictExtrude = svgString.includes('data-handwriting-extrude="true"');
  const loader = new SVGLoader();
  const svgData = loader.parse(svgString);
  /** @type {THREE.Shape[]} */
  const out = [];
  for (const path of svgData.paths) {
    const style = path.userData?.style ?? {};
    if (!hasRenderableFill(style)) continue;
    if (strictExtrude) {
      const node = path.userData?.node;
      if (
        !node ||
        typeof node.closest !== "function" ||
        !node.closest('[data-handwriting-extrude="true"]')
      ) {
        continue;
      }
    }
    const pathShapes = path.toShapes(false);
    for (const sh of pathShapes) {
      out.push(sh);
    }
  }
  return out;
}

/**
 * @deprecated {@link parseSVGToExtrudeShapesForVolume} 사용 권장.
 */
export function parseSVGToExtrudeShapes(svgString) {
  return parseSVGToExtrudeShapesForVolume(svgString);
}

/**
 * 2D Shape를 중심 기준으로 확대해 획 두께를 키운 새 Shape 배열 반환.
 * SVG에서 얇게 그려진 선도 두껍게 보이게 할 수 있음.
 * @param {THREE.Shape[]} shapes
 * @param {number} [factor=1.25] 확대 배율 (1보다 크면 획이 두꺼워짐)
 * @returns {THREE.Shape[]}
 */
export function expandShapesStroke(shapes, factor = 1.25) {
  if (factor <= 1.0) return shapes;

  return shapes.map((shape) => {
    const points = shape.getPoints(12);
    if (!points || points.length < 3) return shape;

    const center = new THREE.Vector2(0, 0);
    points.forEach((p) => center.add(p));
    center.divideScalar(points.length);

    const scaled = points.map((p) => {
      const v = p.clone().sub(center).multiplyScalar(factor).add(center);
      return new THREE.Vector2(v.x, v.y);
    });
    return new THREE.Shape(scaled);
  });
}

/**
 * SVG URL을 다운로드하고 Shape 배열로 변환
 * @param {string} url
 * @returns {Promise<THREE.Shape[]>}
 */
export async function loadSVGShapes(url) {
  const svgString = await fetchSVG(url);
  return parseSVGToShapes(svgString);
}
