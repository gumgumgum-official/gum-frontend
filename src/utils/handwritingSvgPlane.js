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

/* global Worker */

import * as THREE from "three";
import { fetchSVG } from "../lib/svg-loader.js";

const MAX_TEXTURE_PIXEL = 2048;
let sharedRasterWorker = null;
const pendingRasterRequests = new Map();

function rejectAllWorkerRequests(error) {
  for (const req of pendingRasterRequests.values()) {
    req.reject(error);
  }
  pendingRasterRequests.clear();
}

function resetSharedWorkerWithError(message) {
  const err = new Error(message);
  rejectAllWorkerRequests(err);
  if (sharedRasterWorker) {
    try {
      sharedRasterWorker.terminate();
    } catch {
      // Ignore terminate errors while resetting worker state.
    }
  }
  sharedRasterWorker = null;
}

function getSharedRasterWorker() {
  if (sharedRasterWorker) return sharedRasterWorker;
  const worker = new Worker(
    new URL("../workers/svgRasterWorker.js", import.meta.url),
    { type: "module" },
  );
  worker.addEventListener("message", (event) => {
    const data = event.data;
    const id = data?.id;
    if (!id) return;
    const req = pendingRasterRequests.get(id);
    if (!req) return;
    pendingRasterRequests.delete(id);
    if (data.error) req.reject(new Error(data.error));
    else req.resolve(data.bitmap ?? null);
  });
  worker.addEventListener("error", () => {
    resetSharedWorkerWithError("SVG raster worker crashed");
  });
  worker.addEventListener("messageerror", () => {
    resetSharedWorkerWithError("SVG raster worker message error");
  });
  sharedRasterWorker = worker;
  return worker;
}

function rasterizeViaSharedWorker(svgText, width, height) {
  return new Promise((resolve, reject) => {
    const worker = getSharedRasterWorker();
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    pendingRasterRequests.set(id, { resolve, reject });
    try {
      worker.postMessage({ id, svgText, width, height });
    } catch (err) {
      pendingRasterRequests.delete(id);
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

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
  const hasParsedSvgSize = fallbackW > 0 && fallbackH > 0;

  const perfEnabled =
    typeof window !== "undefined" &&
    (window.STAGE2_PROFILE || localStorage.getItem("STAGE2_PROFILE") === "1");
  const mark = () => (perfEnabled ? window.performance.now() : 0);
  const logDuration = (label, start) => {
    if (!perfEnabled) return;
    const end = window.performance.now();
    console.log("[Stage2Perf]", label, "ms=", (end - start).toFixed(1));
  };
  let srcW = fallbackW;
  let srcH = fallbackH;
  let img = null;
  const decodeImage = async () => {
    if (img) return img;
    const blob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
    const objUrl = URL.createObjectURL(blob);
    const decoded = new Image();
    try {
      const tDecodeStart = mark();
      await new Promise((resolve, reject) => {
        decoded.onload = resolve;
        decoded.onerror = () => reject(new Error("SVG image decode failed"));
        decoded.src = objUrl;
      });
      logDuration("svg:imageDecode", tDecodeStart);
      img = decoded;
      return decoded;
    } finally {
      URL.revokeObjectURL(objUrl);
    }
  };

  if (!hasParsedSvgSize) {
    const decoded = await decodeImage();
    srcW = decoded.naturalWidth || fallbackW;
    srcH = decoded.naturalHeight || fallbackH;
  }
  if (srcW <= 0 || srcH <= 0) {
    const decoded = await decodeImage();
    srcW = decoded.naturalWidth || fallbackW;
    srcH = decoded.naturalHeight || fallbackH;
  }

  let cw = srcW;
  let ch = srcH;
  if (cw > MAX_TEXTURE_PIXEL || ch > MAX_TEXTURE_PIXEL) {
    const r = Math.min(MAX_TEXTURE_PIXEL / cw, MAX_TEXTURE_PIXEL / ch);
    cw = Math.max(2, Math.round(cw * r));
    ch = Math.max(2, Math.round(ch * r));
  }

  const tCanvasStart = mark();
  let bitmap = null;
  if (
    typeof window !== "undefined" &&
    "OffscreenCanvas" in window &&
    "Worker" in window
  ) {
    try {
      const workerStart = mark();
      bitmap = await rasterizeViaSharedWorker(svgText, cw, ch);
      logDuration("svg:workerRaster", workerStart);
    } catch {
      // 워커 실패 시 아래 캔버스 경로로 폴백
      bitmap = null;
    }
  }

  let texture;
  if (bitmap) {
    srcW = bitmap.width || srcW;
    srcH = bitmap.height || srcH;
    texture = new THREE.CanvasTexture(bitmap);
  } else {
    const decoded = await decodeImage();
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(2, cw);
    canvas.height = Math.max(2, ch);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2d context unavailable");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(decoded, 0, 0, canvas.width, canvas.height);
    // SVG 패스 경계의 서브픽셀 투명 갭을 채워 TV(DPR=1)에서 금간 현상 제거.
    // destination-over: 이미 그려진 불투명 픽셀은 유지하고 투명 픽셀 위치만 뒤에서 채운다.
    ctx.globalCompositeOperation = "destination-over";
    ctx.drawImage(decoded, -1, -1, canvas.width + 2, canvas.height + 2);
    ctx.globalCompositeOperation = "source-over";
    logDuration("svg:canvasDraw", tCanvasStart);

    texture = new THREE.CanvasTexture(canvas);
  }
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
