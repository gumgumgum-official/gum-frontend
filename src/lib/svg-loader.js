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
