/**
 * 체험 완료 후 시작 화면으로 복귀할 때: 다음 이용자를 위해 클라이언트 측 저장소·캐시를 비운다.
 * (서버 상태는 `postMonitorComplete`로 이미 idle 처리)
 */

import { clearGltfTemplateCache } from "./gltfTemplateCache.js";

/**
 * 현재 문서에 설정된 쿠키를 만료시킨다(도메인/경로 제약으로 일부만 지워질 수 있음).
 */
function clearCookiesForCurrentDocument() {
  if (typeof document === "undefined") return;
  const raw = document.cookie;
  if (!raw) return;
  const names = raw.split(";").map((part) => {
    const i = part.indexOf("=");
    return (i === -1 ? part : part.slice(0, i)).trim();
  });
  const expire = "Thu, 01 Jan 1970 00:00:00 GMT";
  for (const name of names) {
    if (!name) continue;
    document.cookie = `${name}=;expires=${expire};path=/`;
  }
}

/**
 * Cache Storage API에 등록된 캐시를 모두 삭제한다(PWA/서비스워커 사용 시).
 * @returns {Promise<void>}
 */
async function clearCachesStorage() {
  const c = typeof globalThis !== "undefined" ? globalThis.caches : undefined;
  if (!c || typeof c.keys !== "function") {
    return;
  }
  const keys = await c.keys();
  await Promise.all(keys.map((key) => c.delete(key)));
}

/**
 * @returns {Promise<void>}
 */
export async function resetClientForNextKioskVisitor() {
  try {
    globalThis.sessionStorage?.clear();
  } catch (err) {
    console.warn("[resetClientForNextKioskVisitor] sessionStorage:", err);
  }

  try {
    globalThis.localStorage?.clear();
  } catch (err) {
    console.warn("[resetClientForNextKioskVisitor] localStorage:", err);
  }

  try {
    clearCookiesForCurrentDocument();
  } catch (err) {
    console.warn("[resetClientForNextKioskVisitor] cookies:", err);
  }

  try {
    clearGltfTemplateCache();
  } catch (err) {
    console.warn("[resetClientForNextKioskVisitor] GLTF cache:", err);
  }

  try {
    await clearCachesStorage();
  } catch (err) {
    console.warn("[resetClientForNextKioskVisitor] Cache API:", err);
  }
}
