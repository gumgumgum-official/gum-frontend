/**
 * 공통 에셋 로더 (GLB/GLTF)
 * - 지오메트리: DRACO 및 KHR_mesh_quantization / EXT_meshopt_compression 지원
 * - 텍스처: KTX2 (KHR_texture_basisu) 지원
 * - 책임: 로드만 담당. scene.add / position 등은 호출부에서 처리
 *
 * KTX2Loader.detectSupport는 WebGLRenderer 가 필요하므로,
 * `attachRenderer(renderer)` 를 한 번 호출해 GPU 포맷 지원을 알려줘야 한다.
 */

import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

const DEFAULT_DRACO_PATH = "/draco/";
const DEFAULT_BASIS_PATH = "/basis/";

/**
 * GLB/GLTF 전용 로더 생성 (DRACO/KTX2/Meshopt 지원, 싱글톤 권장)
 * @param {Object} options
 * @param {string} [options.dracoPath='/draco/'] - DRACO 디코더 경로 (public 기준)
 * @param {string} [options.basisPath='/basis/'] - Basis(KTX2) 트랜스코더 경로
 * @returns {{ load, loadAsync, preloadDecoders, attachRenderer }}
 */
export function createGLBLoader(options = {}) {
  const dracoPath = options.dracoPath ?? DEFAULT_DRACO_PATH;
  const basisPath = options.basisPath ?? DEFAULT_BASIS_PATH;

  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath(dracoPath);

  const ktx2Loader = new KTX2Loader();
  ktx2Loader.setTranscoderPath(basisPath);

  const gltfLoader = new GLTFLoader();
  gltfLoader.setDRACOLoader(dracoLoader);
  gltfLoader.setKTX2Loader(ktx2Loader);
  gltfLoader.setMeshoptDecoder(MeshoptDecoder);

  let rendererAttached = false;

  return {
    /**
     * KTX2Loader에 GPU 포맷 지원 여부를 알려준다 (detectSupport).
     * 첫 렌더러 한 번만 필요. 이후 호출은 no-op.
     * @param {import("three").WebGLRenderer} renderer
     */
    attachRenderer(renderer) {
      if (rendererAttached || !renderer) return this;
      ktx2Loader.detectSupport(renderer);
      rendererAttached = true;
      return this;
    },
    /** Draco WASM/JS 워커를 미리 올려 이후 첫 메시 디코드 지연을 줄인다. */
    preloadDecoders() {
      dracoLoader.preload();
      return this;
    },
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
