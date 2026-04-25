/**
 * Handwriting SVG → textured plane (no Extrude). Used by Stage2 (falling) & Stage3 (shatter).
 *
 * Why flat raster instead of ExtrudeGeometry?
 * - svg-loader uses per-subPath Shapes, not SVGLoader.createShapes() → holes / compound paths break.
 * - expandShapesStroke() radially warps outlines → differs from on-screen SVG.
 * - Reference “BRUN” look needs thick extrusion + soft bevel + ortho/isometric camera + matte
 *   shading + contact shadows — separate from “match the PNG preview of the SVG”.
 *
 * @deprecated Planned removal — delete this file and strip Stage2/Stage3 call sites together.
 */

import * as THREE from "three";
import { fetchSVG } from "../lib/svg-loader.js";

const MAX_TEXTURE_PIXEL = 2048;

/**
 * @param {string} svgText
 * @returns {Promise<{ texture: THREE.CanvasTexture; widthPx: number; heightPx: number }>}
 */
export async function rasterizeSvgToTexture(svgText) {
  const viewBoxMatch = svgText.match(/viewBox\s*=\s*["']([-0-9eE.\s,]+)["']/i);
  let fallbackW = 512;
  let fallbackH = 512;
  if (viewBoxMatch) {
    const parts = viewBoxMatch[1]
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    if (parts.length >= 4 && parts[2] > 1e-6 && parts[3] > 1e-6) {
      fallbackW = parts[2];
      fallbackH = parts[3];
    }
  }
  const widthMatch = svgText.match(/\bwidth\s*=\s*["']([^"']+)["']/i);
  const heightMatch = svgText.match(/\bheight\s*=\s*["']([^"']+)["']/i);
  if (widthMatch && heightMatch) {
    const pw = parseFloat(widthMatch[1]);
    const ph = parseFloat(heightMatch[1]);
    if (Number.isFinite(pw) && pw > 0 && Number.isFinite(ph) && ph > 0) {
      fallbackW = pw;
      fallbackH = ph;
    }
  }

  const blob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
  const objUrl = URL.createObjectURL(blob);
  const img = new Image();
  try {
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error("SVG image decode failed"));
      img.src = objUrl;
    });
  } finally {
    URL.revokeObjectURL(objUrl);
  }

  let srcW = img.naturalWidth || fallbackW;
  let srcH = img.naturalHeight || fallbackH;
  if (srcW <= 0 || srcH <= 0) {
    srcW = fallbackW;
    srcH = fallbackH;
  }

  let cw = srcW;
  let ch = srcH;
  if (cw > MAX_TEXTURE_PIXEL || ch > MAX_TEXTURE_PIXEL) {
    const r = Math.min(MAX_TEXTURE_PIXEL / cw, MAX_TEXTURE_PIXEL / ch);
    cw = Math.max(2, Math.round(cw * r));
    ch = Math.max(2, Math.round(ch * r));
  }

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(2, cw);
  canvas.height = Math.max(2, ch);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  // SVG 패스 경계의 서브픽셀 투명 갭을 채워 TV(DPR=1)에서 금간 현상 제거.
  // destination-over: 이미 그려진 불투명 픽셀은 유지하고 투명 픽셀 위치만 뒤에서 채운다.
  ctx.globalCompositeOperation = "destination-over";
  ctx.drawImage(img, -1, -1, canvas.width + 2, canvas.height + 2);
  ctx.globalCompositeOperation = "source-over";

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;

  return {
    texture,
    widthPx: srcW,
    heightPx: srcH,
  };
}

/**
 * @param {string} svgPublicUrl
 * @param {{ targetWorldHeight: number }} options
 * @returns {Promise<{ group: THREE.Group; planeW: number; planeH: number } | null>}
 */
export async function createHandwritingSvgPlaneGroup(svgPublicUrl, options) {
  const { targetWorldHeight } = options;
  if (!svgPublicUrl || typeof svgPublicUrl !== "string") return null;
  if (!Number.isFinite(targetWorldHeight) || targetWorldHeight <= 0)
    return null;

  const svgText = await fetchSVG(svgPublicUrl);
  const { texture, widthPx, heightPx } = await rasterizeSvgToTexture(svgText);
  if (widthPx <= 1e-6 || heightPx <= 1e-6) {
    texture.dispose();
    return null;
  }

  const aspect = widthPx / heightPx;
  const planeH = targetWorldHeight;
  const planeW = targetWorldHeight * aspect;

  const geometry = new THREE.PlaneGeometry(planeW, planeH);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    alphaTest: 0.01,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = false;
  mesh.receiveShadow = false;

  const group = new THREE.Group();
  group.add(mesh);
  group.userData.isHandwritingSvgPlane = true;

  return { group, planeW, planeH };
}

/**
 * @param {THREE.Object3D} root
 */
export function disposeHandwritingSvgPlaneGroup(root) {
  root.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      const mats = Array.isArray(child.material)
        ? child.material
        : [child.material];
      for (const m of mats) {
        if (m.map) m.map.dispose();
        m.dispose();
      }
    }
  });
}
