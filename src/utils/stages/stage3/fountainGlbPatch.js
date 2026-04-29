/* global TextDecoder, TextEncoder */
/**
 * TODO: scene_with_fountain_v6.glb 재익스포트 후 이 파일과 사용처를 모두 제거할 것.
 *
 * 문제: DeckChair 머티리얼의 KHR_materials_specular.specularTexture가
 *       이미지 소스가 없는 빈 텍스처 정의(texture[24])를 참조함.
 *       Three.js GLTFLoader가 json.images[undefined].uri 를 읽으려다 TypeError 발생.
 *
 * 우회: GLB 바이너리의 JSON 청크를 메모리에서 수정해 문제 참조를 제거한 뒤 파싱.
 * 제거 시 체크리스트:
 *   - 이 파일 삭제
 *   - stage3IslandTemplatePreload.js 에서 import 및 분기 제거
 */

import { getGLBLoader } from "../../common/assetLoaders.js";
import { resolvePublicAssetUrl } from "../../common/gltfTemplateCache.js";

/** @type {Promise<import('three/examples/jsm/loaders/GLTFLoader').GLTF> | null} */
let _cachedPromise = null;

/**
 * GLB JSON 청크에서 DeckChair의 빈 specularTexture 참조를 제거한다.
 * @param {ArrayBuffer} buffer
 * @returns {ArrayBuffer}
 */
function patchGlbBuffer(buffer) {
  // GLB 구조: [header 12B][JSON chunk header 8B][JSON data][BIN chunk ...]
  const view = new DataView(buffer);
  const jsonChunkLen = view.getUint32(12, true);
  const jsonData = new Uint8Array(buffer, 20, jsonChunkLen);
  const json = JSON.parse(new TextDecoder().decode(jsonData));

  const mat = json.materials?.find((m) => m.name === "DeckChair");
  if (mat?.extensions?.KHR_materials_specular?.specularTexture) {
    delete mat.extensions.KHR_materials_specular.specularTexture;
  }

  // JSON 재인코딩 + 4바이트 정렬 (GLB 스펙: space 0x20 패딩)
  let newJsonStr = JSON.stringify(json);
  while (newJsonStr.length % 4 !== 0) newJsonStr += " ";
  const newJsonBytes = new TextEncoder().encode(newJsonStr);
  const newJsonLen = newJsonBytes.length;

  // BIN 청크 (JSON 청크 바로 뒤)
  const binStart = 20 + jsonChunkLen;
  const binSize = buffer.byteLength - binStart;

  const newTotal = 12 + 8 + newJsonLen + binSize;
  const out = new ArrayBuffer(newTotal);
  const outView = new DataView(out);
  const outBytes = new Uint8Array(out);

  // 헤더 복사 (magic + version)
  outBytes.set(new Uint8Array(buffer, 0, 8));
  outView.setUint32(8, newTotal, true); // 새 전체 길이
  outView.setUint32(12, newJsonLen, true); // JSON 청크 길이
  outView.setUint32(16, 0x4e4f534a, true); // "JSON"
  outBytes.set(newJsonBytes, 20);
  if (binSize > 0) {
    outBytes.set(new Uint8Array(buffer, binStart), 20 + newJsonLen);
  }

  return out;
}

/**
 * fountain GLB를 패치 후 파싱한다. 결과는 모듈 레벨에서 캐싱.
 * @param {string} modelPath - config.model.path (예: '/models/stage3/scene_with_fountain_v6.glb')
 * @returns {Promise<import('three/examples/jsm/loaders/GLTFLoader').GLTF>}
 */
export function loadFountainGltfPatched(modelPath) {
  if (_cachedPromise) return _cachedPromise;

  const url = resolvePublicAssetUrl(modelPath);
  const basePath = url.substring(0, url.lastIndexOf("/") + 1);

  _cachedPromise = fetch(url)
    .then((res) => {
      if (!res.ok) throw new Error(`fountain GLB fetch failed: ${res.status}`);
      return res.arrayBuffer();
    })
    .then((buf) =>
      getGLBLoader().parseBufferAsync(patchGlbBuffer(buf), basePath),
    )
    .catch((err) => {
      _cachedPromise = null;
      throw err;
    });

  return _cachedPromise;
}
