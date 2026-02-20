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
export function parseSVGToShapes(svgString) {
  const loader = new SVGLoader();
  const svgData = loader.parse(svgString);
  const shapes = [];

  svgData.paths.forEach((path) => {
    path.subPaths.forEach((subPath) => {
      const shape = new THREE.Shape(subPath.getPoints());
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
