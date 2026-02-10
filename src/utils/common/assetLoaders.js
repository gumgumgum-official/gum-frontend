/**
 * 공통 에셋 로더 (GLB/GLTF, 추후 KTX 등 확장)
 * - GLB: DRACO 압축 지원
 * - 책임: 로드만 담당. scene.add / position 등은 호출부에서 처리
 */

import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";

const DEFAULT_DRACO_PATH = "/draco/";

/**
 * GLB/GLTF 전용 로더 생성 (DRACO 지원, 싱글톤 권장)
 * @param {Object} options
 * @param {string} [options.dracoPath='/draco/'] - DRACO 디코더 경로 (public 기준)
 * @returns {{ load, loadAsync }}
 */
export function createGLBLoader(options = {}) {
  const dracoPath = options.dracoPath ?? DEFAULT_DRACO_PATH;

  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath(dracoPath);

  const gltfLoader = new GLTFLoader();
  gltfLoader.setDRACOLoader(dracoLoader);

  return {
    /**
     * GLB/GLTF 로드 (콜백)
     * @param {string} path - URL (예: '/models/xxx.glb')
     * @param {Object} callbacks
     * @param {(gltf: import('three/examples/jsm/loaders/GLTFLoader').GLTF) => void} callbacks.onLoad
     * @param {(xhr: ProgressEvent) => void} [callbacks.onProgress]
     * @param {(err: Error) => void} [callbacks.onError]
     */
    load(path, { onLoad, onProgress, onError }) {
      gltfLoader.load(
        path,
        (gltf) => onLoad(gltf),
        (xhr) => onProgress?.(xhr),
        (err) => onError?.(err instanceof Error ? err : new Error(String(err))),
      );
    },

    /**
     * GLB/GLTF 로드 (Promise)
     * @param {string} path
     * @returns {Promise<import('three/examples/jsm/loaders/GLTFLoader').GLTF>}
     */
    loadAsync(path) {
      return new Promise((resolve, reject) => {
        gltfLoader.load(path, resolve, undefined, reject);
      });
    },
  };
}

/** 앱 전역에서 재사용할 GLB 로더 인스턴스 */
let _sharedGLBLoader = null;

/**
 * 공유 GLB 로더 (한 번만 생성)
 * @param {Object} [options] - createGLBLoader 옵션
 * @returns {ReturnType<createGLBLoader>}
 */
export function getGLBLoader(options) {
  if (!_sharedGLBLoader) {
    _sharedGLBLoader = createGLBLoader(options);
  }
  return _sharedGLBLoader;
}

// 추후 KTX2 등 추가 시 예시:
// export function createKTX2Loader(renderer) { ... }
