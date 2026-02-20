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
 * SVG URL을 다운로드하고 Shape 배열로 변환
 * @param {string} url
 * @returns {Promise<THREE.Shape[]>}
 */
export async function loadSVGShapes(url) {
  const svgString = await fetchSVG(url);
  return parseSVGToShapes(svgString);
}
